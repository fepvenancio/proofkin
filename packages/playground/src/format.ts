// Small display helpers.
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

export const slotsLeft = (solved: number): number => Math.max(0, SLOTS_PER_PUZZLE - solved);

export function labelledInputs(puzzleId: number, inputs: number[]): { label: string; value: number }[] {
  const slots = PUZZLE_INFO[puzzleId]!.inputs;
  return inputs.map((value, i) => ({ label: slots[i]?.label ?? `input ${i}`, value }));
}

/** "the first edge case: …" for trials 0 and 1, "random case n" after that. */
export function describeTrial(puzzleId: number, trial: number): string {
  if (trial === 0) return `the first edge case: ${PUZZLE_INFO[puzzleId]!.edgeCases[0]}`;
  if (trial === 1) return `the second edge case: ${PUZZLE_INFO[puzzleId]!.edgeCases[1]}`;
  return `random case ${trial - 1}`;
}
