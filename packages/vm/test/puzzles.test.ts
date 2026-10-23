import { describe, expect, it } from "vitest";
import { GRID_PATHS, gridEdges } from "../src/cheats.ts";
import { fixedTrials, inputCount, inputs, outputCount, PUZZLE_COUNT, reference, TRIALS, trialCount } from "../src/puzzles.ts";

const SEED_1 = "0x0000000000000000000000000000000000000000000000000000000000000001";
const SEED_2 = "0x00000000000000000000000000000000000000000000000000000000deadbeef";

const QUORUM7 = 0;
const MEDIAN5 = 1;
const SORT8 = 2;
const GRID_PATH = 3;
const KNAPSACK3 = 4;
const FAIR_SPLIT4 = 5;

// [lo, hi] per input slot, straight from the §4 table.
const RANGES: Record<number, [number, number][]> = {
  [QUORUM7]: [...Array(7).fill([0, 1]), [1, 7]],
  [MEDIAN5]: Array(5).fill([0, 255]),
  [SORT8]: Array(8).fill([0, 255]),
  [GRID_PATH]: Array(12).fill([0, 15]),
  [KNAPSACK3]: [[1, 20], [0, 50], [1, 20], [0, 50], [1, 20], [0, 50], [1, 40]],
  [FAIR_SPLIT4]: [[1, 4000], ...Array(4).fill([1, 1000])],
};

describe("puzzle shapes (§4 table)", () => {
  it("has six puzzles", () => {
    expect(PUZZLE_COUNT).toBe(6);
  });

  it.each([
    [QUORUM7, 8, 1],
    [MEDIAN5, 5, 1],
    [SORT8, 8, 8],
    [GRID_PATH, 12, 1],
    [KNAPSACK3, 7, 1],
    [FAIR_SPLIT4, 5, 4],
  ])("puzzle %i has %i inputs and %i outputs", (id, nIn, nOut) => {
    expect(inputCount(id)).toBe(nIn);
    expect(outputCount(id)).toBe(nOut);
  });

  it("rejects unknown puzzle ids", () => {
    expect(() => inputCount(6)).toThrow();
    expect(() => outputCount(6)).toThrow();
    expect(() => inputs(6, SEED_1, 0)).toThrow();
    expect(() => reference(6, [])).toThrow();
  });
});

describe("fixed edge-case trials 0 and 1 (§4.1)", () => {
  // Seed must not matter for trials 0 and 1.
  const fixed: [number, number, number[], number[]][] = [
    // both sit exactly on the threshold: sum == t - 1 (answer 0), then sum == t (answer 1)
    [QUORUM7, 0, [0, 0, 0, 0, 0, 0, 0, 1], [0]],
    [QUORUM7, 1, [1, 1, 1, 1, 1, 1, 1, 7], [1]],
    [MEDIAN5, 0, [128, 128, 128, 128, 128], [128]],
    [MEDIAN5, 1, [200, 150, 100, 50, 0], [100]],
    [SORT8, 0, Array(8).fill(128), Array(8).fill(128)],
    [SORT8, 1, [224, 192, 160, 128, 96, 64, 32, 0], [0, 32, 64, 96, 128, 160, 192, 224]],
    [GRID_PATH, 0, Array(12).fill(0), [0]],
    [GRID_PATH, 1, Array(12).fill(15), [60]],
    [KNAPSACK3, 0, [6, 50, 10, 40, 20, 30, 5], [0]],
    [KNAPSACK3, 1, [1, 10, 1, 20, 1, 30, 40], [60]],
    [FAIR_SPLIT4, 0, [1000, 100, 200, 300, 400], [100, 200, 300, 400]],
    [FAIR_SPLIT4, 1, [3999, 1000, 1000, 1000, 1000], [999, 999, 999, 999]],
  ];

  it.each(fixed)("puzzle %i trial %i", (id, trial, expectedInputs, expectedOutputs) => {
    expect(inputs(id, SEED_1, trial)).toEqual(expectedInputs);
    expect(inputs(id, SEED_2, trial)).toEqual(expectedInputs);
    expect(reference(id, expectedInputs)).toEqual(expectedOutputs);
  });
});

describe("further fixed trials 10 and up (§4.1)", () => {
  const allIds = Array.from({ length: PUZZLE_COUNT }, (_, id) => id);

  it("gives each puzzle its trial count", () => {
    expect(TRIALS).toBe(10);
    expect(allIds.map(trialCount)).toEqual([10, 10, 12, 16, 16, 10]);
  });

  it("lists the trials whose inputs ignore the seed", () => {
    expect(fixedTrials(QUORUM7)).toEqual([0, 1]);
    expect(fixedTrials(MEDIAN5)).toEqual([0, 1]);
    expect(fixedTrials(SORT8)).toEqual([0, 1, 10, 11]);
    expect(fixedTrials(GRID_PATH)).toEqual([0, 1, 10, 11, 12, 13, 14, 15]);
    expect(fixedTrials(KNAPSACK3)).toEqual([0, 1, 10, 11, 12, 13, 14, 15]);
    expect(fixedTrials(FAIR_SPLIT4)).toEqual([0, 1]);
  });

  it("ignores the seed in every fixed trial", () => {
    for (const id of allIds) {
      for (const trial of fixedTrials(id)) expect(inputs(id, SEED_1, trial)).toEqual(inputs(id, SEED_2, trial));
    }
  });

  it("is random again from the trial count on, for every puzzle", () => {
    for (const id of allIds) {
      for (const trial of [trialCount(id), trialCount(id) + 1]) {
        expect(inputs(id, SEED_1, trial)).not.toEqual(inputs(id, SEED_2, trial));
      }
    }
  });

  it("GRID_PATH: trials 10..15 make each path in turn the single cheapest", () => {
    GRID_PATHS.forEach((moves, k) => {
      const x = inputs(GRID_PATH, SEED_1, 10 + k);
      const costs = GRID_PATHS.map((m) => gridEdges(m).reduce((sum, e) => sum + x[e]!, 0));
      const cheapest = Math.min(...costs);
      expect(costs.filter((c) => c === cheapest), moves).toHaveLength(1);
      expect(costs[k], moves).toBe(cheapest);
      expect(gridEdges(moves).map((e) => x[e]), moves).toEqual([1, 2, 3, 4]);
      expect(x.filter((w) => w === 15), moves).toHaveLength(8);
      expect(reference(GRID_PATH, x)).toEqual([10]);
    });
  });

  it("KNAPSACK3: trials 10..15 make each single item, then each pair, the unique best set at exactly the cap", () => {
    const wanted = [0b001, 0b010, 0b100, 0b011, 0b101, 0b110];
    wanted.forEach((mask, k) => {
      const x = inputs(KNAPSACK3, SEED_1, 10 + k);
      const cap = x[6]!;
      const sets = Array.from({ length: 8 }, (_, m) => {
        let weight = 0;
        let value = 0;
        for (let i = 0; i < 3; i++) {
          if (m & (1 << i)) {
            weight += x[2 * i]!;
            value += x[2 * i + 1]!;
          }
        }
        return { mask: m, weight, value };
      }).filter((s) => s.weight <= cap);
      const best = Math.max(...sets.map((s) => s.value));
      const winners = sets.filter((s) => s.value === best);
      expect(winners.map((s) => s.mask)).toEqual([mask]);
      expect(winners[0]!.weight).toBe(cap);
      expect(reference(KNAPSACK3, x)).toEqual([best]);
    });
  });

  it("SORT8: trials 10 and 11 are permutations of eight distinct values, and not the descending case", () => {
    const sorted = [0, 32, 64, 96, 128, 160, 192, 224];
    for (const trial of [10, 11]) {
      expect([...inputs(SORT8, SEED_1, trial)].sort((a, b) => a - b)).toEqual(sorted);
    }
    expect(inputs(SORT8, SEED_1, 10)).not.toEqual(inputs(SORT8, SEED_1, 11));
    expect(inputs(SORT8, SEED_1, 10)).not.toEqual(inputs(SORT8, SEED_1, 1));
  });
});

describe("random trials (§4.1)", () => {
  // Known answers computed independently with `cast keccak` + python bigints:
  //   lo + uint256(keccak256(abi.encode(bytes32 seed, uint256 trial, uint256 i))) % (hi - lo + 1)
  it("matches independently computed known answers", () => {
    expect(inputs(QUORUM7, SEED_1, 2)).toEqual([0, 1, 0, 0, 0, 0, 0, 4]);
    expect(inputs(KNAPSACK3, SEED_1, 2)).toEqual([13, 42, 19, 21, 15, 33, 21]);
    expect(inputs(FAIR_SPLIT4, SEED_2, 9)).toEqual([2105, 935, 328, 961, 721]);
    expect(inputs(SORT8, SEED_2, 5)).toEqual([211, 92, 198, 65, 160, 154, 18, 229]);
  });

  it("is deterministic and depends on seed and trial", () => {
    expect(inputs(SORT8, SEED_1, 3)).toEqual(inputs(SORT8, SEED_1, 3));
    expect(inputs(SORT8, SEED_1, 3)).not.toEqual(inputs(SORT8, SEED_1, 4));
    expect(inputs(SORT8, SEED_1, 3)).not.toEqual(inputs(SORT8, SEED_2, 3));
  });

  it("stays inside every input range", () => {
    for (let id = 0; id < PUZZLE_COUNT; id++) {
      const ranges = RANGES[id]!;
      for (let s = 0; s < 40; s++) {
        const seed = `0x${s.toString(16).padStart(64, "0")}` as const;
        for (let trial = 0; trial < trialCount(id) + 2; trial++) {
          const xs = inputs(id, seed, trial);
          expect(xs).toHaveLength(ranges.length);
          xs.forEach((x, i) => {
            const [lo, hi] = ranges[i]!;
            expect(x).toBeGreaterThanOrEqual(lo);
            expect(x).toBeLessThanOrEqual(hi);
          });
        }
      }
    }
  });
});

describe("reference solvers (hand-computed cases)", () => {
  it("QUORUM7: sum(votes) >= t", () => {
    const votes = [1, 1, 0, 1, 0, 0, 1]; // sum = 4
    expect(reference(QUORUM7, [...votes, 4])).toEqual([1]);
    expect(reference(QUORUM7, [...votes, 5])).toEqual([0]);
  });

  it("MEDIAN5: middle of the sorted values", () => {
    expect(reference(MEDIAN5, [9, 1, 5, 7, 3])).toEqual([5]);
    expect(reference(MEDIAN5, [4, 4, 1, 9, 9])).toEqual([4]);
  });

  it("SORT8: ascending", () => {
    expect(reference(SORT8, [5, 3, 8, 1, 9, 2, 7, 4])).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
  });

  describe("GRID_PATH edge order", () => {
    const grid = (cheap: Record<number, number>, cost = 15) =>
      Array.from({ length: 12 }, (_, i) => cheap[i] ?? cost);

    it("right, right, down, down uses h(0,0), h(0,1), v(0,2), v(1,2)", () => {
      // inputs 0,1 = row-0 horizontals; 8 = v (0,2)->(1,2); 11 = v (1,2)->(2,2)
      expect(reference(GRID_PATH, grid({ 0: 1, 1: 1, 8: 1, 11: 1 }))).toEqual([4]);
    });

    it("down, down, right, right uses v(0,0), v(1,0), h(2,0), h(2,1)", () => {
      // inputs 6 = v (0,0)->(1,0); 9 = v (1,0)->(2,0); 4,5 = row-2 horizontals
      expect(reference(GRID_PATH, grid({ 6: 2, 9: 2, 4: 2, 5: 2 }))).toEqual([8]);
    });

    it("right, down, right, down uses h(0,0), v(0,1), h(1,1), v(1,2)", () => {
      // inputs 0 = h (0,0)->(0,1); 7 = v (0,1)->(1,1); 3 = h (1,1)->(1,2); 11 = v (1,2)->(2,2)
      expect(reference(GRID_PATH, grid({ 0: 3, 7: 3, 3: 3, 11: 3 }))).toEqual([12]);
    });
  });

  it("KNAPSACK3: best value among subsets that fit", () => {
    // items (w,v) = (3,4) (4,5) (5,6); best for cap 9 is items 1+2 = 11
    expect(reference(KNAPSACK3, [3, 4, 4, 5, 5, 6, 9])).toEqual([11]);
    expect(reference(KNAPSACK3, [3, 4, 4, 5, 5, 6, 2])).toEqual([0]);
    expect(reference(KNAPSACK3, [3, 4, 4, 5, 5, 6, 12])).toEqual([15]);
  });

  it("FAIR_SPLIT4: full grant if it fits, else proportional floor", () => {
    expect(reference(FAIR_SPLIT4, [10, 1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(reference(FAIR_SPLIT4, [5, 1, 2, 3, 4])).toEqual([0, 1, 1, 2]);
  });
});
