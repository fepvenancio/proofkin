import { PUZZLE_HUES, PUZZLE_INFO } from "@proofkin/core";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type CSSProperties } from "react";

import { getSite } from "@/chain/site";
import { getTokenDetail } from "@/chain/token";
import { CollectionUnavailable } from "@/components/CollectionUnavailable";
import { Plate } from "@/components/Plate";
import { TraitList } from "@/components/TraitList";
import { requireAppConfig } from "@/config/env";
import { parseTokenId, paths } from "@/config/routes";
import { describeArt } from "@/model/traits";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseTokenId((await params).id);
  return { title: id === undefined ? "Token" : `Token ${id}` };
}

/**
 * @notice One token: its art large, its traits, who solved it and who owns it.
 * @dev (1) The supply is checked before anything is rendered, so an id nobody has minted is "not found" without a
 * call that renders. (2) The solver comes from the `Solved` events and never changes; the owner is read live, because
 * tokens move. (3) It shows no program: the puzzles are the game, and the page should not hand out solutions.
 * @param props - `params`: the token id.
 */
export default async function Page({ params }: Props) {
  const id = parseTokenId((await params).id);
  if (id === undefined) notFound();

  const app = requireAppConfig();
  const site = await getSite(app);
  if (!site) return <CollectionUnavailable chainName={app.chain.name} />;
  if (id > site.collection.totalSupply) notFound();

  const result = await getTokenDetail(app, id);
  if (result.kind === "missing") notFound();
  if (result.kind === "unavailable") return <CollectionUnavailable chainName={app.chain.name} />;

  const token = result.value;
  const entry = site.entries.find((e) => e.tokenId === id);
  const puzzle = PUZZLE_INFO.find((p) => p.name === token.attributes.find((a) => a.trait === "Puzzle")?.value);
  const nodes = token.attributes.find((a) => a.trait === "Nodes")?.value;
  const explorer = app.chain.blockExplorers?.default.url;

  return (
    <div
      style={{ "--h": puzzle ? PUZZLE_HUES[puzzle.id] : undefined } as CSSProperties}
      className="grid gap-8 py-6 md:grid-cols-[minmax(0,26rem)_1fr] md:gap-12 lg:grid-cols-[minmax(0,34rem)_1fr] lg:gap-14"
    >
      <div>
        <Plate
          id={id}
          priority
          alt={puzzle && nodes !== undefined ? describeArt(token.name, puzzle.name, Number(nodes)) : token.name}
        />
        <nav aria-label="Other tokens" className="mt-4 flex justify-between tabular-nums">
          {id > 1 ? (
            <Link href={paths.token(id - 1)} className="underline underline-offset-4">{`Previous: #${id - 1}`}</Link>
          ) : (
            <span />
          )}
          {id < site.collection.totalSupply ? (
            <Link href={paths.token(id + 1)} className="underline underline-offset-4">{`Next: #${id + 1}`}</Link>
          ) : (
            <span />
          )}
        </nav>
      </div>

      <div>
        <h1 className="text-4xl font-semibold tracking-tight">{token.name}</h1>
        {puzzle && (
          <p className="mt-2 text-lg">
            {"Solves "}
            <Link href={paths.puzzle(puzzle.id)} className="text-puzzle underline underline-offset-4">
              {puzzle.name}
            </Link>
          </p>
        )}
        <div className="mt-8">
          <TraitList attributes={token.attributes} />
        </div>
        <dl className="mt-6 grid grid-cols-[minmax(9rem,max-content)_1fr] gap-x-8 gap-y-3 border-t border-rule pt-6">
          {entry && (
            <>
              <dt className="text-graphite">Solved by</dt>
              <dd className="font-address break-all text-sm">{entry.author}</dd>
            </>
          )}
          <dt className="text-graphite">Owner</dt>
          <dd className="font-address break-all text-sm">{token.owner}</dd>
        </dl>
        {explorer && (
          <p className="mt-6">
            <a href={`${explorer}/nft/${app.proofkin}/${id}`} className="underline underline-offset-4">
              View on the explorer
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
