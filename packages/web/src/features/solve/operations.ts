import { OP_NAMES } from "@proofkin/vm";

export interface Operation {
  name: (typeof OP_NAMES)[number];
  /** As it is written on a line of a program. */
  usage: string;
  meaning: string;
}

/**
 * @notice The thirteen operations, as the reference under the editor lists them.
 * @dev `operations.test.ts` fails if this is not exactly the VM's own list, in its order, so an operation cannot be
 * added to the VM and left undocumented.
 */
export const OPERATIONS: readonly Operation[] = [
  { name: "IN", usage: "IN n", meaning: "The input in slot n." },
  { name: "CONST", usage: "CONST n", meaning: "The number n, from 0 to 65535." },
  { name: "ADD", usage: "ADD a b", meaning: "a + b. Fails if the result is above 4294967295." },
  { name: "SUB", usage: "SUB a b", meaning: "a − b. Fails if b is larger than a." },
  { name: "MUL", usage: "MUL a b", meaning: "a × b. Fails if the result is above 4294967295." },
  { name: "DIV", usage: "DIV a b", meaning: "a ÷ b, rounded down. Fails if b is 0." },
  { name: "MIN", usage: "MIN a b", meaning: "The smaller of the two." },
  { name: "MAX", usage: "MAX a b", meaning: "The larger of the two." },
  { name: "LT", usage: "LT a b", meaning: "1 if a < b, otherwise 0." },
  { name: "EQ", usage: "EQ a b", meaning: "1 if a = b, otherwise 0." },
  { name: "AND", usage: "AND a b", meaning: "1 if neither is 0, otherwise 0." },
  { name: "OR", usage: "OR a b", meaning: "1 if either is not 0, otherwise 0." },
  { name: "SEL", usage: "SEL c x y", meaning: "x if c is not 0, otherwise y. Both x and y are computed first." },
];
