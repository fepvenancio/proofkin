#!/usr/bin/env python3
"""Mutation testing for the contracts.

Applies one deliberate bug at a time to a source file, runs the test layers that should catch it, and
reports any mutant that survives. Sources are restored afterwards, even on Ctrl-C.

    python3 tools/mutate.py vm         # VM.sol / Puzzles.sol, judged by the differential suite alone
    python3 tools/mutate.py renderer   # Renderer.sol, judged by its Solidity tests and the TS SVG check

Exit status is 1 if a mutant survives or a snapshot did not restore byte-for-byte.
"""

import glob
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def stage(label, cmd, env=None, kills=True):
    """One command run per mutant. `kills=False` marks a setup step whose failure is not a kill."""
    return {"label": label, "cmd": cmd, "env": env or {}, "kills": kills}


SUITES = {
    # Judged by the differential suite alone, so a kill proves the TS-generated fixtures have teeth
    # rather than the hand-written unit tests.
    "vm": {
        "stages": [stage("differential", "forge test --match-path contracts/test/Differential.t.sol")],
        "mutations": [
            ("SUB allows equal operands (x<=y)", "contracts/src/VM.sol", "if (x < y) return (false, 0);", "if (x <= y) return (false, 0);"),
            ("AND becomes bitwise", "contracts/src/VM.sol", "v = x != 0 && y != 0 ? 1 : 0;", "v = x & y;"),
            ("DIV rounds up", "contracts/src/VM.sol", "v = x / y;", "v = (x + y - 1) / y;"),
            ("uint32 max itself treated as overflow", "contracts/src/VM.sol", "ok = v <= MAX_VALUE;", "ok = v < MAX_VALUE;"),
            (
                "operand check before unused-field check",
                "contracts/src/VM.sol",
                "                if (c != 0) revert UnusedFieldNotZero(i);\n                if (a >= i || b >= i) revert OperandNotEarlier(i);",
                "                if (a >= i || b >= i) revert OperandNotEarlier(i);\n                if (c != 0) revert UnusedFieldNotZero(i);",
            ),
            ("SEL c operand not marked live", "contracts/src/VM.sol", "if (op == SEL) live |= uint256(1) << uint8(program[off + 3]);", ""),
            ("MEDIAN5 descending edge case off by one", "contracts/src/Puzzles.sol", "x[i] = first ? 128 : 200 - 50 * i;", "x[i] = first ? 128 : 201 - 50 * i;"),
            ("random range off by one (hi - lo)", "contracts/src/Puzzles.sol", "% (hi - lo + 1);", "% (hi - lo);"),
            ("GRID_PATH vertical edge offset wrong", "contracts/src/Puzzles.sol", "x[6 + 3 * (r - 1) + c]", "x[5 + 3 * (r - 1) + c]"),
            (
                "guard: fixture has rows beyond the chunks",
                "contracts/test/Differential.t.sol",
                '_assertNothingAfter(".valid", 8 * VALID_CHUNK);',
                '_assertNothingAfter(".valid", 7 * VALID_CHUNK);',
            ),
        ],
    },
    # Each mutant regenerates the snapshots, then both the Solidity unit tests and the TS structural
    # check (which recomputes the layout in floating point) get a chance to catch it.
    "renderer": {
        "stages": [
            stage("solidity-unit", "forge test --match-contract RendererTest"),
            stage("regenerate snapshots", "forge test --match-contract RendererSnapshotTest", {"UPDATE_SNAPSHOTS": "true"}, kills=False),
            stage("ts-structure", "pnpm --filter @proofkin/vm exec vitest run test/renders.test.ts"),
        ],
        "restore": [stage("regenerate snapshots", "forge test --match-contract RendererSnapshotTest", {"UPDATE_SNAPSHOTS": "true"}, kills=False)],
        "fingerprint": "fixtures/renders/*.svg",
        "mutations": [
            ("control point pulled 40% not 30%", "contracts/src/Renderer.sol", "(7 * (x1 + x2) + 1810) / 20", "(6 * (x1 + x2) + 2410) / 20"),
            ("ring spacing 240/(layers+1)", "contracts/src/Renderer.sol", "uint256 spacing = 240 / layers;\n        l.x", "uint256 spacing = 240 / (layers + 1);\n        l.x"),
            ("sine table entry corrupted (+5%)", "contracts/src/Renderer.sol", "1190126a", "1390126a"),
            ("input dot radius s/2 not (s+1)/2", "contracts/src/Renderer.sol", "family == INPUT ? (s + 1) / 2 : s", "family == INPUT ? s / 2 : s"),
            ("EQ classed as logic, not compare", "contracts/src/Renderer.sol", "if (op <= VM.EQ) return COMPARE;", "if (op <= VM.LT) return COMPARE;"),
            (
                "ring directions swapped",
                "contracts/src/Renderer.sol",
                'd % 2 == 0 ? (bytes("0"), bytes("360")) : (bytes("360"), bytes("0"))',
                'd % 2 == 1 ? (bytes("0"), bytes("360")) : (bytes("360"), bytes("0"))',
            ),
            ("seed offset scaled x8 instead of x16", "contracts/src/Renderer.sol", "uint256(uint8(seed[d % 32])) * 16", "uint256(uint8(seed[d % 32])) * 8"),
        ],
    },
}


def sh(cmd, env=None):
    return subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True, env={**os.environ, **(env or {})})


def fingerprint(pattern):
    h = hashlib.sha256()
    for f in sorted(glob.glob(str(ROOT / pattern))):
        h.update(Path(f).read_bytes())
    return h.hexdigest()[:12]


def main(name):
    suite = SUITES[name]
    files = sorted({m[1] for m in suite["mutations"]})
    backup = Path(tempfile.mkdtemp(prefix="proofkin-mutate-"))
    for f in files:
        dest = backup / f
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / f, dest)
    before = fingerprint(suite["fingerprint"]) if "fingerprint" in suite else None

    survivors = []
    try:
        for label, f, old, new in suite["mutations"]:
            path = ROOT / f
            text = path.read_text()
            if text.count(old) != 1:
                sys.exit(f"{label}: pattern found {text.count(old)} times in {f}, expected exactly 1")
            path.write_text(text.replace(old, new))
            try:
                caught = []
                for s in suite["stages"]:
                    failed = sh(s["cmd"], s["env"]).returncode != 0
                    if failed and s["kills"]:
                        caught.append(s["label"])
                print(f"{'KILLED  ' if caught else 'SURVIVED'} {label:48s} caught by: {', '.join(caught) or '-'}")
                if not caught:
                    survivors.append(label)
            finally:
                shutil.copy(backup / f, path)
    finally:
        for f in files:
            shutil.copy(backup / f, ROOT / f)
        for s in suite.get("restore", []):
            sh(s["cmd"], s["env"])
        shutil.rmtree(backup, ignore_errors=True)

    ok = not survivors
    if before is not None:
        after = fingerprint(suite["fingerprint"])
        print(f"snapshots restored identically: {before == after} ({before} -> {after})")
        ok = ok and before == after
    print("survivors:", survivors or "none")
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in SUITES:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
