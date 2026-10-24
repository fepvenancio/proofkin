import { PUZZLE_HUES, PUZZLE_INFO, leaderboards } from "@proofkin/core";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type CSSProperties } from "react";

import { getSite } from "@/chain/site";
import { coverageProblem } from "@/chain/solved";
import { CollectionUnavailable } from "@/components/CollectionUnavailable";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { SlotStrip } from "@/components/SlotStrip";
import { requireAppConfig } from "@/config/env";
import { paths, puzzleFromSlug } from "@/config/routes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = puzzleFromSlug((await params).slug);
  return { title: id === undefined ? "Puzzle" : PUZZLE_INFO[id]!.name };
}

/**
 * @notice One puzzle: what it asks, its 50 slots, and who has solved it, smallest first.
 * @dev This page is the leaderboard. It is built from the same `Solved` events as the gallery, ordered as
 * `leaderboards` orders them: smallest program first, and among equals the earlier solver.
 * @param props - `params`: the puzzle's slug.
 */
export default async function Page({ params }: Props) {
  const id = puzzleFromSlug((await params).slug);
  if (id === undefined) notFound();

  const app = requireAppConfig();
  const site = await getSite(app);
  if (!site) return <CollectionUnavailable chainName={app.chain.name} />;

  const { collection, entries } = site;
  const puzzle = PUZZLE_INFO[id]!;
  const best = collection.bestNodes[id]!;
  const board = leaderboards(entries)[id]!;
  const coverage = coverageProblem(entries.length, collection.totalSupply);

  return (
    <div style={{ "--h": PUZZLE_HUES[id] } as CSSProperties}>
      <h1 className="text-puzzle mt-6 text-4xl font-semibold tracking-tight">{puzzle.name}</h1>
      <p className="mt-3 max-w-prose text-lg">{puzzle.summary}</p>
      <p className="mt-2 max-w-prose text-graphite">{puzzle.rule}</p>

      <div className="mt-8">
        <SlotStrip
          puzzleId={id}
          solved={collection.solvedCount[id]!}
          best={best === 255 ? undefined : best}
          recordRanks={board.filter((e) => e.holdsRecord).map((e) => e.rank)}
        />
      </div>
      {coverage && (
        <p role="status" className="mt-4">
          {coverage}
        </p>
      )}

      <h2 className="mt-12 text-2xl font-semibold tracking-tight">Smallest solutions</h2>
      <div className="mt-4">
        <LeaderboardTable puzzleId={id} entries={board} />
      </div>
      <p className="mt-8">
        <Link href={paths.gallery({ puzzle: id, page: 1 })} className="underline underline-offset-4">
          {`See ${puzzle.name} in the gallery`}
        </Link>
      </p>
    </div>
  );
}
