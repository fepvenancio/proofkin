"use client";

import { formatEth, type Reader, SLOTS_PER_PUZZLE, PUZZLES } from "@proofkin/core";
import { readCollectionAdmin } from "@proofkin/core/launch";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";

import { queryKeys } from "@/config/queryKeys";

const link = "underline underline-offset-4";

/**
 * @notice How a collection stands, read from the chain: who owns it, which renderer it uses and whether that can still be
 * replaced, the price, how much is solved, and the fees it holds.
 * @dev (1) Read in the browser on every visit and never cached: the console is where a change is made, and has to show
 * the change the moment it lands. (2) Everything here is public, so it is for anyone; who may change it is the owner's
 * wallet, and the contract decides that, not this page. (3) Addresses are shown whole, since a person is meant to check
 * them character by character.
 * @param props - `chain`: its id, its name, and its explorer's address if it has one. `proofkin`: the collection.
 * `account`: the connected account, if any, so the owner is told they are one. `reader`: a read-only client; without one
 * the panel waits.
 */
export function CollectionStatus({
  chain,
  proofkin,
  account,
  reader,
}: {
  chain: { id: number; name: string; explorer?: string };
  proofkin: Address;
  account: Address | undefined;
  reader: Reader | undefined;
}) {
  const query = useQuery({
    queryKey: queryKeys.collectionStatus({ chain, proofkin }),
    queryFn: () => readCollectionAdmin(reader!, proofkin),
    enabled: reader !== undefined,
  });

  const state = query.data;
  const explorer = (address: string, what: string) =>
    chain.explorer ? (
      <a href={`${chain.explorer}/address/${address}`} className={link}>
        {`${what} on the explorer`}
      </a>
    ) : null;

  return (
    <section aria-labelledby="collection-heading" className="mt-10 border-t border-rule pt-8">
      <h2 id="collection-heading" className="text-2xl font-semibold tracking-tight">
        Collection
      </h2>
      {query.isError ? (
        <div role="alert" className="mt-3">
          <p className="max-w-prose font-semibold">Could not read the collection from the chain.</p>
          <button type="button" className={`${link} mt-2`} onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : !state ? (
        <p role="status" className="mt-3 text-graphite">
          Reading the chain…
        </p>
      ) : (
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[11em_1fr]">
          <dt className="text-graphite">Chain</dt>
          <dd>{chain.name}</dd>
          <dt className="text-graphite">Collection</dt>
          <dd>
            <code className="font-address break-all">{proofkin}</code>
            <div>{explorer(proofkin, "Collection")}</div>
          </dd>
          <dt className="text-graphite">Owner</dt>
          <dd>
            <code className="font-address break-all">{state.owner}</code>
            {account?.toLowerCase() === state.owner.toLowerCase() && <p>You are the owner.</p>}
          </dd>
          <dt className="text-graphite">Renderer</dt>
          <dd>
            <code className="font-address break-all">{state.renderer}</code>
            <p>{state.rendererLocked ? "Locked for good." : "Open: it can still be replaced."}</p>
            <div>{explorer(state.renderer, "Renderer")}</div>
          </dd>
          <dt className="text-graphite">Mint price</dt>
          <dd>{formatEth(state.mintPrice)}</dd>
          <dt className="text-graphite">Solved</dt>
          <dd className="tabular-nums">{`${state.totalSupply} of ${SLOTS_PER_PUZZLE * PUZZLES}`}</dd>
          <dt className="text-graphite">Held in the contract</dt>
          <dd>{formatEth(state.balance)}</dd>
        </dl>
      )}
    </section>
  );
}
