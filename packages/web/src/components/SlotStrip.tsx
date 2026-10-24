import { PUZZLE_HUES, SLOTS_PER_PUZZLE } from "@proofkin/core";
import { type CSSProperties } from "react";

/**
 * @notice A puzzle's 50 slots: filled for each solution so far, ringed on the smallest.
 * @dev (1) A slot is a solution's place in the order it was solved, so the rank of a solution is its position and the
 * ring goes on the slot of each solution that holds the record. (2) The fifty marks are one picture with one
 * description: nobody should have to tab through them. (3) It wraps to two rows of 25 on a phone.
 * @param props - `puzzleId`: which puzzle, for its hue. `solved`: how many are solved. `best`: the smallest size so
 * far, if any. `recordRanks`: the solve order of each solution that holds the record.
 */
export function SlotStrip({
  puzzleId,
  solved,
  best,
  recordRanks,
}: {
  puzzleId: number;
  solved: number;
  best?: number;
  recordRanks: number[];
}) {
  const filled = Math.min(solved, SLOTS_PER_PUZZLE);
  const records = new Set(recordRanks);
  const label = `${filled} of ${SLOTS_PER_PUZZLE} solved${best === undefined ? "" : `, smallest ${best} nodes`}`;

  return (
    <div
      role="img"
      aria-label={label}
      style={{ "--h": PUZZLE_HUES[puzzleId] } as CSSProperties}
      className="grid max-w-md grid-cols-[repeat(25,minmax(0,1fr))] gap-[3px] sm:grid-cols-[repeat(50,minmax(0,1fr))]"
    >
      {Array.from({ length: SLOTS_PER_PUZZLE }, (_, index) => {
        const rank = index + 1;
        const kind = rank > filled ? "empty" : records.has(rank) ? "record" : "filled";
        return (
          <span
            key={rank}
            data-slot={kind}
            className={
              kind === "empty"
                ? "h-4 rounded-[1px] bg-rule"
                : kind === "record"
                  ? "bg-puzzle-mark h-4 rounded-[1px] ring-2 ring-record ring-offset-1 ring-offset-paper"
                  : "bg-puzzle-mark h-4 rounded-[1px]"
            }
          />
        );
      })}
    </div>
  );
}
