import "server-only";

import { type AppConfig, readCollection } from "@proofkin/core";

import { cachedRead } from "@/chain/cache";
import { logFailure } from "@/chain/failure";
import { getServerClient } from "@/chain/server";
import { type CollectionData } from "@/model/data";

/**
 * @notice The collection's state for a server-rendered page, or `undefined` when the chain cannot be read.
 * @dev (1) A failed read is a value, because the page decides what a visitor sees without it; the cause goes to the
 * server log (`logFailure`). (2) The read goes through the cache, so the fourteen calls it makes are paid once a minute.
 * (3) The price travels as a string of wei, since the cache stores JSON and JSON has no bigint.
 * @param app - The deployment to read.
 * @param env - The server settings; the real ones unless a test supplies others.
 * @returns The collection, or undefined after logging why not.
 */
export async function getCollection(
  app: AppConfig,
  env?: Record<string, string | undefined>,
): Promise<CollectionData | undefined> {
  try {
    return await cachedRead(
      app,
      "collection",
      async (): Promise<CollectionData> => {
        const state = await readCollection(getServerClient(app, env), app);
        return {
          mintPrice: state.mintPrice.toString(),
          totalSupply: Number(state.totalSupply),
          solvedCount: state.solvedCount,
          bestNodes: state.bestNodes,
        };
      },
      ["collection"],
    );
  } catch (error) {
    logFailure("the collection", app, error);
    return undefined;
  }
}
