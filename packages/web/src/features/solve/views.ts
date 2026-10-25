import {
  type Analysis,
  describeTrial,
  labelledInputs,
  LOCAL_RANDOM_TRIALS,
  type LocalTestReport,
  PUZZLE_INFO,
  type ProgramStatus,
} from "@proofkin/core";

import { svgDataUri } from "@/features/solve/svgDataUri";

/*
 * What the solve page says, as pure functions of what it knows. Each takes the facts and returns the words, so the
 * wording is tested without a browser, and the components only place it.
 */

/* //////////////////////////////////////////////////////////////
                           STATUS LINE
//////////////////////////////////////////////////////////////*/

export interface StatusLine {
  tone: "good" | "bad";
  text: string;
  /** The line of the program the problem is on, when the assembler knows it. */
  line?: number;
}

/**
 * @param analysis - What the editor's text turned into.
 * @returns The line under the editor: how big the program is, or what is wrong and where.
 */
export function statusLine(analysis: Analysis): StatusLine {
  if (analysis.ok) {
    const nodes = `${analysis.nodeCount} node${analysis.nodeCount === 1 ? "" : "s"}`;
    return { tone: "good", text: `${nodes}, depth ${analysis.depth}. The program is valid.` };
  }
  return { tone: "bad", text: analysis.message, line: analysis.line };
}

/* //////////////////////////////////////////////////////////////
                           LOCAL TEST
//////////////////////////////////////////////////////////////*/

export type TestView =
  | { kind: "blocked"; text: string }
  | { kind: "notRun"; text: string }
  | { kind: "pass"; headline: string; note: string }
  | { kind: "fail"; headline: string; rows: { label: string; value: string }[] };

/**
 * @dev Ordered, the first that holds wins: an invalid program cannot be tested, a program not yet run says what a run
 * will try, and a run says how it went. The pass note says what a pass is not, because the contract draws its own
 * random cases at reveal from a seed that does not exist yet.
 * @param state - `valid`: the program assembles and validates. `report`: the last run, if the program has not changed since.
 * @param puzzleId - Which puzzle, for its edge cases and its input names.
 * @returns What the test panel shows.
 */
export function testView(state: { valid: boolean; report?: LocalTestReport }, puzzleId: number): TestView {
  if (!state.valid) return { kind: "blocked", text: "Fix the program first." };
  const { report } = state;
  if (!report) {
    const fixed = PUZZLE_INFO[puzzleId]!.edgeCases.length;
    return {
      kind: "notRun",
      text: `Runs your program on the ${fixed} fixed edge cases and ${LOCAL_RANDOM_TRIALS} random ones.`,
    };
  }
  if (report.status === "pass") {
    return {
      kind: "pass",
      headline: `Passed all ${report.cases} cases.`,
      note: `Seed ${report.seed.slice(0, 10)}…. The contract draws its own 8 random cases when you reveal, so this is a rehearsal, not a guarantee.`,
    };
  }
  const failure = report.failure;
  return {
    kind: "fail",
    headline: `Failed ${describeTrial(puzzleId, failure.trial)}.`,
    rows: [
      {
        label: "Inputs",
        value: labelledInputs(puzzleId, failure.inputs)
          .map((input) => `${input.label}=${input.value}`)
          .join("  "),
      },
      { label: "Expected", value: failure.expected.join(", ") },
      {
        label: "Got",
        value: failure.got
          ? failure.got.join(", ")
          : "an arithmetic failure: an overflow, an underflow or a division by zero",
      },
    ],
  };
}

/* //////////////////////////////////////////////////////////////
                              PREVIEW
//////////////////////////////////////////////////////////////*/

export type PreviewView =
  | { kind: "invalid"; text: string }
  | { kind: "drawing"; text: string }
  | { kind: "drawn"; src: string; dimmed: boolean }
  | { kind: "error"; text: string };

/**
 * @dev Ordered: a program that is not valid is not drawn, whatever an earlier query left behind. After that a picture
 * beats everything, and while the next one is drawn the last is kept, dimmed, so the plate does not blink out at every
 * keystroke. An error shows only when there is no picture to keep.
 * @param analysis - What the editor's text turned into.
 * @param query - What the preview query holds: the SVG, the reason it failed, and whether it is fetching.
 * @returns What the plate shows.
 */
export function previewView(
  analysis: Analysis,
  query: { data?: string; error?: string; isFetching?: boolean },
): PreviewView {
  if (!analysis.ok) return { kind: "invalid", text: "Fix the program and it will be drawn here." };
  if (query.data !== undefined)
    return { kind: "drawn", src: svgDataUri(query.data), dimmed: Boolean(query.isFetching) };
  if (query.error !== undefined) return { kind: "error", text: query.error };
  return { kind: "drawing", text: "Drawing…" };
}

/* //////////////////////////////////////////////////////////////
                     WHAT THE CHAIN SAYS ABOUT IT
//////////////////////////////////////////////////////////////*/

/**
 * @param status - What the contract says about this exact program.
 * @returns A sentence when the program cannot be minted for a reason the contract knows; otherwise nothing.
 */
export function programNote(status: ProgramStatus | "unknown"): string | undefined {
  if (status === "alreadyMinted")
    return "This exact program has already been minted. You can still test it, but it cannot be minted again.";
  if (status === "puzzleFull") return "All 50 slots of this puzzle are taken.";
  return undefined;
}
