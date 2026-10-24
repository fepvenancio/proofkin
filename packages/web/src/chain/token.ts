import "server-only";

import { type AppConfig, fetchToken, proofkinAbi } from "@proofkin/core";

import { cachedRead } from "@/chain/cache";
import { settle } from "@/chain/failure";
import { getServerClient } from "@/chain/server";
import { type ReadResult, type TokenDetail } from "@/model/data";

/**
 * @notice What the token page shows about one token: its name, the traits the contract computes, and its owner.
 * @dev (1) The traits are read live from `tokenURI`, because one of them ("Optimal") changes when a smaller solution
 * is minted; the cache keeps it for a minute at most. (2) The owner is read apart from the solver: tokens move, and
 * the solver, who is in the `Solved` events, never changes. (3) The image is not part of this: it has its own address.
 * @param app - The deployment to read.
 * @param id - The token.
 * @param env - The server settings; the real ones unless a test supplies others.
 * @returns The token; or that it does not exist; or that the chain could not be read.
 */
export function getTokenDetail(
  app: AppConfig,
  id: number,
  env?: Record<string, string | undefined>,
): Promise<ReadResult<TokenDetail>> {
  return settle(app, `token ${id}`, () =>
    cachedRead(
      app,
      `token-${id}`,
      async (): Promise<TokenDetail> => {
        const client = getServerClient(app, env);
        const [view, owner] = await Promise.all([
          fetchToken(client, app, id),
          client.readContract({ address: app.proofkin, abi: proofkinAbi, functionName: "ownerOf", args: [BigInt(id)] }),
        ]);
        return {
          id,
          name: view.name,
          attributes: view.attributes.map(({ trait, value }) => ({ trait, value })),
          owner,
        };
      },
      ["token", `token-${id}`],
    ),
  );
}
