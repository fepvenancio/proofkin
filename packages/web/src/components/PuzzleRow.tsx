import { NO_SOLUTION_YET, PUZZLE_HUES, PUZZLE_INFO, SLOTS_PER_PUZZLE } from "@proofkin/core";
import Link from "next/link";
import { type CSSProperties } from "react";

import { SlotStrip } from "@/components/SlotStrip";
import { paths } from "@/config/routes";

/**
 * @notice One puzzle at a glance: its name, what it asks, its 50 slots, and how small the smallest solution is.
 * @dev Presentation only. The sentence under the strip says the same as the strip's description, in words, because the
 * strip is a picture.
 * @param props - `puzzleId`: which puzzle. `solved`: how many solutions so far. `best`: the smallest size, 255 when
 * there is none. `recordRanks`: the solve order of each solution that holds the record.
 */
export function PuzzleRow({
  puzzleId,
  solved,
  best,
  recordRanks,
}: {
  puzzleId: number;
  solved: number;
  best: number;
  recordRanks: number[];
}) {
  const puzzle = PUZZLE_INFO[puzzleId]!;
  const smallest = best === NO_SOLUTION_YET ? undefined : best;
  return (
    <div
      style={{ "--h": PUZZLE_HUES[puzzleId] } as CSSProperties}
      className="grid gap-3 py-6 md:grid-cols-[1fr_28rem] md:gap-10"
    >
      <div>
        <h3 className="text-xl font-semibold">
          <Link
            href={paths.puzzle(puzzleId)}
            className="text-puzzle underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            {puzzle.name}
          </Link>
        </h3>
        <p className="mt-1 max-w-prose text-graphite">{puzzle.summary}</p>
      </div>
      <div className="grid content-start gap-2">
        <SlotStrip puzzleId={puzzleId} solved={solved} best={smallest} recordRanks={recordRanks} />
        <p className="tabular-nums">
          {smallest === undefined
            ? "Nobody has solved it yet."
            : `${solved} of ${SLOTS_PER_PUZZLE} solved. The smallest is ${smallest} nodes.`}
        </p>
      </div>
    </div>
  );
}
