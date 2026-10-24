import { formatEth, PUZZLE_INFO, slotsLeft } from "@proofkin/core";
import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { getCollection } from "@/chain/collection";
import { requireAppConfig } from "@/config/env";
import { puzzleFromSlug } from "@/config/routes";
import { PuzzleStatement } from "@/features/solve/PuzzleStatement";
import { SolveIsland } from "@/features/solve/SolveIsland";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = puzzleFromSlug((await params).slug);
  return { title: id === undefined ? "Solve" : `Solve ${PUZZLE_INFO[id]!.name}` };
}

/**
 * @notice Where a puzzle is solved: what it asks, an editor, a local test and a plate that redraws as you write.
 * @dev (1) The statement is a server component, rendered here from the cached collection and handed to the island as
 * its children, so only the editor, the test and the plate ship as client code. (2) The chain's facts (price, slots
 * left, smallest solution) are a courtesy: when it cannot be read the statement is shown without them, because writing
 * and testing a program need no chain. (3) The island is keyed by puzzle, so moving to another puzzle starts it afresh
 * and a draft is never carried across.
 * @param props - `params`: the puzzle's slug.
 */
export default async function Page({ params }: Props) {
  const id = puzzleFromSlug((await params).slug);
  if (id === undefined) notFound();

  const collection = await getCollection(requireAppConfig());
  const best = collection?.bestNodes[id];
  const facts = collection && {
    price: formatEth(BigInt(collection.mintPrice)),
    slotsLeft: slotsLeft(collection.solvedCount[id]!),
    best: best === undefined || best === 255 ? undefined : best,
  };

  return (
    <SolveIsland key={id} puzzleId={id}>
      <PuzzleStatement puzzleId={id} facts={facts} />
    </SolveIsland>
  );
}
