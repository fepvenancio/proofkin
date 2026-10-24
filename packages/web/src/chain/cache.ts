import "server-only";

import { type AppConfig } from "@proofkin/core";
import { unstable_cache } from "next/cache";

import { type Json } from "@/model/data";

/** How long a read of the chain is reused, in seconds. */
export const CACHE_SECONDS = 60;

/**
 * @notice Reads from the chain at most once a minute, however many visitors ask.
 * @dev (1) The answer is shared between visitors and between pages, which is what keeps the node's request count flat
 * when the gallery is busy. (2) The key names the chain and the collection as well as the question, so two
 * deployments behind one server never see each other's answers. (3) A read that throws is not stored, so a node that
 * is down is asked again by the next visitor.
 * @param app - The deployment being read.
 * @param name - What is being read; part of the key.
 * @param read - The read itself.
 * @param tags - Names to revalidate on demand.
 * @returns The stored answer, or a fresh one when it is older than a minute.
 */
export function cachedRead<T extends Json>(
  app: AppConfig,
  name: string,
  read: () => Promise<T>,
  tags: string[],
): Promise<T> {
  return unstable_cache(read, ["proofkin", name, String(app.chain.id), app.proofkin], {
    revalidate: CACHE_SECONDS,
    tags,
  })();
}
