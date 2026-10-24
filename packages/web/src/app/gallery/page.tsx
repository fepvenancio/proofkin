import { PUZZLE_INFO } from "@proofkin/core";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getSite } from "@/chain/site";
import { coverageProblem } from "@/chain/solved";
import { CollectionUnavailable } from "@/components/CollectionUnavailable";
import { Pager } from "@/components/Pager";
import { PlateGrid } from "@/components/PlateGrid";
import { PuzzleFilter } from "@/components/PuzzleFilter";
import { requireAppConfig } from "@/config/env";
import { pageCount, pageOf, parseGalleryQuery } from "@/config/routes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Gallery" };

/**
 * @notice Every token, newest first, as plates; filtered to one puzzle on request.
 * @dev (1) The whole grid is built from the `Solved` events, so no token is rendered to draw it: the art loads
 * separately, plate by plate, as they scroll into view. (2) The filter and the page are in the address, so a view can
 * be shared, and a page beyond the last is "not found" rather than an empty grid.
 * @param props - `searchParams`: `puzzle` (a slug) and `page`.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseGalleryQuery(await searchParams);
  const app = requireAppConfig();
  const site = await getSite(app);
  if (!site) return <CollectionUnavailable chainName={app.chain.name} />;

  const { collection, entries } = site;
  const shown = entries.filter((e) => query.puzzle === undefined || e.puzzleId === query.puzzle).reverse();
  const pages = pageCount(shown.length);
  if (query.page > pages) notFound();

  const puzzleName = query.puzzle === undefined ? undefined : PUZZLE_INFO[query.puzzle]!.name;
  const coverage = coverageProblem(entries.length, collection.totalSupply);

  return (
    <>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">Gallery</h1>
      <div className="mt-6">
        <PuzzleFilter current={query.puzzle} />
      </div>
      {coverage && (
        <p role="status" className="mt-4">
          {coverage}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="mt-8">
          {puzzleName ? `Nobody has solved ${puzzleName} yet.` : "Nothing has been solved yet."}{" "}
          <Link href="/" className="underline underline-offset-4">
            See the puzzles
          </Link>
        </p>
      ) : (
        <>
          <p className="mt-6 tabular-nums">
            {`${shown.length} ${puzzleName ?? ""} token${shown.length === 1 ? "" : "s"}, newest first.`.replace(
              "  ",
              " ",
            )}
          </p>
          <div className="mt-6">
            <PlateGrid entries={pageOf(shown, query.page)} bestNodes={collection.bestNodes} />
          </div>
        </>
      )}
      <div className="mt-12">
        <Pager query={query} pages={pages} />
      </div>
    </>
  );
}
