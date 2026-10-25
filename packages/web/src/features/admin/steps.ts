import { type PendingDeploy } from "@proofkin/core/launch";

import { type StepState } from "@/components/Step";

/**
 * @notice Where a launch is, as the four steps the console shows: the owner, the renderer, the collection, and the
 * settings to give the site.
 * @dev The last step is "current" and never "done" once the contracts are checked: what is left is the person's to do,
 * outside the console, so the console cannot know it was done.
 * @param record - The launch on record, if any.
 * @returns The state of each step, in order.
 */
export function deployStepStates(record: PendingDeploy | undefined): [StepState, StepState, StepState, StepState] {
  if (!record) return ["current", "todo", "todo", "todo"];
  if (record.status === "done") return ["done", "done", "done", "current"];
  if (record.renderer) return ["done", "done", "current", "todo"];
  return ["done", "current", "todo", "todo"];
}
