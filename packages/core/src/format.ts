// Small display helpers.
import { fixedTrials } from "@proofkin/vm";
import { formatEther } from "viem";
import { SLOTS_PER_PUZZLE } from "./chain.ts";
import { PUZZLE_INFO } from "./puzzleInfo.ts";

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function formatDuration(seconds: number): string {
  return seconds < 90 ? `${seconds} s` : `about ${Math.round(seconds / 60)} min`;
}

export function formatEth(wei: bigint): string {
  return `${formatEther(wei)} ETH`;
}

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export const slotsLeft = (solved: number): number => Math.max(0, SLOTS_PER_PUZZLE - solved);

export function labelledInputs(puzzleId: number, inputs: number[]): { label: string; value: number }[] {
  const slots = PUZZLE_INFO[puzzleId]!.inputs;
  return inputs.map((value, i) => ({ label: slots[i]?.label ?? `input ${i}`, value }));
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** "the third edge case: …" for each of the puzzle's fixed trials, "random case n" for the rest. */
export function describeTrial(puzzleId: number, trial: number): string {
  const fixed = fixedTrials(puzzleId);
  const k = fixed.indexOf(trial);
  if (k >= 0) return `the ${ORDINALS[k]!} edge case: ${PUZZLE_INFO[puzzleId]!.edgeCases[k]}`;
  return `random case ${trial - fixed.filter((f) => f < trial).length + 1}`;
}
