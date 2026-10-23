// TypeScript port of contracts/src/Puzzles.sol. Must match it byte-for-byte (see fixtures/diff.json).
import { encodeAbiParameters, type Hex, keccak256 } from "viem";

export const PUZZLE_COUNT = 6;
/**
 * Trials 0 and 1 are fixed edge cases, trials 2..9 are seeded-random. A puzzle may add further fixed trials
 * from TRIALS on (see `trialCount`); past those, trials are random again.
 */
export const TRIALS = 10;

type Range = readonly [lo: number, hi: number];

interface PuzzleSpec {
  name: string;
  /** Inclusive [lo, hi] for every input slot. */
  ranges: readonly Range[];
  outputs: number;
  /** Inputs for trials 0 and 1, then for the further fixed trials TRIALS, TRIALS + 1, ... */
  fixed: readonly (readonly number[])[];
  solve: (x: readonly number[]) => number[];
}

const repeat = (n: number, range: Range): Range[] => Array.from({ length: n }, () => range);
const fill = (n: number, value: number): number[] => Array(n).fill(value);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const sortAsc = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);

// GRID_PATH: 3x3 grid of nodes, moves right/down only, 12 edge weights.
//   inputs 0..5  : horizontals, row by row: (r,0)->(r,1) then (r,1)->(r,2) for r = 0,1,2
//   inputs 6..11 : verticals, row by row: (0,c)->(1,c) for c = 0,1,2 then (1,c)->(2,c)
function gridPath(x: readonly number[]): number {
  const h = (r: number, c: number) => x[2 * r + c]!; // edge (r,c)->(r,c+1)
  const v = (r: number, c: number) => x[6 + 3 * r + c]!; // edge (r,c)->(r+1,c)
  const d: number[][] = [[], [], []];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 0 && c === 0) d[r]![c] = 0;
      else if (r === 0) d[r]![c] = d[r]![c - 1]! + h(r, c - 1);
      else if (c === 0) d[r]![c] = d[r - 1]![c]! + v(r - 1, c);
      else d[r]![c] = Math.min(d[r]![c - 1]! + h(r, c - 1), d[r - 1]![c]! + v(r - 1, c));
    }
  }
  return d[2]![2]!;
}

// KNAPSACK3 inputs: w0, v0, w1, v1, w2, v2, cap.
function knapsack3(x: readonly number[]): number {
  const cap = x[6]!;
  let best = 0;
  for (let mask = 0; mask < 8; mask++) {
    let w = 0;
    let v = 0;
    for (let i = 0; i < 3; i++) {
      if (mask & (1 << i)) {
        w += x[2 * i]!;
        v += x[2 * i + 1]!;
      }
    }
    if (w <= cap && v > best) best = v;
  }
  return best;
}

// FAIR_SPLIT4 inputs: B, r0..r3. r_i * B <= 4_000_000, so Math.floor of the double quotient is exact.
function fairSplit4(x: readonly number[]): number[] {
  const budget = x[0]!;
  const requests = x.slice(1);
  const total = sum(requests);
  if (total <= budget) return requests;
  return requests.map((r) => Math.floor((r * budget) / total));
}

const PUZZLES: readonly PuzzleSpec[] = [
  {
    name: "QUORUM7",
    ranges: [...repeat(7, [0, 1]), [1, 7]],
    outputs: 1,
    fixed: [
      [...fill(7, 0), 1], // sum == t - 1
      [...fill(7, 1), 7], // sum == t
    ],
    solve: (x) => [sum(x.slice(0, 7)) >= x[7]! ? 1 : 0],
  },
  {
    name: "MEDIAN5",
    ranges: repeat(5, [0, 255]),
    outputs: 1,
    fixed: [fill(5, 128), [200, 150, 100, 50, 0]],
    solve: (x) => [sortAsc(x)[2]!],
  },
  {
    name: "SORT8",
    ranges: repeat(8, [0, 255]),
    outputs: 8,
    fixed: [
      fill(8, 128),
      [224, 192, 160, 128, 96, 64, 32, 0],
      [0, 64, 96, 160, 32, 192, 128, 224],
      [0, 96, 32, 160, 64, 128, 192, 224],
    ],
    solve: sortAsc,
  },
  {
    name: "GRID_PATH",
    ranges: repeat(12, [0, 15]),
    outputs: 1,
    fixed: [
      fill(12, 0),
      fill(12, 15),
      // weights 1, 2, 3, 4 along the path, 15 elsewhere: RRDD, RDRD, RDDR, DRRD, DRDR, DDRR
      [1, 2, 15, 15, 15, 15, 15, 15, 3, 15, 15, 4],
      [1, 15, 15, 3, 15, 15, 15, 2, 15, 15, 15, 4],
      [1, 15, 15, 15, 15, 4, 15, 2, 15, 15, 3, 15],
      [15, 15, 2, 3, 15, 15, 1, 15, 15, 15, 15, 4],
      [15, 15, 2, 15, 15, 4, 1, 15, 15, 15, 3, 15],
      [15, 15, 15, 15, 3, 4, 1, 15, 15, 2, 15, 15],
    ],
    solve: (x) => [gridPath(x)],
  },
  {
    name: "KNAPSACK3",
    ranges: [[1, 20], [0, 50], [1, 20], [0, 50], [1, 20], [0, 50], [1, 40]],
    outputs: 1,
    fixed: [
      [6, 50, 10, 40, 20, 30, 5], // every weight > cap
      [1, 10, 1, 20, 1, 30, 40], // every weight 1, cap 40
      // all weights 10; the best set weighs exactly the cap and beats every other set that fits
      [10, 50, 10, 20, 10, 30, 10], // item 0 alone
      [10, 20, 10, 50, 10, 30, 10], // item 1 alone
      [10, 20, 10, 30, 10, 50, 10], // item 2 alone
      [10, 30, 10, 30, 10, 10, 20], // items 0 and 1
      [10, 30, 10, 10, 10, 30, 20], // items 0 and 2
      [10, 10, 10, 30, 10, 30, 20], // items 1 and 2
    ],
    solve: (x) => [knapsack3(x)],
  },
  {
    name: "FAIR_SPLIT4",
    ranges: [[1, 4000], ...repeat(4, [1, 1000])],
    outputs: 4,
    fixed: [
      [1000, 100, 200, 300, 400], // sum == B
      [3999, 1000, 1000, 1000, 1000], // sum > B, all r = 1000
    ],
    solve: fairSplit4,
  },
];

export const PUZZLE_NAMES: readonly string[] = PUZZLES.map((p) => p.name);

function spec(puzzleId: number): PuzzleSpec {
  const p = PUZZLES[puzzleId];
  if (p === undefined) throw new Error(`unknown puzzle ${puzzleId}`);
  return p;
}

/** How many trials a solution must pass: TRIALS, plus the puzzle's further fixed cases. */
export const trialCount = (puzzleId: number): number => TRIALS + spec(puzzleId).fixed.length - 2;

/** The trials whose inputs ignore the seed: 0 and 1, then TRIALS and up for the puzzles that have more. */
export function fixedTrials(puzzleId: number): number[] {
  const extra = trialCount(puzzleId) - TRIALS;
  return [0, 1, ...Array.from({ length: extra }, (_, k) => TRIALS + k)];
}

export const inputCount = (puzzleId: number): number => spec(puzzleId).ranges.length;
export const outputCount = (puzzleId: number): number => spec(puzzleId).outputs;

/**
 * Inputs for one trial. Trials 0 and 1, and the further fixed trials TRIALS .. trialCount - 1, ignore the seed;
 * every other trial is `lo + uint256(keccak256(abi.encode(seed, trial, i))) % (hi - lo + 1)`.
 */
export function inputs(puzzleId: number, seed: Hex, trial: number): number[] {
  const p = spec(puzzleId);
  if (trial === 0 || trial === 1) return [...p.fixed[trial]!];
  if (trial >= TRIALS && trial < trialCount(puzzleId)) return [...p.fixed[2 + trial - TRIALS]!];
  return p.ranges.map(([lo, hi], i) => {
    const h = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }],
        [seed, BigInt(trial), BigInt(i)],
      ),
    );
    return lo + Number(BigInt(h) % BigInt(hi - lo + 1));
  });
}

export function reference(puzzleId: number, x: readonly number[]): number[] {
  const p = spec(puzzleId);
  if (x.length !== p.ranges.length) {
    throw new Error(`puzzle ${p.name} takes ${p.ranges.length} inputs, got ${x.length}`);
  }
  return p.solve(x);
}
