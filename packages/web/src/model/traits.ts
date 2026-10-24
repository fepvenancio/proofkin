import { ordinal, SLOTS_PER_PUZZLE } from "@proofkin/core";

export interface TraitRow {
  label: string;
  value: string;
  /** Said under the row, for the one trait that is not fixed at mint. */
  note?: string;
}

/**
 * @notice The contract's traits, in words for the token page.
 * @dev (1) Order is the contract's. (2) A trait the contract adds later is shown as it is, under its own name, instead
 * of being dropped. (3) "Optimal" is the one live trait: it is computed at read time and turns "No" when a smaller
 * solution of the same puzzle is minted, so the page says so beside it.
 * @param attributes - What `tokenURI` listed.
 * @returns One row per trait.
 */
export function describeTraits(attributes: readonly { trait: string; value: string | number }[]): TraitRow[] {
  return attributes.map(({ trait, value }): TraitRow => {
    switch (trait) {
      case "Solve rank":
        return { label: "Solved", value: `${ordinal(Number(value))} of ${SLOTS_PER_PUZZLE}` };
      case "First Solver":
        return { label: "First solver", value: String(value) };
      case "Record Setter":
        return { label: "Record setter", value: String(value) };
      case "Optimal":
        return {
          label: "Smallest so far",
          value: String(value),
          note: "This changes if a smaller solution of the same puzzle is minted.",
        };
      case "Dominant op family":
        return { label: "Main operations", value: String(value) };
      default:
        return { label: trait, value: String(value) };
    }
  });
}

/**
 * @param name - The token's name.
 * @param puzzle - The puzzle it solves.
 * @param nodeCount - The size of its program.
 * @returns What the art is, in words: the alt text of its picture.
 */
export function describeArt(name: string, puzzle: string, nodeCount: number): string {
  return `${name}, a ${puzzle} solution of ${nodeCount} nodes`;
}
