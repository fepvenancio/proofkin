import { PUZZLE_HUES, PUZZLE_INFO } from "@proofkin/core";
import Link from "next/link";
import { type CSSProperties } from "react";

import { paths } from "@/config/routes";

/**
 * @notice The choice of puzzle above the gallery: all of them, or one.
 * @dev Plain links, so the filter is an address that can be shared and the page needs no script. The chosen one says so
 * with `aria-current` and is underlined, so the choice is not carried by the hue alone.
 * @param props - `current`: the puzzle being shown; every puzzle when absent.
 */
export function PuzzleFilter({ current }: { current?: number }) {
  const choices = [{ id: undefined, name: "All" }, ...PUZZLE_INFO.map(({ id, name }) => ({ id, name }))];
  return (
    <nav aria-label="Filter by puzzle">
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {choices.map(({ id, name }) => (
          <li key={name} style={id === undefined ? undefined : ({ "--h": PUZZLE_HUES[id] } as CSSProperties)}>
            <Link
              href={paths.gallery({ puzzle: id, page: 1 })}
              aria-current={id === current ? "page" : undefined}
              className={`${id === undefined ? "" : "text-puzzle"} underline-offset-8 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline aria-[current=page]:decoration-2`}
            >
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
