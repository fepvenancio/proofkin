// "Test locally" (PLAN.md §9): every fixed edge case of the puzzle plus 100 random ones, on the TypeScript VM.
// This is a rehearsal, not a proof: the contract draws its own 8 random cases from a seed that does not
// exist until after the commit, so a program that passes here can still fail there.
import { fixedTrials, inputs, reference, run } from "@proofkin/vm";
import type { Hex } from "viem";

export const LOCAL_RANDOM_TRIALS = 100;

export interface FailedCase {
  /** Trial numbers as the contract has them: 0 and 1, and for some puzzles 10 and up, are fixed edge cases; the rest are random. */
  trial: number;
  /** "wrong": ran fine, gave different outputs. "arithmetic": overflow, underflow or divide by zero. */
  kind: "wrong" | "arithmetic";
  inputs: number[];
  expected: number[];
  got: number[] | null;
}

export type LocalTestReport =
  | { status: "pass"; seed: Hex; cases: number }
  | { status: "fail"; seed: Hex; failure: FailedCase };

export function randomSeed(
  fill: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b),
): Hex {
  const bytes = fill(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Runs a valid program on every fixed case, in trial order, and then on `randomTrials` random ones, and reports the
 * first it gets wrong. The fixed cases go first because they have names: "the third edge case: the cheapest path is
 * right, right, down, down" says more than a random case, and they are the same on every seed.
 */
export function runLocalTest(
  program: Uint8Array,
  opts: { seed?: Hex; randomTrials?: number } = {},
): LocalTestReport {
  const seed = opts.seed ?? randomSeed();
  const puzzleId = program[1]!;
  const fixed = fixedTrials(puzzleId);
  const order = [...fixed];
  // the random trials are the other trial numbers, from 2 up: as many as asked for, however few
  for (let trial = 2; order.length < fixed.length + (opts.randomTrials ?? LOCAL_RANDOM_TRIALS); trial++) {
    if (!fixed.includes(trial)) order.push(trial);
  }

  for (const trial of order) {
    const x = inputs(puzzleId, seed, trial);
    const expected = reference(puzzleId, x);
    const result = run(program, x);
    if (!result.ok) return { status: "fail", seed, failure: { trial, kind: "arithmetic", inputs: x, expected, got: null } };
    if (result.outputs.join() !== expected.join()) {
      return { status: "fail", seed, failure: { trial, kind: "wrong", inputs: x, expected, got: result.outputs } };
    }
  }
  return { status: "pass", seed, cases: order.length };
}
