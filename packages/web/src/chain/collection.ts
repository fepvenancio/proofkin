import "server-only";

import { type AppConfig, type CollectionState, readCollection } from "@proofkin/core";
import { BaseError } from "viem";

import { getServerClient } from "@/chain/server";

/**
 * @notice What went wrong, in words that are safe to write to a log.
 * @dev viem's `message` repeats the URL of the request, and a provider URL usually carries its API key, so a viem
 * error is described by its `shortMessage` and `details` instead.
 * @param error - Whatever the read threw.
 * @returns One line.
 */
function describeFailure(error: unknown): string {
  if (error instanceof BaseError) return [error.shortMessage, error.details].filter(Boolean).join(" ");
  return error instanceof Error ? error.message : String(error);
}

/**
 * @notice The collection's state for a server-rendered page, or `undefined` when the chain cannot be read.
 * @dev (1) A failed read is a value, because the page decides what a visitor sees without it. (2) The page says only
 * that the chain could not be reached, so the cause goes to the server log, where the person running the deployment
 * can find it: a node that is down, a wrong contract address and an unreadable answer all arrive here.
 * @param app - The deployment to read.
 * @param env - The server settings; the real ones unless a test supplies others.
 * @returns The collection, or undefined after logging why not.
 */
export async function tryReadCollection(
  app: AppConfig,
  env?: Record<string, string | undefined>,
): Promise<CollectionState | undefined> {
  try {
    return await readCollection(getServerClient(app, env), app);
  } catch (error) {
    console.error(`Could not read the collection on ${app.chain.name}: ${describeFailure(error)}`);
    return undefined;
  }
}
