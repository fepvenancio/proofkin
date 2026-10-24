import { type LeaderboardEntry, ordinal, PUZZLE_HUES, PUZZLE_INFO, shortAddress } from "@proofkin/core";
import Link from "next/link";
import { type CSSProperties } from "react";

import { paths } from "@/config/routes";

/**
 * @notice A puzzle's solutions, smallest first.
 * @dev (1) Ties are in the order they were solved, as `leaderboards` returns them. (2) The record is marked twice, with
 * the gold ring and in words, so it does not depend on colour. (3) The solver is the address that minted it; whoever
 * owns the token now is on the token's page.
 * @param props - `puzzleId`: which puzzle. `entries`: its solutions, as `leaderboards` returns them.
 */
export function LeaderboardTable({ puzzleId, entries }: { puzzleId: number; entries: LeaderboardEntry[] }) {
  const name = PUZZLE_INFO[puzzleId]!.name;
  if (entries.length === 0) {
    return <p>{`Nobody has solved ${name} yet. The first solution sets the record.`}</p>;
  }
  return (
    <table
      className="w-full max-w-2xl border-collapse text-left tabular-nums"
      style={{ "--h": PUZZLE_HUES[puzzleId] } as CSSProperties}
    >
      <caption className="sr-only">{`Smallest solutions of ${name}`}</caption>
      <thead className="text-graphite">
        <tr className="border-b border-rule">
          <th scope="col" className="py-2 pr-4 font-normal">
            Nodes
          </th>
          <th scope="col" className="py-2 pr-4 font-normal">
            Token
          </th>
          <th scope="col" className="py-2 pr-4 font-normal">
            Solver
          </th>
          <th scope="col" className="py-2 pr-4 font-normal">
            Solved
          </th>
          <th scope="col" className="sr-only">
            Record
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.tokenId} className="border-b border-rule">
            <td className="py-3 pr-4 font-semibold">{entry.nodeCount}</td>
            <td className="py-3 pr-4">
              <Link
                href={paths.token(entry.tokenId)}
                className="text-puzzle underline underline-offset-4"
              >{`#${entry.tokenId}`}</Link>
            </td>
            <td className="font-address py-3 pr-4" title={entry.author}>
              {shortAddress(entry.author)}
            </td>
            <td className="py-3 pr-4">{ordinal(entry.rank)}</td>
            <td className="py-3">
              {entry.holdsRecord && (
                <>
                  <span aria-hidden className="inline-block size-3 rounded-full border-2 border-record" />
                  <span className="sr-only">Smallest so far</span>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
