import "server-only";

import { type AppConfig, proofkinAbi } from "@proofkin/core";
import { type Hex, parseEventLogs, TransactionReceiptNotFoundError } from "viem";

import { getServerClient } from "@/chain/server";

export type Reveal = { kind: "solved"; tokenId: number } | { kind: "not-a-solve" } | { kind: "pending" };

/**
 * @notice Whether a transaction really was a solve of this collection, and which token it minted.
 * @dev The page is told a transaction hash by a browser, which anyone can lie to a server action about, so the server
 * reads the receipt itself: the transaction must have succeeded and carry a `Solved` event emitted by this collection's
 * contract (an event from another address that merely looks right does not count).
 * @param app - The deployment.
 * @param hash - The transaction hash.
 * @param env - The server settings; the real ones unless a test supplies others.
 * @returns "solved" with the token; "not-a-solve"; or "pending" when the node does not know the transaction yet. Any other
 * failure of the node is thrown, for the caller to log.
 */
export async function verifyReveal(
  app: AppConfig,
  hash: Hex,
  env?: Record<string, string | undefined>,
): Promise<Reveal> {
  let receipt;
  try {
    receipt = await getServerClient(app, env).getTransactionReceipt({ hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) return { kind: "pending" };
    throw error;
  }
  if (receipt.status !== "success") return { kind: "not-a-solve" };

  const [solved] = parseEventLogs({ abi: proofkinAbi, logs: receipt.logs, eventName: "Solved" }).filter(
    (log) => log.address.toLowerCase() === app.proofkin.toLowerCase(),
  );
  return solved ? { kind: "solved", tokenId: Number(solved.args.tokenId) } : { kind: "not-a-solve" };
}
