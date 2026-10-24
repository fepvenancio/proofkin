import { type InputSlot } from "@proofkin/core";

/** Inputs `first` to `last`, named `firstLabel` to `lastLabel`, that all take values from `lo` to `hi`. */
export interface InputGroup {
  first: number;
  last: number;
  firstLabel: string;
  lastLabel: string;
  lo: number;
  hi: number;
}

/** A name that ends in a number: `x3` is `x` and 3, `edge 11` is `edge ` and 11. */
const NUMBERED = /^(.*?)(\d+)$/;

const run = (inputs: readonly InputSlot[], from: number): number => {
  const start = NUMBERED.exec(inputs[from]!.label);
  if (!start) return from;
  let end = from;
  while (end + 1 < inputs.length) {
    const next = NUMBERED.exec(inputs[end + 1]!.label);
    const here = inputs[from]!;
    const candidate = inputs[end + 1]!;
    if (!next || next[1] !== start[1] || Number(next[2]) !== Number(start[2]) + (end + 1 - from)) break;
    if (candidate.lo !== here.lo || candidate.hi !== here.hi) break;
    end++;
  }
  return end;
};

/**
 * @notice A puzzle's inputs, with each run of alike ones made into one line.
 * @dev (1) A run is three or more inputs in a row with the same name and a counting number (`edge 0`, `edge 1`, ...)
 * and the same range; fewer is no shorter than saying each. GRID_PATH has twelve edges, and listing them one by one put
 * the editor two screens down on a phone. (2) Every input is in exactly one group, in order, so nothing is hidden: the
 * grouped line says where the run starts and ends.
 * @param inputs - The puzzle's input slots, in order.
 * @returns The groups, in order.
 */
export function groupInputs(inputs: readonly InputSlot[]): InputGroup[] {
  const groups: InputGroup[] = [];
  for (let at = 0; at < inputs.length;) {
    let last = run(inputs, at);
    if (last - at < 2) last = at; // two in a row are not worth joining
    const { lo, hi } = inputs[at]!;
    groups.push({ first: at, last, firstLabel: inputs[at]!.label, lastLabel: inputs[last]!.label, lo, hi });
    at = last + 1;
  }
  return groups;
}
