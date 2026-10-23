import { describe, expect, it } from "vitest";
import { assemble } from "../src/asm.ts";
import { generateCheats, gridPathSource, knapsack3Source, median5Source, quorum7Source, sort8Source } from "../src/cheats.ts";
import { fixedTrials, inputs, PUZZLE_NAMES, reference, trialCount } from "../src/puzzles.ts";
import { run, validate } from "../src/vm.ts";

const seedOf = (i: number) => `0x${i.toString(16).padStart(64, "0")}` as const;

const wrongOn = (program: Uint8Array, puzzleId: number, xs: number[]): boolean => {
  const got = run(program, xs);
  return !got.ok || got.outputs.join() !== reference(puzzleId, xs).join();
};

/** Share of the random trials 2..9, over 300 seeds, that the program gets right. */
function agreement(program: Uint8Array, puzzleId: number): number {
  let right = 0;
  let total = 0;
  for (let s = 0; s < 300; s++) {
    for (let trial = 2; trial < 10; trial++) {
      total++;
      if (!wrongOn(program, puzzleId, inputs(puzzleId, seedOf(s + 1000), trial))) right++;
    }
  }
  return right / total;
}

describe("the builders, with nothing left out, make correct solutions", () => {
  const builders: [number, string, string][] = [
    [0, "QUORUM7", quorum7Source()],
    [1, "MEDIAN5", median5Source()],
    [2, "SORT8", sort8Source()],
    [3, "GRID_PATH", gridPathSource()],
    [4, "KNAPSACK3", knapsack3Source()],
  ];

  it.each(builders)("puzzle %i %s solves every trial on 200 seeds", (id, _name, source) => {
    const program = assemble(source);
    expect(validate(program)).toEqual({ ok: true });
    for (let s = 0; s < 200; s++) {
      for (let trial = 0; trial < trialCount(id); trial++) {
        const xs = inputs(id, seedOf(s), trial);
        expect(wrongOn(program, id, xs), `seed ${s}, trial ${trial}`).toBe(false);
      }
    }
  });
});

describe("the wrong programs", () => {
  const cheats = generateCheats().map((c) => ({ ...c, program: assemble(c.source) }));

  it("are 74, each with its own name, covering five puzzles", () => {
    expect(cheats).toHaveLength(74);
    expect(new Set(cheats.map((c) => c.name)).size).toBe(74);
    expect(new Set(cheats.map((c) => PUZZLE_NAMES[c.puzzleId]))).toEqual(new Set(["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3"]));
    for (const c of cheats) expect(c.name.startsWith(PUZZLE_NAMES[c.puzzleId]!)).toBe(true);
  });

  it.each(cheats)("$name is a valid program for its puzzle, so only the trials can refuse it", ({ program, puzzleId }) => {
    expect(validate(program)).toEqual({ ok: true });
    expect(program[1]).toBe(puzzleId);
    expect(program[2]).toBeLessThanOrEqual(64);
  });

  it.each(cheats)("$name is a near miss: right on a good share of random inputs", ({ program, puzzleId }) => {
    expect(agreement(program, puzzleId)).toBeGreaterThan(0.25);
  });

  it.each(cheats)("$name is genuinely wrong on some input", ({ program, puzzleId }) => {
    let wrong = 0;
    for (let s = 0; s < 300 && wrong === 0; s++) {
      for (let trial = 2; trial < 10; trial++) {
        if (wrongOn(program, puzzleId, inputs(puzzleId, seedOf(s + 5000), trial))) wrong++;
      }
    }
    expect(wrong).toBeGreaterThan(0);
  });

  // The point of the fixed cases: nothing the seed does can let one of these through.
  it.each(cheats)("$name fails a fixed trial, whatever the seed", ({ program, puzzleId }) => {
    for (const seed of [seedOf(0), seedOf(1), seedOf(123456789)]) {
      const caught = fixedTrials(puzzleId).filter((trial) => wrongOn(program, puzzleId, inputs(puzzleId, seed, trial)));
      expect(caught.length).toBeGreaterThan(0);
    }
  });
});
