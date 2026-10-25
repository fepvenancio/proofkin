#!/usr/bin/env python3
"""Mutation testing for the contracts.

Applies one deliberate bug at a time to a source file, runs the test layers that should catch it, and
reports any mutant that survives. Sources are restored afterwards, even on Ctrl-C.

    python3 tools/mutate.py vm         # VM.sol / Puzzles.sol, judged by the differential suite alone
    python3 tools/mutate.py renderer   # Renderer.sol, judged by its Solidity tests and the TS SVG check
    python3 tools/mutate.py proofkin   # Proofkin.sol, judged by its unit, admin and invariant tests
    python3 tools/mutate.py core       # packages/core: the mint flow, phases, gate, storage, gallery decoding, local test
    python3 tools/mutate.py playground # the playground's wallet connection and the launch dry run
    python3 tools/mutate.py web        # packages/web: its configuration, components and architecture rules
    python3 tools/mutate.py deploy     # contracts/script/Deploy.s.sol, judged by its tests
    python3 tools/mutate.py launch     # packages/core/src/launch: the console's deployment flow, judged by tests on a real chain

Extra arguments keep only the mutations whose label contains one of them (case-insensitive), to re-run
a few survivors without the whole suite:

    python3 tools/mutate.py proofkin "too small" "first output"

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
            ("QUORUM7 edge cases back to the old pair", "contracts/src/Puzzles.sol", "x[7] = first ? 1 : 7;", "x[7] = first ? 7 : 1;"),
            ("QUORUM7 further cases never run", "contracts/src/Puzzles.sol", "if (id == QUORUM7) return TRIALS + 8;", "if (id == QUORUM7) return TRIALS;"),
            ("MEDIAN5 further cases never run", "contracts/src/Puzzles.sol", "if (id == MEDIAN5) return TRIALS + 3;", "if (id == MEDIAN5) return TRIALS;"),
            ("QUORUM7 single-voter case asks the wrong voter", "contracts/src/Puzzles.sol", "                x[k] = 1;\n                x[7] = 1;", "                x[0] = 1;\n                x[7] = 1;"),
            ("QUORUM7 near miss is not one short", "contracts/src/Puzzles.sol", "                x[7] = 7;\n            }\n            return;", "                x[7] = 6;\n            }\n            return;"),
            ("MEDIAN5 further shuffle changed", "contracts/src/Puzzles.sol", 'hex"287850a0c8"', 'hex"287850a0c9"'),
            ("SORT8 further cases never run", "contracts/src/Puzzles.sol", "if (id == SORT8) return TRIALS + 2;", "if (id == SORT8) return TRIALS;"),
            ("last GRID_PATH / KNAPSACK3 case dropped", "contracts/src/Puzzles.sol", "if (id == GRID_PATH || id == KNAPSACK3) return TRIALS + 6;", "if (id == GRID_PATH || id == KNAPSACK3) return TRIALS + 5;"),
            ("trials past a puzzle's own are fixed too", "contracts/src/Puzzles.sol", "(trial >= TRIALS && trial < trialCount(id))", "(trial >= TRIALS)"),
            ("GRID_PATH further case follows the wrong edge", "contracts/src/Puzzles.sol", 'hex"0001080b"', 'hex"0001080a"'),
            ("KNAPSACK3 further case off by one", "contracts/src/Puzzles.sol", 'hex"0a320a140a1e0a"', 'hex"0a320a140a1e0b"'),
            ("SORT8 further permutation changed", "contracts/src/Puzzles.sol", 'hex"004060a020c080e0"', 'hex"004060a020c0e080"'),
            (
                "guard: fixture has rows beyond the chunks",
                "contracts/test/Differential.t.sol",
                '_assertNothingAfter(".valid", 8 * VALID_CHUNK);',
                '_assertNothingAfter(".valid", 7 * VALID_CHUNK);',
            ),
        ],
    },
    # Proofkin.sol: every mutant is run against the three test layers separately, to see which one
    # notices (an invariant that only the invariants catch is worth knowing about).
    "proofkin": {
        "stages": [
            stage("unit", "forge test --match-path contracts/test/Proofkin.t.sol"),
            stage("admin", "forge test --match-path contracts/test/ProofkinAdmin.t.sol"),
            stage("invariants", "forge test --match-path contracts/test/Proofkin.invariants.t.sol"),
            stage("cheats", "forge test --match-path contracts/test/Cheats.t.sol"),
        ],
        "mutations": [
            ("commit may overwrite a commit", "contracts/src/Proofkin.sol", "        if (commitBlock[h] != 0) revert AlreadyCommitted();\n", ""),
            ("commit hash ignores msg.sender", "contracts/src/Proofkin.sol", "bytes32 h = keccak256(abi.encode(program, msg.sender, salt));", "bytes32 h = keccak256(abi.encode(program, salt));"),
            ("window opens one block early", "contracts/src/Proofkin.sol", "if (block.number <= committedAt + REVEAL_DELAY) revert TooEarly();", "if (block.number < committedAt + REVEAL_DELAY) revert TooEarly();"),
            ("window closes one block early", "contracts/src/Proofkin.sol", "if (block.number > committedAt + REVEAL_WINDOW) revert Expired();", "if (block.number >= committedAt + REVEAL_WINDOW) revert Expired();"),
            ("window never closes", "contracts/src/Proofkin.sol", "        if (block.number > committedAt + REVEAL_WINDOW) revert Expired();\n", ""),
            ("zero blockhash accepted", "contracts/src/Proofkin.sol", "        if (blockHash == bytes32(0)) revert NoBlockhash();\n", ""),
            ("seed ignores the commit hash", "contracts/src/Proofkin.sol", "return keccak256(abi.encode(blockHash, h));", "return blockHash;"),
            ("seed uses the latest block, not commit + 2", "contracts/src/Proofkin.sol", "bytes32 blockHash = blockhash(committedAt + REVEAL_DELAY);", "bytes32 blockHash = blockhash(block.number - 1);"),
            ("overpaying accepted", "contracts/src/Proofkin.sol", "if (msg.value != mintPrice) revert WrongPayment();", "if (msg.value < mintPrice) revert WrongPayment();"),
            ("underpaying accepted", "contracts/src/Proofkin.sol", "if (msg.value != mintPrice) revert WrongPayment();", "if (msg.value > mintPrice) revert WrongPayment();"),
            ("a program can be minted twice", "contracts/src/Proofkin.sol", "        if (seen[programHash]) revert AlreadyMinted();\n", ""),
            ("program never marked seen", "contracts/src/Proofkin.sol", "        seen[programHash] = true;\n", ""),
            ("51st solution accepted", "contracts/src/Proofkin.sol", "if (solvedCount[puzzleId] >= SLOTS) revert PuzzleFull();", "if (solvedCount[puzzleId] > SLOTS) revert PuzzleFull();"),
            ("only two trials checked", "contracts/src/Proofkin.sol", "uint256 trials = Puzzles.trialCount(puzzleId);", "uint256 trials = 2;"),
            ("the further fixed trials are never run", "contracts/src/Proofkin.sol", "uint256 trials = Puzzles.trialCount(puzzleId);", "uint256 trials = Puzzles.TRIALS;"),
            ("outputs too SMALL pass the check", "contracts/src/Proofkin.sol", "if (a[i] != b[i]) return false;", "if (a[i] > b[i]) return false;"),
            ("outputs too LARGE pass the check", "contracts/src/Proofkin.sol", "if (a[i] != b[i]) return false;", "if (a[i] < b[i]) return false;"),
            ("only the first output is compared", "contracts/src/Proofkin.sol", "for (uint256 i; i < a.length; ++i) {\n            if (a[i] != b[i]) return false;", "for (uint256 i; i < 1; ++i) {\n            if (a[i] != b[i]) return false;"),
            ("program is not validated", "contracts/src/Proofkin.sol", "        VM.validate(p);\n", ""),
            ("commit not cleared by reveal", "contracts/src/Proofkin.sol", "        delete commitBlock[h];\n", ""),
            ("rank is zero-based", "contracts/src/Proofkin.sol", "uint16 rank = uint16(++solvedCount[puzzleId]);", "uint16 rank = uint16(solvedCount[puzzleId]++);"),
            ("equal size counts as a record", "contracts/src/Proofkin.sol", "bool recordAtMint = nodeCount < bestNodes[puzzleId];", "bool recordAtMint = nodeCount <= bestNodes[puzzleId];"),
            ("bestNodes starts at 254", "contracts/src/Proofkin.sol", "            bestNodes[p] = 255;", "            bestNodes[p] = 254;"),
            ("depth is not recorded", "contracts/src/Proofkin.sol", "            if (nodeDepth > deepest) deepest = nodeDepth;\n", ""),
            ("token ids start at 0", "contracts/src/Proofkin.sol", "uint256 id = ++totalSupply;", "uint256 id = totalSupply++;"),
            ("_safeMint instead of _mint", "contracts/src/Proofkin.sol", "        _mint(msg.sender, id);\n", "        _safeMint(msg.sender, id);\n"),
            ("token minted to the owner", "contracts/src/Proofkin.sol", "        _mint(msg.sender, id);\n", "        _mint(owner(), id);\n"),
            ("Solved names the wrong author", "contracts/src/Proofkin.sol", "emit Solved(id, uint8(puzzleId), msg.sender, nodeCount, rank);", "emit Solved(id, uint8(puzzleId), owner(), nodeCount, rank);"),
            ("tokenURI of a missing token", "contracts/src/Proofkin.sol", "        if (!_exists(id)) revert TokenDoesNotExist();\n", ""),
            ("setRenderer ignores the lock", "contracts/src/Proofkin.sol", "        if (rendererLocked) revert RendererLocked();\n", ""),
            ("lockRenderer does not lock", "contracts/src/Proofkin.sol", "        rendererLocked = true;\n", "        rendererLocked = false;\n"),
            ("anyone can lock the renderer", "contracts/src/Proofkin.sol", "function lockRenderer() external onlyOwner {", "function lockRenderer() external {"),
            ("anyone can set the renderer", "contracts/src/Proofkin.sol", "function setRenderer(address renderer_) external onlyOwner {", "function setRenderer(address renderer_) external {"),
            ("anyone can withdraw", "contracts/src/Proofkin.sol", "function withdraw() external onlyOwner {", "function withdraw() external {"),
            ("renderer may be zero", "contracts/src/Proofkin.sol", "        if (renderer_ == address(0)) revert InvalidRenderer();\n", ""),
        ],
    },
    # The deploy script, judged by its tests. What no test can see is the `vm.startBroadcast()` pair: in a test it
    # sends nothing, so deleting it changes nothing there. The local-chain rehearsal in docs/M5-notes.md is what
    # shows the script really sends its two transactions.
    "deploy": {
        "stages": [stage("deploy tests", "forge test --match-path contracts/test/Deploy.t.sol")],
        "mutations": [
            ("a zero owner is accepted", "contracts/script/Deploy.s.sol", "        if (owner == address(0)) revert OwnerRequired();\n", ""),
            ("any chain is accepted", "contracts/script/Deploy.s.sol", "if (block.chainid != LOCAL && block.chainid != BASE_SEPOLIA && block.chainid != BASE) {", "if (false) {"),
            ("the local chain is refused", "contracts/script/Deploy.s.sol", "block.chainid != LOCAL && block.chainid != BASE_SEPOLIA", "block.chainid != BASE_SEPOLIA"),
            ("Base Sepolia is refused", "contracts/script/Deploy.s.sol", "block.chainid != LOCAL && block.chainid != BASE_SEPOLIA", "block.chainid != LOCAL"),
            ("Base mainnet needs no confirmation", "contracts/script/Deploy.s.sol", "        if (block.chainid == BASE && !mainnetConfirmed) revert MainnetNotConfirmed();\n", ""),
            ("any confirmation text counts", "contracts/script/Deploy.s.sol", 'confirmation == keccak256("yes")', 'confirmation != keccak256("")'),
            ("the launch price changes", "contracts/script/Deploy.s.sol", "MINT_PRICE = 0.01 ether;", "MINT_PRICE = 0.1 ether;"),
            ("the sender becomes the owner", "contracts/script/Deploy.s.sol", "new Proofkin(owner, address(renderer), MINT_PRICE)", "new Proofkin(msg.sender, address(renderer), MINT_PRICE)"),
            ("the collection reads another renderer", "contracts/script/Deploy.s.sol", "new Proofkin(owner, address(renderer), MINT_PRICE)", "new Proofkin(owner, address(1), MINT_PRICE)"),
            ("the owner variable is misnamed", "contracts/script/Deploy.s.sol", '"PROOFKIN_OWNER"', '"OWNER"'),
            ("the confirmation variable is misnamed", "contracts/script/Deploy.s.sol", '"PROOFKIN_CONFIRM_MAINNET"', '"CONFIRM_MAINNET"'),
            ("Base Sepolia is printed under another name", "contracts/script/Deploy.s.sol", '"baseSepolia"', '"sepolia"'),
            ("the playground block loses its prefix underscore", "contracts/script/Deploy.s.sol", '"VITE_"', '"VITE"'),
            ("the Next.js block loses its prefix underscore", "contracts/script/Deploy.s.sol", '"NEXT_PUBLIC_"', '"NEXT_PUBLIC"'),
            ("the printed block number is the chain id", "contracts/script/Deploy.s.sol", "vm.toString(fromBlock)", "vm.toString(chainId)"),
            ("the printed renderer is the collection", "contracts/script/Deploy.s.sol", "vm.toString(renderer)", "vm.toString(proofkin)"),
        ],
    },
    # The logic the apps share (packages/core): the mint flow, phases, gate, storage, gallery decoding, the local test.
    # Judged by core's own tests, which run the real contracts on Anvil.
    "core": {
        "stages": [stage("core tests", "pnpm --filter @proofkin/core test")],
        "mutations": [
            ("an ordinal says 11st, 12nd and 13rd", "packages/core/src/format.ts", "if (rest >= 11 && rest <= 13) return `${n}th`;", ""),
            ('a connecting wallet is asked to connect', 'packages/core/src/mintGate.ts', '  if (i.wallet === "connecting") return no("Connecting to your wallet…");\n  if (i.wallet !== "connected") return no("Connect a wallet to mint.");', '  if (i.wallet !== "connected") return no("Connect a wallet to mint.");'),
            ('any account may reveal', 'packages/core/src/mintGate.ts', 'if (i.account?.toLowerCase() !== i.committedBy.toLowerCase()) {', 'if (false) {'),
            ('an account in another letter case is another account', 'packages/core/src/mintGate.ts', 'i.account?.toLowerCase() !== i.committedBy.toLowerCase()', 'i.account !== i.committedBy'),
            ('a step is sent on the wrong network', 'packages/core/src/mintGate.ts', '  if (i.network !== "right") return no("Switch your wallet to the right network.");\n  if (i.account', '  if (i.account'),
            ('a revealed mint is read from the block', 'packages/core/src/mintStep.ts', 'if (pending.status === "revealed") return { step: "revealed", tokenId: pending.tokenId };\n', ''),
            ('a closed window is called ready', 'packages/core/src/mintStep.ts', 'return { step: "expired" };\n}', 'return { step: "ready", blocksLeft: 0 };\n}'),
            ("an owner's error is no longer listed as off the mint path", 'packages/core/src/mint.ts', '  "Unauthorized",\n', ''),
            ("a minter's error is also listed as off the mint path", 'packages/core/src/mint.ts', '  "Unauthorized",\n', '  "Unauthorized",\n  "WrongPayment",\n'),
            ("window opens a block early", "packages/core/src/phase.ts", "if (currentBlock <= commitBlock + REVEAL_DELAY) {", "if (currentBlock < commitBlock + REVEAL_DELAY) {"),
            ("expiry measured against block.number, not the inclusion block", "packages/core/src/phase.ts", "if (currentBlock >= commitBlock + REVEAL_WINDOW) return", "if (currentBlock > commitBlock + REVEAL_WINDOW) return"),
            ("countdown off by one", "packages/core/src/phase.ts", "blocksLeft: commitBlock + REVEAL_WINDOW - 1 - currentBlock", "blocksLeft: commitBlock + REVEAL_WINDOW - currentBlock"),
            ("commit hash drops the sender", "packages/core/src/commitment.ts", "[{ type: \"bytes\" }, { type: \"address\" }, { type: \"bytes32\" }], [toHex(program), sender, salt]", "[{ type: \"bytes\" }, { type: \"bytes32\" }], [toHex(program), salt]"),
            ("program hash skips a byte", "packages/core/src/commitment.ts", "return keccak256(toHex(program));", "return keccak256(`0x${toHex(program).slice(4)}` as Hex);"),
            ("salt not saved before the commit is sent", "packages/core/src/mint.ts", "  deps.store.save(pending);\n  return pending;\n}", "  return pending;\n}"),
            ("commit result not recorded", "packages/core/src/mint.ts", "  deps.store.save(next);\n  return next;\n}\n\n/** A commit that landed", "  return next;\n}\n\n/** A commit that landed"),
            ("no guard against an expired window", "packages/core/src/mint.ts", "  if ((await phaseOf(deps, pending)).phase === \"expired\") throw new MintError(EXPIRED);\n", ""),
            ("reveal sends the wrong payment", "packages/core/src/mint.ts", "    value: mintPrice,", "    value: 0n,"),
            ("reconcile trusts a commit that never landed", "packages/core/src/mint.ts", "if (block === 0) return pending;", "if (block === 0) return { ...pending, status: \"committed\" };"),
            ("edge case threshold off by one in the message", "packages/core/src/mint.ts", "trial < 2 || trial >= TRIALS", "trial <= 2 || trial >= TRIALS"),
            ("further fixed trials reported as random", "packages/core/src/mint.ts", "trial < 2 || trial >= TRIALS", "trial < 2 || trial > TRIALS"),
            ("random cases numbered without skipping fixed trials", "packages/core/src/format.ts", "trial - fixed.filter((f) => f < trial).length + 1", "trial - 1"),
            ("local test skips the further fixed cases", "packages/core/src/localTest.ts", "const fixed = fixedTrials(puzzleId);", "const fixed = [0, 1];"),
            ("gate ignores a mint in progress", "packages/core/src/mintGate.ts", "  if (i.busy) return no(\"A mint is in progress, please wait.\");\n  if (i.analysis", "  if (i.analysis"),
            ("a step is sent while another is in progress", "packages/core/src/mintGate.ts", "  if (i.busy) return no(\"A mint is in progress, please wait.\");\n  if (i.wallet === \"none\")", "  if (i.wallet === \"none\")"),
            ("gate allows an already-minted program", "packages/core/src/mintGate.ts", "  if (i.onChain === \"alreadyMinted\") return no(\"This exact program has already been minted.\");\n", ""),
            ("saved commits matched case-sensitively", "packages/core/src/storage.ts", "p.account.toLowerCase() === filter.account.toLowerCase()", "p.account === filter.account"),
            ("a refused write still claims persistence", "packages/core/src/storage.ts", "    } catch {\n      this.persistent = false;\n    }", "    } catch {\n      // ignored\n    }"),
            ("block number served from cache", "packages/core/src/chain.ts", "client.getBlockNumber({ cacheTime: 0 })", "client.getBlockNumber()"),
            ("an already-minted program reported as free", "packages/core/src/chain.ts", "  if (seen) return \"alreadyMinted\";\n", ""),
            ("any image URL accepted in a token", "packages/core/src/gallery.ts", "if (typeof meta.image !== \"string\" || !meta.image.startsWith(SVG_PREFIX)) {", "if (typeof meta.image !== \"string\") {"),
            ("leaderboard ties not broken by order", "packages/core/src/gallery.ts", "a.nodeCount - b.nodeCount || a.rank - b.rank", "a.nodeCount - b.nodeCount"),
            ("local test goes back to plain trial order", "packages/core/src/localTest.ts", "for (const trial of order) {", "for (const trial of [...order].sort((a, b) => a - b)) {"),
            ("local test runs the fixed cases backwards", "packages/core/src/localTest.ts", "const order = [...fixed];", "const order = [...fixed].reverse();"),
            ("local test drops the fixed cases from the count", "packages/core/src/localTest.ts", "order.length < fixed.length + (opts.randomTrials", "order.length < (opts.randomTrials"),
            ("a zero block time accepted", "packages/core/src/config.ts", "if (!(blockTime > 0))", "if (blockTime < 0)"),
        ],
    },
    # The deployer's side of core: the contracts' code, what a launch may be, and the flow that sends it, judged by the
    # tests that deploy to a real chain.
    "launch": {
        "stages": [
            stage(
                "launch tests",
                "pnpm --filter @proofkin/core exec vitest run test/launch.test.ts test/deploy.test.ts test/deployGate.test.ts test/collectionAdmin.test.ts test/config.test.ts",
            )
        ],
        "mutations": [
            ('the price is written into one place only', 'packages/core/src/launch/code.ts', 'for (const { start, length } of proofkinImmutables) {', 'for (const { start, length } of proofkinImmutables.slice(0, 1)) {'),
            ('the price word is one byte short', 'packages/core/src/launch/code.ts', '{ size: 32 }', '{ size: 31 }'),
            ('the launch price is a tenth of an ether', 'packages/core/src/launch/plan.ts', 'parseEther("0.01")', 'parseEther("0.1")'),
            ('Base mainnet is not a chain it deploys to', 'packages/core/src/launch/plan.ts', '[foundry.id, baseSepolia.id, base.id] as const', '[foundry.id, baseSepolia.id] as const'),
            ('the settings print the collection unchecksummed', 'packages/core/src/launch/plan.ts', 'NEXT_PUBLIC_PROOFKIN=${getAddress(proofkin)}', 'NEXT_PUBLIC_PROOFKIN=${proofkin}'),
            ('the settings start reading a block late', 'packages/core/src/launch/plan.ts', 'NEXT_PUBLIC_DEPLOY_BLOCK=${deployBlock}', 'NEXT_PUBLIC_DEPLOY_BLOCK=${deployBlock + 1}'),
            ('the confirmation is five characters', 'packages/core/src/launch/plan.ts', 'address.slice(-6).toLowerCase()', 'address.slice(-5).toLowerCase()'),
            ('the confirmation is case-sensitive', 'packages/core/src/launch/plan.ts', 'typed.trim().toLowerCase() === confirmationTail(address)', 'typed.trim() === confirmationTail(address)'),
            ("the mainnet explorer is the testnet's", 'packages/core/src/launch/plan.ts', 'url: "https://base.blockscout.com/api/"', 'url: "https://base-sepolia.blockscout.com/api/"'),
            ('the constructor arguments name the renderer first', 'packages/core/src/launch/plan.ts', '${args.owner} ${args.renderer} ${LAUNCH_MINT_PRICE}', '${args.renderer} ${args.owner} ${LAUNCH_MINT_PRICE}'),
            ('a deployment in progress does not close the button', 'packages/core/src/launch/gate.ts', '  if (i.busy) return no("A deployment is in progress, please wait.");\n', ''),
            ('Base mainnet needs no confirmation', 'packages/core/src/launch/gate.ts', 'if (i.chainId === base.id && !i.resuming', 'if (false && !i.resuming'),
            ('a launch under way is asked to confirm again', 'packages/core/src/launch/gate.ts', ' && !i.resuming && !isConfirmed', ' && !isConfirmed'),
            ('an address with a wrong checksum is accepted', 'packages/core/src/launch/gate.ts', 'if (!isAddress(typed)) return', 'if (!isAddress(typed, { strict: false })) return'),
            ('the zero address is an owner', 'packages/core/src/launch/gate.ts', 'return address === zeroAddress ? { status: "zero" } : { status: "ok", address };', 'return { status: "ok", address };'),
            ('a deployment may name the zero address as owner', 'packages/core/src/launch/deploy.ts', 'if (owner === zeroAddress) {', 'if (false) {'),
            ('Base mainnet needs no confirmation in the flow', 'packages/core/src/launch/deploy.ts', 'if (chainId === base.id && input.mainnetConfirmed !== true) {', 'if (false) {'),
            ('any chain may be deployed to', 'packages/core/src/launch/deploy.ts', 'if (!(DEPLOY_CHAIN_IDS as readonly number[]).includes(chainId)) {', 'if (false) {'),
            ('a second launch may replace the record of the first', 'packages/core/src/launch/deploy.ts', 'if (deps.store.get(chainId, account)) {', 'if (false) {'),
            ('a transaction already sent is sent again', 'packages/core/src/launch/deploy.ts', '  let hash = sent;', '  let hash: Hex | undefined;'),
            ('a transaction hash is not kept before it is waited for', 'packages/core/src/launch/deploy.ts', '    remember(hash);\n', ''),
            ('a creation that would revert is sent anyway', 'packages/core/src/launch/deploy.ts', '    await deps.publicClient.estimateGas({ account: deps.walletClient.account, data });\n', ''),
            ("the renderer's code is not checked", 'packages/core/src/launch/deploy.ts', 'if (code?.toLowerCase() !== rendererRuntimeCode.toLowerCase()) {', 'if (false) {'),
            ('a collection that fails its check is called done', 'packages/core/src/launch/deploy.ts', 'if (!verdict.ok) throw new DeployError(verdict.problems.join(" "));', ''),
            ('the owner is not checked', 'packages/core/src/launch/deploy.ts', 'if (owner.toLowerCase() !== expected.owner.toLowerCase())', 'if (false)'),
            ('the renderer the collection points at is not checked', 'packages/core/src/launch/deploy.ts', 'if (renderer.toLowerCase() !== expected.renderer.toLowerCase()) {', 'if (false) {'),
            ("the collection's code is not checked", 'packages/core/src/launch/deploy.ts', '} else if (!same(proofkinCode, expectedProofkinRuntime(LAUNCH_MINT_PRICE))) {', '} else if (false) {'),
            ('another account may carry a launch on', 'packages/core/src/launch/deploy.ts', 'if (deps.walletClient.account.address.toLowerCase() !== pending.account.toLowerCase()) {', 'if (false) {'),
            ('another chain may carry a launch on', 'packages/core/src/launch/deploy.ts', 'if (deps.walletClient.chain.id !== pending.chainId) {', 'if (false) {'),
            ("the site starts reading at the renderer's block", 'packages/core/src/launch/deploy.ts', 'deployBlock: p.proofkinBlock };', 'deployBlock: p.rendererBlock ?? 0 };'),
            ("launches are kept by the account's letter case", 'packages/core/src/launch/deploy.ts', '${account.toLowerCase()}`;\n', '${account}`;\n'),
            ('the fees held are not read', 'packages/core/src/launch/status.ts', 'client.getBalance({ address: proofkin })', 'Promise.resolve(0n)'),
            ('a chain configuration with a bad block time is accepted', 'packages/core/src/config.ts', 'if (!name || problems.length > 0) return { ok: false, problems };', 'if (!name) return { ok: false, problems };'),
        ],
    },
    # The playground's own code: its wallet connection and the launch dry run, judged by its tests.
    "playground": {
        "stages": [stage("playground tests", "pnpm --filter @proofkin/playground test")],
        "mutations": [
            ("every wallet error treated as an unknown network", "packages/playground/src/wallet.ts", "    if (errorCode(e) !== UNKNOWN_CHAIN) throw e;\n", ""),
            ("dry run allowed on Base mainnet", "packages/playground/scripts/dry-run.ts", 'if (config.name === "base") {', "if (false) {"),
            ("dry run skips the balance check", "packages/playground/scripts/dry-run.ts", "if (balance < price * BigInt(mints)) {", "if (false) {"),
            ("dry run mints what is already minted", "packages/playground/scripts/dry-run.ts", 'if (status !== "free") {', "if (false) {"),
            ("dry run does not compare what it reads back", "packages/playground/scripts/dry-run.ts", 'if (trait("Puzzle") !== p.name || trait("Nodes") !== p.nodeCount) {', "if (false) {"),
            ("dry run never gives up on a stalled chain", "packages/playground/scripts/dry-run.ts", "if (waits >= MAX_WAITS)", "if (false)"),
        ],
    },
    # The web app's configuration, components and architecture rules, judged by its own tests.
    "web": {
        "stages": [stage("web tests", "pnpm --filter @proofkin/web test")],
        "mutations": [
            ("config reads the wrong prefix", "packages/web/src/config/env.ts", 'parseConfig(env, "NEXT_PUBLIC_")', 'parseConfig(env, "NEXT_PUBLIC")'),
            ("a blank WalletConnect id counts as an id", "packages/web/src/config/env.ts", "env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()", "env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"),
            ("a blank server RPC URL counts as a URL", "packages/web/src/config/env.ts", "env.RPC_URL?.trim()", "env.RPC_URL"),
            ("the server-only RPC URL is ignored", "packages/web/src/config/env.ts", "return url ? url : config.rpcUrl;", "return config.rpcUrl;"),
            ("only the first config problem is listed", "packages/web/src/config/env.ts", "result.problems.map((problem)", "result.problems.slice(0, 1).map((problem)"),
            ("wallet connectors start on the server", "packages/web/src/config/wagmi.ts", "connectors: server\n      ? []", "connectors: false\n      ? []"),
            ("WalletConnect is offered without a project id", "packages/web/src/config/wagmi.ts", "const wallets = projectId\n", "const wallets = true\n"),
            ("the wagmi config is not server-rendering", "packages/web/src/config/wagmi.ts", "ssr: true,", "ssr: false,"),
            ("an unsolved puzzle shows 255 nodes", "packages/web/src/components/CollectionSummary.tsx", "best === undefined || best === NO_SOLUTION_YET", "best === undefined"),
            ("only the first config problem is shown", "packages/web/src/components/ConfigProblems.tsx", "{problems.map((problem) => (", "{problems.slice(0, 1).map((problem) => ("),
            ("the server client loses its server-only marker", "packages/web/src/chain/server.ts", 'import "server-only";\n', ""),
            ("the checker stops at the first import", "packages/web/test/architecture.ts", "for (const next of localImports(current, text, code)) visit(next, [...path, current]);", ""),
            ("the checker lets the environment be read anywhere", "packages/web/test/architecture.ts", "file !== ENV_MODULE && /process\\.env/.test(bare)", "false"),
            ("the checker accepts a computed environment read", "packages/web/test/architecture.ts", "file === ENV_MODULE && /process\\.env(?!\\.[A-Z][A-Z0-9_]*\\b)/.test(bare)", "false"),
            ("the checker reads comments as code", "packages/web/test/architecture.ts", "const withoutComments = (source: string) => source.replace(TOKEN, (_all, literal?: string) => literal ?? \"\");", "const withoutComments = (source: string) => source;"),
            ("the server shares one wagmi configuration between requests", "packages/web/src/config/wagmi.ts", 'if (typeof window === "undefined") return create(true);', 'if (typeof window === "undefined") {\n    browserConfig ??= create(true);\n    return browserConfig;\n  }'),
            ("the browser builds a new wagmi configuration on every call", "packages/web/src/config/wagmi.ts", "browserConfig ??= create(false);", "browserConfig = create(false);"),
            ("the server gets the browser's wagmi connectors", "packages/web/src/config/wagmi.ts", "return create(true);", "return create(false);"),
            ("a failed collection read throws", "packages/web/src/chain/collection.ts", "    return undefined;\n", "    throw error;\n"),
            ("a failed collection read is not logged", "packages/web/src/chain/failure.ts", "console.error(`Could not read", "void (`Could not read"),
            ("the log leaves out the cause", "packages/web/src/chain/failure.ts", ": ${describeFailure(error)}`", "`"),
            ("the log carries viem's full message, with the URL", "packages/web/src/chain/failure.ts", '[error.shortMessage, error.details].filter(Boolean).join(" ")', "error.message"),
            ("the unavailable notice drops the chain name", "packages/web/src/components/CollectionUnavailable.tsx", "Could not reach {chainName} right now", "Could not reach the chain right now"),
            ("the unavailable notice is not a status", "packages/web/src/components/CollectionUnavailable.tsx", '<p role="status">', "<p>"),
            ("the home page names the public RPC URL when it cannot read", "packages/web/src/app/(site)/page.tsx", "<CollectionUnavailable chainName={app.chain.name} />", '<p role="status">Could not reach {app.rpcUrl} right now.</p>'),
            ("the home page never reads the chain", "packages/web/src/app/(site)/page.tsx", "const site = await getSite(app);", "const site = undefined;"),
            ('a puzzle slug keeps its underscore', 'packages/web/src/config/routes.ts', '.replaceAll("_", "-")', '.replaceAll("_", "_")'),
            ('a token id of zero is accepted', 'packages/web/src/config/routes.ts', '/^[1-9]\\d{0,8}$/', '/^\\d{1,9}$/'),
            ("a token above the collection's capacity is accepted", 'packages/web/src/config/routes.ts', "return id <= bound ? id : undefined;", "return id;"),
            ("the gallery's page count rounds down", 'packages/web/src/config/routes.ts', 'Math.ceil(total / PAGE_SIZE)', 'Math.floor(total / PAGE_SIZE)'),
            ('a page of the gallery starts one plate late', 'packages/web/src/config/routes.ts', 'list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)', 'list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)'),
            ('the first page is spelled in the address', 'packages/web/src/config/routes.ts', 'if (page > 1) params.set', 'if (page > 0) params.set'),
            ('a section matches any path that starts the same', 'packages/web/src/config/routes.ts', 'pathname === root || pathname.startsWith(`${root}/`)', 'pathname.startsWith(root)'),
            ('the cache keeps an answer an hour', 'packages/web/src/chain/cache.ts', 'CACHE_SECONDS = 60', 'CACHE_SECONDS = 3600'),
            ('the cache key leaves out the chain', 'packages/web/src/chain/cache.ts', 'String(app.chain.id), app.proofkin', 'app.proofkin'),
            ('the cache key leaves out the collection', 'packages/web/src/chain/cache.ts', 'String(app.chain.id), app.proofkin', 'String(app.chain.id)'),
            ('the history is thought complete when solutions are missing', 'packages/web/src/chain/solved.ts', 'if (found >= totalSupply) return undefined;', 'return undefined;'),
            ('the owner of the wrong token is read', 'packages/web/src/chain/token.ts', 'args: [BigInt(id)]', 'args: [BigInt(id + 1)]'),
            ('any failure is a missing token', 'packages/web/src/chain/failure.ts', 'if (isMissingToken(error)) return', 'if (true) return'),
            ('any revert is a missing token', 'packages/web/src/chain/failure.ts', 'reverted.data?.errorName === "TokenDoesNotExist"', 'true'),
            ('the server client stops batching', 'packages/web/src/chain/server.ts', '{ batch: true }', '{ batch: false }'),
            ('art with a script is served', 'packages/web/src/chain/art.ts', 'script|foreignObject', 'scriptx|foreignObject'),
            ('art with an event handler is served', 'packages/web/src/chain/art.ts', '/\\bon[a-z]+\\s*=/i', '/\\bonx[a-z]+\\s*=/i'),
            ('art that paints from elsewhere is served', 'packages/web/src/chain/art.ts', '/url\\(\\s*(?![\'"]?#)/i', '/url\\(\\s*(?!)/i'),
            ('art that is not a whole document is served', 'packages/web/src/chain/art.ts', '!document.startsWith("<svg") || !document.endsWith("</svg>")', 'false'),
            ('the art route keeps a missing token an hour', 'packages/web/src/app/(site)/token/[id]/art/route.ts', '"public, max-age=5, s-maxage=5"', '"public, max-age=3600, s-maxage=3600"'),
            ('the art route lets a browser sniff its type', 'packages/web/src/app/(site)/token/[id]/art/route.ts', '"x-content-type-options": "nosniff",', ''),
            ('the art route drops its policy', 'packages/web/src/app/(site)/token/[id]/art/route.ts', "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'default-src *'),
            ('the art route keeps a failure', 'packages/web/src/app/(site)/token/[id]/art/route.ts', 'cache = "no-store"', 'cache = "public, max-age=3600"'),
            ('every token is marked smallest so far', 'packages/web/src/components/PlateGrid.tsx', 'entry.nodeCount === bestNodes[entry.puzzleId] &&', 'true &&'),
            ('the slot strip fills one slot too many', 'packages/web/src/components/SlotStrip.tsx', 'rank > filled ? "empty"', 'rank > filled + 1 ? "empty"'),
            ('the slot strip rings the wrong slot', 'packages/web/src/components/SlotStrip.tsx', 'records.has(rank)', 'records.has(rank + 1)'),
            ('the slot strip is read as 50 pictures', 'packages/web/src/components/SlotStrip.tsx', 'role="img"', 'role="presentation"'),
            ('an unsolved puzzle shows 255 as its smallest', 'packages/web/src/components/PuzzleRow.tsx', 'best === NO_SOLUTION_YET ? undefined : best', 'best'),
            ('every leaderboard row holds the record', 'packages/web/src/components/LeaderboardTable.tsx', 'entry.holdsRecord && (', 'true && ('),
            ('the leaderboard shows solve order in cardinals', 'packages/web/src/components/LeaderboardTable.tsx', '{ordinal(entry.rank)}', '{entry.rank}'),
            ('the pager shows on a single page', 'packages/web/src/components/Pager.tsx', 'if (pages <= 1) return null;', 'if (pages < 1) return null;'),
            ("the pager's Newer goes the wrong way", 'packages/web/src/components/Pager.tsx', 'to(query.page - 1)', 'to(query.page + 1)'),
            ('the filter never says which puzzle is showing', 'packages/web/src/components/PuzzleFilter.tsx', 'aria-current={id === current ? "page" : undefined}', 'aria-current={undefined}'),
            ('the navigation never says where you are', 'packages/web/src/components/NavLinks.tsx', 'aria-current={section === current ? "page" : undefined}', 'aria-current={undefined}'),
            ('the empty plate has a ring too few', 'packages/web/src/components/EmptyPlate.tsx', 'PUZZLE_HUES.map(', 'PUZZLE_HUES.slice(1).map('),
            ('the first slot of a plate loads late', 'packages/web/src/components/Plate.tsx', 'loading={priority ? "eager" : "lazy"}', 'loading="lazy"'),
            ('a solve rank is written as a number', 'packages/web/src/model/traits.ts', '`${ordinal(Number(value))} of ${SLOTS_PER_PUZZLE}`', 'String(value)'),
            ('the live trait does not say it can change', 'packages/web/src/model/traits.ts', 'note: "This changes if a smaller solution of the same puzzle is minted.",', ''),
            ('the gallery shows the oldest first', 'packages/web/src/app/(site)/gallery/page.tsx', '.reverse();', ';'),
            ('the gallery ignores the puzzle filter', 'packages/web/src/app/(site)/gallery/page.tsx', 'query.puzzle === undefined || e.puzzleId === query.puzzle', 'true'),
            ('a page of the gallery past the end is shown', 'packages/web/src/app/(site)/gallery/page.tsx', 'if (query.page > pages) notFound();', ''),
            ('an unknown puzzle has a page', 'packages/web/src/app/(site)/puzzles/[slug]/page.tsx', 'if (id === undefined) notFound();', 'if (id === undefined) return null;'),
            ('the token page decides by the cached supply', 'packages/web/src/app/(site)/token/[id]/page.tsx', "const result = await getTokenDetail(app, id);", "if (id > site.collection.totalSupply) notFound();\n  const result = await getTokenDetail(app, id);"),
            ('a token the contract denies has a page', 'packages/web/src/app/(site)/token/[id]/page.tsx', 'if (result.kind === "missing") notFound();', ''),
            ('the home page shows the oldest token', 'packages/web/src/app/(site)/page.tsx', 'entries.at(-1)', 'entries[0]'),
            ('the layout drops the header', 'packages/web/src/app/layout.tsx', '<SiteHeader />', ''),
            ('a reconnecting wallet is no wallet', 'packages/web/src/features/solve/useWallet.ts', 'account.status === "connecting" || account.status === "reconnecting"', 'account.status === "connecting"'),
            ('a wallet on another network gets a client', 'packages/web/src/features/solve/useWallet.ts', 'if (network === "wrong") {', 'if (false) {'),
            ('a wallet is asked to switch to another chain', 'packages/web/src/features/solve/useWallet.ts', 'switchChain({ chainId: app.chain.id })', 'switchChain({ chainId: 1 })'),
            ('a wallet with no client yet counts as ready', 'packages/web/src/features/solve/useWallet.ts', 'if (!client) {', 'if (false) {'),
            ('the salt is not shown before the commit is sent', 'packages/web/src/features/solve/useMintFlow.ts', '      setActive(prepared);\n', ''),
            ('blocks are watched when nothing is under way', 'packages/web/src/features/solve/useMintFlow.ts', 'if (!publicClient || active?.status !== "committed") return;', 'if (!publicClient) return;'),
            ('the page is not re-read after a reveal', 'packages/web/src/features/solve/useMintFlow.ts', '.finally(() => onRevealed?.());', '.finally(() => undefined);'),
            ('a failed refresh is an error to the player', 'packages/web/src/features/solve/useMintFlow.ts', '        .catch(() => undefined)\n', ''),
            ('forgetting the active commit leaves it on screen', 'packages/web/src/features/solve/useMintFlow.ts', '    if (active?.hash === pending.hash) leave();\n    else rerender();', '    rerender();'),
            ('the active commit is also listed as unfinished', 'packages/web/src/features/solve/useMintFlow.ts', ' && pending.hash !== active?.hash)', ')'),
            ('a finished mint is listed as unfinished', 'packages/web/src/features/solve/useMintFlow.ts', 'pending.status !== "revealed" && ', ''),
            ('a refusal is not shown', 'packages/web/src/features/solve/useMintFlow.ts', 'setNotice(friendlyError(error));', 'setNotice(undefined);'),
            ('a reveal is offered while waiting', 'packages/web/src/features/solve/MintPanel.tsx', 'step.step === "ready" &&\n              (props.busy', 'step.step !== "idle" &&\n              (props.busy'),
            ('the salt step is not marked done', 'packages/web/src/features/solve/MintPanel.tsx', '<Item state="done" title="Salt saved">', '<Item state="todo" title="Salt saved">'),
            ('a closed window is offered to continue', 'packages/web/src/features/solve/MintPanel.tsx', '{dead ? null : pending.puzzleId', '{false ? null : pending.puzzleId'),
            ('a dead commit is not called dead', 'packages/web/src/features/solve/MintPanel.tsx', ': dead ? "committed, window closed" : "committed"', ': "committed"'),
            ('a wrong network is not offered a switch', 'packages/web/src/features/solve/MintPanel.tsx', 'props.wallet.status === "connected" && props.wallet.network === "wrong" && (', 'false && ('),
            ('the reveal button ignores the gate', 'packages/web/src/features/solve/MintPanel.tsx', 'onClick={props.onReveal} disabled={!props.stepGate.enabled}', 'onClick={props.onReveal} disabled={false}'),
            ('the over-budget request is allowed', 'packages/web/src/chain/guard.ts', 'if (used >= limit) return "busy";', ''),
            ('a request already dealt with is charged again', 'packages/web/src/chain/guard.ts', 'if (dealtWith.has(key)) return "done";', ''),
            ('what is remembered is never forgotten', 'packages/web/src/chain/guard.ts', 'if (dealtWith.size > remember) dealtWith.delete(dealtWith.values().next().value as string);', ''),
            ('the budget never comes back', 'packages/web/src/chain/guard.ts', 'if (time - windowStart >= windowMs) {', 'if (false) {'),
            ('an event from another contract counts', 'packages/web/src/chain/refresh.ts', '(log) => log.address.toLowerCase() === app.proofkin.toLowerCase(),', '() => true,'),
            ('a reverted transaction counts', 'packages/web/src/chain/refresh.ts', 'if (receipt.status !== "success") return { kind: "not-a-solve" };', ''),
            ('a transaction not mined yet is an error', 'packages/web/src/chain/refresh.ts', 'if (error instanceof TransactionReceiptNotFoundError) return { kind: "pending" };', ''),
            ('a hash is used up before it is proven', 'packages/web/src/features/solve/refreshAfterMint.ts', '    if (reveal.kind !== "solved") return { refreshed: false };\n    guard.done(key);', '    guard.done(key);\n    if (reveal.kind !== "solved") return { refreshed: false };'),
            ('the collection is not made fresh', 'packages/web/src/features/solve/refreshAfterMint.ts', 'updateTag("collection");', ''),
            ('the solutions are not made fresh', 'packages/web/src/features/solve/refreshAfterMint.ts', 'updateTag("solved");', ''),
            ('anything is taken for a hash', 'packages/web/src/features/solve/refreshAfterMint.ts', 'if (!/^0x[0-9a-fA-F]{64}$/.test(revealTx)) return { refreshed: false };', ''),
            ('the checker follows a server action', 'packages/web/test/architecture.ts', 'if (current !== file && isServerAction(text)) return;', ''),
            ('a saved commit never learns the block', 'packages/web/src/features/solve/SolveIsland.tsx', 'latestBlock={flow.blockNumber ?? latest.data}', 'latestBlock={undefined}'),
            ('a mint is allowed without a local test', 'packages/web/src/features/solve/SolveIsland.tsx', 'localTest: report ? report.status : "notRun",', 'localTest: "pass",'),
            ('a commit is made with no node count', 'packages/web/src/features/solve/SolveIsland.tsx', 'nodeCount: analysis.nodeCount', 'nodeCount: 0'),
            ('the page is not re-read after a mint', 'packages/web/src/features/solve/SolveIsland.tsx', 'onRevealed: () => router.refresh(),', 'onRevealed: () => undefined,'),
            ('the next step ignores which account committed', 'packages/web/src/features/solve/SolveIsland.tsx', 'committedBy: flow.active.account,', 'committedBy: wallet.account ?? flow.active.account,'),
            ('the solve page gives the island no facts', 'packages/web/src/app/(site)/puzzles/[slug]/solve/page.tsx', '<SolveIsland key={id} puzzleId={id} facts={facts}>', '<SolveIsland key={id} puzzleId={id}>'),
            ('the storage accessor throws', 'packages/web/src/features/solve/browserStorage.ts', '  } catch {\n    return undefined;\n  }', '  } catch (error) {\n    throw error;\n  }'),
            ('the latest block key leaves out the chain', 'packages/web/src/config/queryKeys.ts', '["latestBlock", app.chain.id, app.proofkin]', '["latestBlock", app.proofkin]'),
            ("the collection's capacity is one too many", 'packages/web/src/config/routes.ts', 'SLOTS_PER_PUZZLE * PUZZLE_INFO.length;', 'SLOTS_PER_PUZZLE * PUZZLE_INFO.length + 1;'),
            ('the solve address loses its suffix', 'packages/web/src/config/routes.ts', '`/puzzles/${puzzleSlug(id)}/solve`', '`/puzzles/${puzzleSlug(id)}`'),
            ('every puzzle shares one draft', 'packages/web/src/features/solve/draft.ts', '`proofkin:draft:v1:${puzzleId}`', '`proofkin:draft:v1`'),
            ('an emptied editor brings the starting point back', 'packages/web/src/features/solve/draft.ts', 'storage?.getItem(draftKey(puzzleId)) ?? undefined', 'storage?.getItem(draftKey(puzzleId)) || undefined'),
            ('a picture with unicode in it is mangled', 'packages/web/src/features/solve/svgDataUri.ts', 'new TextEncoder().encode(svg)', 'new TextEncoder().encode(svg.replace(/[^\\x00-\\x7f]/g, "?"))'),
            ('an operation is listed twice', 'packages/web/src/features/solve/operations.ts', '{ name: "MIN", usage: "MIN a b"', '{ name: "MAX", usage: "MIN a b"'),
            ('the status line drops the line number', 'packages/web/src/features/solve/views.ts', 'return { tone: "bad", text: analysis.message, line: analysis.line };', 'return { tone: "bad", text: analysis.message };'),
            ('one node is called nodes', 'packages/web/src/features/solve/views.ts', 'analysis.nodeCount === 1 ? "" : "s"', '"s"'),
            ('the test hint counts one edge case too many', 'packages/web/src/features/solve/views.ts', 'PUZZLE_INFO[puzzleId]!.edgeCases.length;', 'PUZZLE_INFO[puzzleId]!.edgeCases.length + 1;'),
            ('a pass is called a guarantee', 'packages/web/src/features/solve/views.ts', ' so this is a rehearsal, not a guarantee.', '.'),
            ('a failure shows the wanted answer as its own', 'packages/web/src/features/solve/views.ts', '? failure.got.join(", ")', '? failure.expected.join(", ")'),
            ('the plate loses its picture while the next is drawn', 'packages/web/src/features/solve/views.ts', 'if (query.data !== undefined)\n    return', 'if (false && query.data !== undefined)\n    return'),
            ('a full puzzle is not said', 'packages/web/src/features/solve/views.ts', 'if (status === "puzzleFull")', 'if (status === "puzzleFullX")'),
            ('two inputs in a row are joined', 'packages/web/src/features/solve/inputGroups.ts', 'if (last - at < 2) last = at;', 'if (last - at < 1) last = at;'),
            ('inputs with different ranges are joined', 'packages/web/src/features/solve/inputGroups.ts', 'if (candidate.lo !== here.lo || candidate.hi !== here.hi) break;', ''),
            ('inputs with different names are joined', 'packages/web/src/features/solve/inputGroups.ts', 'next[1] !== start[1] ||', ''),
            ('the preview retries a node that refused', 'packages/web/src/features/solve/usePreview.ts', 'staleTime: Infinity,\n    retry: false,', 'staleTime: Infinity,\n    retry: 3,'),
            ('the status is asked about the program before it', 'packages/web/src/features/solve/SolveIsland.tsx', 'useProgramStatus(app, reader, current !== undefined && current === settled ? current : undefined)', 'useProgramStatus(app, reader, current !== undefined ? settled : undefined)'),
            ('a test result outlives the program it was about', 'packages/web/src/features/solve/SolveIsland.tsx', 'ran?.text === text ? ran.report : undefined', 'ran?.report'),
            ('the saved draft is never read', 'packages/web/src/features/solve/useProgram.ts', 'loadDraft(puzzleId, browserStorage()) ?? skeletonFor(puzzleId)', 'skeletonFor(puzzleId)'),
            ('the draft is never saved', 'packages/web/src/features/solve/useProgram.ts', 'saveDraft(puzzleId, text, browserStorage());', ''),
            ('the debounce does not wait', 'packages/web/src/features/solve/useDebouncedValue.ts', 'setSettled(value), delayMs)', 'setSettled(value), 0)'),
            ('the server thinks it is the browser', 'packages/web/src/features/solve/useMounted.ts', '() => true,\n    () => false,', '() => true,\n    () => true,'),
            ('the seed caption shows before a seed is chosen', 'packages/web/src/features/solve/PreviewPlate.tsx', '&& seed !== undefined;', ';'),
            ('a picture that is current is dimmed', 'packages/web/src/features/solve/PreviewPlate.tsx', 'data-dimmed={view.dimmed}', 'data-dimmed={true}'),
            ('start over does not ask', 'packages/web/src/features/solve/ProgramEditor.tsx', 'if (window.confirm("Replace your program with the starting point for this puzzle?")) onStartOver();', 'onStartOver();'),
            ('the line link selects the line after', 'packages/web/src/features/solve/ProgramEditor.tsx', 'lines.slice(0, line - 1)', 'lines.slice(0, line)'),
            ('a program that is not valid can be tested', 'packages/web/src/features/solve/TestPanel.tsx', 'disabled={view.kind === "blocked"}', 'disabled={false}'),
            ('the grid diagram is shown for every puzzle', 'packages/web/src/features/solve/PuzzleStatement.tsx', '{puzzleId === 3 && (', '{true && ('),
            ('every puzzle has the same answers heading', 'packages/web/src/features/solve/PuzzleStatement.tsx', 'puzzle.outputs.length === 1 ? "Answer" : "Answers"}', '"Answer"}'),
            ('an unknown puzzle has a solve page', 'packages/web/src/app/(site)/puzzles/[slug]/solve/page.tsx', 'if (id === undefined) notFound();', 'if (id === undefined) return null;'),
            ('the solve page shows 255 as the smallest', 'packages/web/src/app/(site)/puzzles/[slug]/solve/page.tsx', 'best === undefined || best === 255 ? undefined : best', 'best'),
            ("the browser's connection does not batch", 'packages/web/src/config/wagmi.ts', 'http(app.rpcUrl, { batch: true })', 'http(app.rpcUrl)'),
            ("a puzzle row's Solve link goes to the leaderboard", 'packages/web/src/components/PuzzleRow.tsx', 'href={paths.solve(puzzleId)}', 'href={paths.puzzle(puzzleId)}'),
            ("a puzzle page's Solve link goes to itself", 'packages/web/src/app/(site)/puzzles/[slug]/page.tsx', '<Link href={paths.solve(id)}', '<Link href={paths.puzzle(id)}'),
            ('a preview is kept for every seed', 'packages/web/src/config/queryKeys.ts', 'app.proofkin, program, seed] as const', 'app.proofkin, program] as const'),
            ("a program's status is kept for every chain", 'packages/web/src/config/queryKeys.ts', '["programStatus", app.chain.id, app.proofkin, program]', '["programStatus", app.proofkin, program]'),
            ('the wallet button is RainbowKit blue', 'packages/web/src/config/walletTheme.ts', 'accentColor: "#171b2a"', 'accentColor: "#0e76fd"'),
            ('the record ring is too pale to see', 'packages/web/src/app/globals.css', '--color-record: #a87d12;', '--color-record: #d9b45a;'),
            ("a puzzle's text hue is too light on the paper", 'packages/web/src/app/globals.css', '--puzzle-ink-l: 28%;', '--puzzle-ink-l: 45%;'),
            ('a collection named by one setting only is not an error', 'packages/web/src/config/env.ts', 'env.NEXT_PUBLIC_PROOFKIN?.trim() || env.NEXT_PUBLIC_RENDERER?.trim()', 'env.NEXT_PUBLIC_PROOFKIN?.trim() && env.NEXT_PUBLIC_RENDERER?.trim()'),
            ('the chain is read under the wrong prefix', 'packages/web/src/config/env.ts', 'parseChainConfig(env, "NEXT_PUBLIC_")', 'parseChainConfig(env)'),
            ('the site shows its pages without contracts', 'packages/web/src/app/(site)/layout.tsx', 'return config.ok ? children : <ConfigProblems problems={config.problems} />;', 'return children;'),
            ('the console is indexed', 'packages/web/src/app/admin/page.tsx', 'robots: { index: false, follow: false }', 'robots: { index: true, follow: false }'),
            ('a mainnet deployment is never confirmed', 'packages/web/src/features/admin/DeployPanel.tsx', 'mainnetConfirmed: mainnet', 'mainnetConfirmed: false'),
            ('a launch under way is asked to confirm again, in the panel', 'packages/web/src/features/admin/DeployPanel.tsx', '    resuming: true,\n', ''),
            ('a testnet asks for a confirmation too', 'packages/web/src/features/admin/DeployPanel.tsx', '{mainnet && owner.status === "ok" && (', '{owner.status === "ok" && ('),
            ('the launch is forgotten without asking', 'packages/web/src/features/admin/DeployPanel.tsx', '              if (\n                window.confirm(', '              if (\n                !window.confirm('),
            ('use my wallet fills nothing', 'packages/web/src/features/admin/DeployPanel.tsx', 'setOwnerText(wallet.account ?? "")', 'setOwnerText("")'),
            ("a finished launch is not the last step's turn", 'packages/web/src/features/admin/steps.ts', 'return ["done", "done", "done", "current"];', 'return ["done", "done", "done", "done"];'),
            ('the record is not read back after a failure', 'packages/web/src/features/admin/useDeployFlow.ts', '      setCurrent(store.get(wallet.walletClient.chain.id, wallet.walletClient.account.address));\n', ''),
            ("another account's launch is shown", 'packages/web/src/features/admin/useDeployFlow.ts', 'current && current.account.toLowerCase() === wallet.account?.toLowerCase() && current.chainId === app.chain.id', 'current'),
            ('forgetting does not reach the store', 'packages/web/src/features/admin/useDeployFlow.ts', '    if (wallet.account) store.remove(app.chain.id, wallet.account);\n', ''),
            ("the console ignores the settings' collection", 'packages/web/src/features/admin/AdminConsole.tsx', 'if (source.kind === "configured") {', 'if (false) {'),
            ('an unfinished launch is called deployed', 'packages/web/src/features/admin/AdminConsole.tsx', '.find((p) => p.status === "done")', '.find(() => true)'),
            ('the owner is told they are one in the same letter case only', 'packages/web/src/features/admin/CollectionStatus.tsx', 'account?.toLowerCase() === state.owner.toLowerCase()', 'account === state.owner'),
            ("the renderer's lock is shown the wrong way round", 'packages/web/src/features/admin/CollectionStatus.tsx', 'state.rendererLocked ? "Locked for good." : "Open: it can still be replaced."', 'state.rendererLocked ? "Open: it can still be replaced." : "Locked for good."'),
            ('settings copied for one collection read copied for the next', 'packages/web/src/features/admin/DeployResult.tsx', 'copied === settings ? "Copied"', 'copied !== undefined ? "Copied"'),
            ("the deployer's code may be imported anywhere", 'packages/web/test/architecture.ts', 'if (specifiers.includes(LAUNCH_ENTRY)) {', 'if (false) {'),
            ("the console's status is kept for every chain", 'packages/web/src/config/queryKeys.ts', '["collectionStatus", collection.chain.id, collection.proofkin]', '["collectionStatus", collection.proofkin]'),
            ('a mint does not end what was known of its program', 'packages/web/src/features/solve/SolveIsland.tsx', '      void queryClient.invalidateQueries({ queryKey: queryKeys.programStatuses(app) });\n', ''),
            ('a new salt reads copied because the last one was', 'packages/web/src/features/solve/MintPanel.tsx', 'const copied = active !== undefined && copiedSalt === active.salt;', 'const copied = copiedSalt !== undefined;'),
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


def main(name, only):
    suite = SUITES[name]
    mutations = [m for m in suite["mutations"] if not only or any(o.lower() in m[0].lower() for o in only)]
    if not mutations:
        sys.exit(f"no mutation label contains any of {only}")
    files = sorted({m[1] for m in mutations})
    backup = Path(tempfile.mkdtemp(prefix="proofkin-mutate-"))
    for f in files:
        dest = backup / f
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / f, dest)
    before = fingerprint(suite["fingerprint"]) if "fingerprint" in suite else None

    survivors = []
    try:
        for label, f, old, new in mutations:
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
    if len(sys.argv) < 2 or sys.argv[1] not in SUITES:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2:]))
