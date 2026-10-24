import "server-only";

import { type AppConfig, fetchSolved } from "@proofkin/core";

import { cachedRead } from "@/chain/cache";
import { logFailure } from "@/chain/failure";
import { getServerClient } from "@/chain/server";
import { type SolvedEntry } from "@/model/data";

/**
 * @notice Every solution since the deployment, oldest first, or `undefined` when the node cannot be read.
 * @dev Reading the history is the one expensive read of the app (a request per 9,000 blocks), so it goes through the
 * cache and is paid once a minute however many visitors there are.
 * @param app - The deployment to read.
 * @param env - The server settings; the real ones unless a test supplies others.
 * @returns The solutions, or undefined after logging why not.
 */
export async function getSolvedEntries(
  app: AppConfig,
  env?: Record<string, string | undefined>,
): Promise<SolvedEntry[] | undefined> {
  try {
    return await cachedRead(
      app,
      "solved",
      async () => {
        const rows = await fetchSolved(getServerClient(app, env), app);
        return rows.map(({ tokenId, puzzleId, author, nodeCount, rank }): SolvedEntry => ({
          tokenId,
          puzzleId,
          author,
          nodeCount,
          rank,
        }));
      },
      ["solved"],
    );
  } catch (error) {
    logFailure("the solutions", app, error);
    return undefined;
  }
}

/**
 * @notice Whether the history found everything.
 * @dev The history is read from the deploy block in the configuration. If that block is too late, solutions are
 * missing from every list, and the page should say so instead of showing short lists as if they were complete.
 * @param found - How many solutions the history held.
 * @param totalSupply - How many tokens exist.
 * @returns A sentence for the visitor, or undefined when nothing is missing.
 */
export function coverageProblem(found: number, totalSupply: number): string | undefined {
  if (found >= totalSupply) return undefined;
  return `The lists below know ${found} of ${totalSupply} solutions: the deploy block in this deployment's settings is probably too late.`;
}
