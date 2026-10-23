import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assemble } from "../src/asm.ts";
import { inputs, PUZZLE_NAMES, reference, trialCount } from "../src/puzzles.ts";
import { run, validate } from "../src/vm.ts";

const SEEDS = 1000;
const dir = new URL("../../../fixtures/solutions/", import.meta.url);
const source = (name: string) => readFileSync(new URL(`${name}.pk`, dir), "utf8");

const seedOf = (i: number) => `0x${i.toString(16).padStart(64, "0")}` as const;

/** First (seed, trial) the program gets wrong, or undefined if it solves them all. */
function firstFailure(puzzleId: number, program: Uint8Array) {
  for (let s = 0; s < SEEDS; s++) {
    for (let trial = 0; trial < trialCount(puzzleId); trial++) {
      const xs = inputs(puzzleId, seedOf(s), trial);
      const got = run(program, xs);
      const want = reference(puzzleId, xs);
      if (!got.ok || got.outputs.join() !== want.join()) return { seed: s, trial, xs, got, want };
    }
  }
  return undefined;
}

describe.each(PUZZLE_NAMES.map((name, id) => [id, name] as const))("solution for %i %s", (id, name) => {
  const program = assemble(source(name));

  it("is a valid program under 64 nodes", () => {
    expect(validate(program)).toEqual({ ok: true });
    expect(program[1]).toBe(id);
    expect(program[2]).toBeLessThan(64);
  });

  it(`solves every trial (${trialCount(id)}) on ${SEEDS} seeds`, () => {
    expect(firstFailure(id, program)).toBeUndefined();
  });
});

describe("the solve check can fail", () => {
  it("catches a SORT8 network with one comparator's min and max swapped", () => {
    const broken = source("SORT8").replace("= MIN", "= MAX"); // first comparator only
    expect(broken).not.toBe(source("SORT8"));
    const program = assemble(broken);
    expect(validate(program)).toEqual({ ok: true });
    expect(firstFailure(2, program)).toBeDefined();
  });

  it("catches a QUORUM7 program that tests sum <= t instead of sum >= t", () => {
    const broken = source("QUORUM7").replace("LT s6 t", "LT t s6");
    expect(broken).not.toBe(source("QUORUM7"));
    const program = assemble(broken);
    expect(validate(program)).toEqual({ ok: true });
    expect(firstFailure(0, program)).toBeDefined();
  });
});
