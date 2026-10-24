import { PUZZLE_HUES, PUZZLE_INFO } from "@proofkin/core";
import Link from "next/link";
import { type CSSProperties } from "react";

import { Plate } from "@/components/Plate";
import { paths } from "@/config/routes";
import { SITE_NAME } from "@/config/site";
import { type SolvedEntry } from "@/model/data";

/**
 * @notice Tokens as plates with a caption each: the name, the puzzle and its size, and a mark on the smallest.
 * @dev (1) Presentation only; it takes what was already read. (2) The art beside a caption would only repeat it to a
 * screen reader, so the plate is decorative and the link is named by the caption. (3) "Smallest so far" is judged
 * against the puzzle's best size now, so every solution that shares it is marked.
 * @param props - `entries`: the tokens to show, in the order to show them. `bestNodes`: the smallest solved size
 * per puzzle, from the collection.
 */
export function PlateGrid({ entries, bestNodes }: { entries: SolvedEntry[]; bestNodes: number[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {entries.map((entry) => (
        <li key={entry.tokenId} style={{ "--h": PUZZLE_HUES[entry.puzzleId] } as CSSProperties}>
          <Link href={paths.token(entry.tokenId)} className="group block">
            <span className="block rounded-[2px] outline-offset-0 group-hover:outline group-hover:outline-2 group-hover:outline-[hsl(var(--h)_74%_70%)]">
              <Plate id={entry.tokenId} alt="" />
            </span>
            <strong className="mt-3 block font-semibold">{`${SITE_NAME} #${entry.tokenId}`}</strong>
            <span className="text-puzzle block tabular-nums">{`${PUZZLE_INFO[entry.puzzleId]!.name}, ${entry.nodeCount} nodes`}</span>
            {entry.nodeCount === bestNodes[entry.puzzleId] && (
              <span className="mt-1 flex items-center gap-1.5 text-sm text-graphite">
                <span aria-hidden className="size-2.5 rounded-full border-2 border-record" />
                Smallest so far
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
