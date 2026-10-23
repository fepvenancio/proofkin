import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assemble } from "../src/asm.ts";
import { generateCheats } from "../src/cheats.ts";
import {
  generateCheatFixtures,
  generateDiffFixtures,
  generateSolutions,
  INVALID_COUNT,
  PROGRAM_COUNT,
  type DiffFixtures,
} from "../src/fixtures.ts";
import { inputs, PUZZLE_COUNT, PUZZLE_NAMES, reference } from "../src/puzzles.ts";
import { type ErrorName, run, validate } from "../src/vm.ts";

const fx: DiffFixtures = generateDiffFixtures();
const fixturesDir = new URL("../../../fixtures/", import.meta.url);

const ALL_RULES: ErrorName[] = [
  "BadLength",
  "BadVersion",
  "BadPuzzle",
  "BadNodeCount",
  "BadOutCount",
  "BadOpcode",
  "UnusedFieldNotZero",
  "OperandNotEarlier",
  "BadInputIndex",
  "BadOutputIndex",
  "DeadNode",
];

describe("diff fixtures: valid programs", () => {
  const bytes = (row: { program: number[] }) => Uint8Array.from(row.program);

  it("has two input vectors for each of the programs", () => {
    expect(fx.valid).toHaveLength(2 * PROGRAM_COUNT);
    expect(new Set(fx.valid.map((r) => r.program.join())).size).toBe(PROGRAM_COUNT);
  });

  it("every program passes validate, and its recorded results are what run() returns", () => {
    for (const row of fx.valid) {
      const program = bytes(row);
      expect(validate(program)).toEqual({ ok: true });
      expect(row.puzzleId).toBe(program[1]);
      expect(run(program, row.inputs)).toEqual({ ok: row.ok, outputs: row.outputs, values: row.values });
    }
  });

  it("covers every puzzle, every opcode, and both size extremes", () => {
    const ops = new Set<number>();
    const sizes = new Set<number>();
    for (const row of fx.valid) {
      for (let i = 0; i < row.program[2]!; i++) ops.add(row.program[4 + 4 * i]!);
      sizes.add(row.program[2]!);
    }
    expect([...new Set(fx.valid.map((r) => r.puzzleId))].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect([...ops].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(Math.min(...sizes)).toBe(1);
    expect(Math.max(...sizes)).toBe(64);
  });

  it("exercises both successful and failing (overflow, underflow, divide-by-zero) runs", () => {
    const okRows = fx.valid.filter((r) => r.ok).length;
    expect(okRows / fx.valid.length).toBeGreaterThan(0.25);
    expect(okRows / fx.valid.length).toBeLessThan(0.9);
  });

  it("uses uint32 inputs that include out-of-puzzle-range extremes", () => {
    const flat = fx.valid.flatMap((r) => r.inputs);
    expect(Math.max(...flat)).toBe(0xffffffff);
    expect(flat.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff)).toBe(true);
  });
});

describe("diff fixtures: invalid programs", () => {
  it(`has ${INVALID_COUNT} rows, none of them valid`, () => {
    expect(fx.invalid).toHaveLength(INVALID_COUNT);
    for (const row of fx.invalid) {
      expect(validate(Uint8Array.from(row.program)).ok).toBe(false);
    }
  });

  it("records exactly the rule and index validate() reports (index 0 for header rules)", () => {
    for (const row of fx.invalid) {
      const v = validate(Uint8Array.from(row.program));
      if (v.ok) throw new Error("unreachable");
      expect({ rule: row.rule, index: row.index }).toEqual({ rule: v.error, index: v.index ?? 0 });
    }
  });

  it("covers every rule many times", () => {
    for (const rule of ALL_RULES) {
      expect(fx.invalid.filter((r) => r.rule === rule).length, rule).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("diff fixtures: input/reference vectors", () => {
  it("match inputs() and reference() and span every puzzle and trials 0..19", () => {
    for (const row of fx.vectors) {
      const xs = inputs(row.puzzleId, row.seed, row.trial);
      expect(row.inputs).toEqual(xs);
      expect(row.expected).toEqual(reference(row.puzzleId, xs));
    }
    for (let id = 0; id < PUZZLE_COUNT; id++) {
      const trials = new Set(fx.vectors.filter((r) => r.puzzleId === id).map((r) => r.trial));
      expect([...trials].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, trial) => trial));
    }
  });
});

describe("generation", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(generateDiffFixtures())).toBe(JSON.stringify(fx));
  });

  it("solutions.json holds each fixture solution as hex, keyed by puzzle name", () => {
    const solutions = generateSolutions();
    expect(Object.keys(solutions).sort()).toEqual([...PUZZLE_NAMES].sort());
    for (const [name, hex] of Object.entries(solutions)) {
      const source = readFileSync(new URL(`solutions/${name}.pk`, fixturesDir), "utf8");
      expect(hex).toBe(`0x${Buffer.from(assemble(source)).toString("hex")}`);
    }
  });
});

describe("cheats.json", () => {
  it("holds each wrong program as hex, keyed by its name", () => {
    const cheats = generateCheatFixtures();
    const wanted = generateCheats();
    expect(Object.keys(cheats)).toEqual(wanted.map((c) => c.name));
    for (const c of wanted) expect(cheats[c.name]).toBe(`0x${Buffer.from(assemble(c.source)).toString("hex")}`);
  });
});

describe("committed fixture files are up to date (run `pnpm gen:fixtures`)", () => {
  it("diff.json", () => {
    const onDisk = readFileSync(new URL("diff.json", fixturesDir), "utf8");
    expect(onDisk).toBe(`${JSON.stringify(fx)}\n`);
  });

  it("cheats.json", () => {
    const onDisk = readFileSync(new URL("cheats.json", fixturesDir), "utf8");
    expect(onDisk).toBe(`${JSON.stringify(generateCheatFixtures(), null, 2)}\n`);
  });

  it("solutions.json", () => {
    const onDisk = readFileSync(new URL("solutions.json", fixturesDir), "utf8");
    expect(onDisk).toBe(`${JSON.stringify(generateSolutions(), null, 2)}\n`);
  });
});
