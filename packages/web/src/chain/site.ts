import "server-only";

import { type AppConfig } from "@proofkin/core";

import { getCollection } from "@/chain/collection";
import { getSolvedEntries } from "@/chain/solved";
import { type CollectionData, type SolvedEntry } from "@/model/data";

/**
 * @notice What almost every page needs: the state of the collection and every solution so far.
 * @dev The two are read together, and a page shows either both or its "could not reach" sentence: a gallery drawn
 * from half of the chain would look complete and not be.
 * @param app - The deployment to read.
 * @returns Both, or undefined when either could not be read (the cause is already in the server log).
 */
export async function getSite(
  app: AppConfig,
): Promise<{ collection: CollectionData; entries: SolvedEntry[] } | undefined> {
  const [collection, entries] = await Promise.all([getCollection(app), getSolvedEntries(app)]);
  return collection && entries ? { collection, entries } : undefined;
}
