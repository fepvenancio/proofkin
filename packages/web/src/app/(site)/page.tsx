import { formatEth, PUZZLE_INFO, SLOTS_PER_PUZZLE } from "@proofkin/core";
import Link from "next/link";

import { getSite } from "@/chain/site";
import { coverageProblem } from "@/chain/solved";
import { CollectionUnavailable } from "@/components/CollectionUnavailable";
import { EmptyPlate } from "@/components/EmptyPlate";
import { Plate } from "@/components/Plate";
import { PuzzleRow } from "@/components/PuzzleRow";
import { requireAppConfig } from "@/config/env";
import { paths } from "@/config/routes";
import { SITE_NAME } from "@/config/site";
import { describeArt } from "@/model/traits";

export const dynamic = "force-dynamic";

/**
 * @notice The home page: the newest solution as a large plate, what the collection is, and the six puzzles.
 * @dev A server component. Everything it shows was read on the server through the cache, so the visitor's browser
 * fetches no chain data of its own, only the plates' art as they scroll into view. A node that does not answer is a
 * sentence on the page, not an error page, and the cause is in the server log.
 */
export default async function Page() {
  const app = requireAppConfig();
  const site = await getSite(app);
  if (!site) return <CollectionUnavailable chainName={app.chain.name} />;

  const { collection, entries } = site;
  const newest = entries.at(-1);
  const capacity = SLOTS_PER_PUZZLE * PUZZLE_INFO.length;
  const coverage = coverageProblem(entries.length, collection.totalSupply);

  return (
    <>
      <section className="grid items-center gap-8 py-6 md:grid-cols-[minmax(0,34rem)_1fr] md:gap-14 md:py-10">
        {newest ? (
          <Plate
            id={newest.tokenId}
            priority
            alt={describeArt(`${SITE_NAME} #${newest.tokenId}`, PUZZLE_INFO[newest.puzzleId]!.name, newest.nodeCount)}
          />
        ) : (
          <EmptyPlate />
        )}
        <div>
          <h1 className="max-w-[16ch] text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            A collection you solve, not buy.
          </h1>
          <p className="mt-5 max-w-[46ch] text-lg text-graphite">
            Each token is a tiny program that solves an on-chain puzzle. The contract runs your program to check it,
            then draws it.
          </p>
          <p className="mt-6 tabular-nums">
            {`${collection.totalSupply} of ${capacity} solved. Minting costs ${formatEth(BigInt(collection.mintPrice))}, on ${app.chain.name}.`}
          </p>
          {newest ? (
            <p className="mt-2">
              <Link href={paths.token(newest.tokenId)} className="underline underline-offset-4">
                {`Newest: ${SITE_NAME} #${newest.tokenId}, a ${PUZZLE_INFO[newest.puzzleId]!.name} solution of ${newest.nodeCount} nodes`}
              </Link>
            </p>
          ) : (
            <p className="mt-2">Nothing has been solved yet. The first solution sets every record.</p>
          )}
        </div>
      </section>

      {coverage && (
        <p role="status" className="mt-4">
          {coverage}
        </p>
      )}

      <section aria-labelledby="puzzles" className="mt-12">
        <h2 id="puzzles" className="text-2xl font-semibold tracking-tight">
          Six puzzles, fifty solutions each
        </h2>
        <ul className="mt-2 divide-y divide-rule">
          {PUZZLE_INFO.map((puzzle) => {
            const best = collection.bestNodes[puzzle.id]!;
            return (
              <li key={puzzle.id}>
                <PuzzleRow
                  puzzleId={puzzle.id}
                  solved={collection.solvedCount[puzzle.id]!}
                  best={best}
                  recordRanks={entries
                    .filter((e) => e.puzzleId === puzzle.id && e.nodeCount === best)
                    .map((e) => e.rank)}
                />
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
