"use server";

import { updateTag } from "next/cache";
import { type Hex } from "viem";

import { logFailure } from "@/chain/failure";
import { createGuard } from "@/chain/guard";
import { verifyReveal } from "@/chain/refresh";
import { requireAppConfig } from "@/config/env";

/** Twenty real checks a minute is far more than the mints of one site, and cheap to be refused beyond. */
const guard = createGuard({ limit: 20, windowMs: 60_000, remember: 500 });

/**
 * @notice Makes the gallery, the leaderboards and the collection's counts fresh at once, after a reveal.
 * @dev (1) They are cached for a minute, so without this a minter who clicks through to the token they just made could
 * find it missing for up to a minute. (2) A server action is a public endpoint, so it believes nothing it is told: the
 * server reads the transaction's receipt and proves it was a solve of this collection before it expires anything, and
 * each hash is acted on once, so replaying a public hash cannot keep the caches cold. (3) It never throws: the page has
 * already worked, and this only makes it sooner.
 * @param revealTx - The hash of the reveal transaction, as the browser has it.
 * @returns Whether the caches were expired.
 */
export async function refreshAfterMint(revealTx: string): Promise<{ refreshed: boolean }> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(revealTx)) return { refreshed: false };
  const key = revealTx.toLowerCase();
  if (guard.allow(key) !== "ok") return { refreshed: false };

  const app = requireAppConfig();
  try {
    const reveal = await verifyReveal(app, key as Hex);
    if (reveal.kind !== "solved") return { refreshed: false };
    guard.done(key);
    updateTag("collection");
    updateTag("solved");
    return { refreshed: true };
  } catch (error) {
    logFailure("the reveal transaction", app, error);
    return { refreshed: false };
  }
}
