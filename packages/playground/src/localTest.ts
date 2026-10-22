// "Test locally" (PLAN.md §9): the 2 fixed edge cases plus 100 random ones, on the TypeScript VM.
// This is a rehearsal, not a proof: the contract draws its own 8 random cases from a seed that does not
// exist until after the commit, so a program that passes here can still fail there.
import { inputs, reference, run } from "@proofkin/vm";
import type { Hex } from "viem";

export const LOCAL_RANDOM_TRIALS = 100;

export interface FailedCase {
  /** 0 and 1 are the fixed edge cases; 2 and up are random. */
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

/** Runs a valid program on trials 0 .. 1 + randomTrials and reports the first one it gets wrong. */
export function runLocalTest(
  program: Uint8Array,
  opts: { seed?: Hex; randomTrials?: number } = {},
): LocalTestReport {
  const seed = opts.seed ?? randomSeed();
  const puzzleId = program[1]!;
  const cases = 2 + (opts.randomTrials ?? LOCAL_RANDOM_TRIALS);

  for (let trial = 0; trial < cases; trial++) {
    const x = inputs(puzzleId, seed, trial);
    const expected = reference(puzzleId, x);
    const result = run(program, x);
    if (!result.ok) return { status: "fail", seed, failure: { trial, kind: "arithmetic", inputs: x, expected, got: null } };
    if (result.outputs.join() !== expected.join()) {
      return { status: "fail", seed, failure: { trial, kind: "wrong", inputs: x, expected, got: result.outputs } };
    }
  }
  return { status: "pass", seed, cases };
}
