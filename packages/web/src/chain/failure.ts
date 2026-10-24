import "server-only";

import { type AppConfig } from "@proofkin/core";
import { BaseError, ContractFunctionRevertedError } from "viem";

import { type ReadResult } from "@/model/data";

/**
 * @notice What went wrong, in words that are safe to write to a log.
 * @dev viem's `message` repeats the URL of the request, and a provider URL usually carries its API key, so a viem
 * error is described by its `shortMessage` and `details` instead.
 * @param error - Whatever the read threw.
 * @returns One line.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof BaseError) return [error.shortMessage, error.details].filter(Boolean).join(" ");
  return error instanceof Error ? error.message : String(error);
}

/**
 * @notice Records, on the server, why something could not be read.
 * @dev The page says only that the chain could not be reached, so the cause goes to the log, where the person running
 * the deployment can find it: a node that is down, a wrong contract address and an unreadable answer all arrive here.
 * @param what - What was being read, as a noun phrase: "the collection".
 * @param app - The deployment being read.
 * @param error - Whatever the read threw.
 */
export function logFailure(what: string, app: AppConfig, error: unknown): void {
  console.error(`Could not read ${what} on ${app.chain.name}: ${describeFailure(error)}`);
}

/**
 * @notice Whether a read failed because the token does not exist, as opposed to because the chain could not be read.
 * @dev The two need different answers: a token that does not exist is a "not found" page, and a node that is down is
 * "try again". The contract says which with its `TokenDoesNotExist` error, which viem surfaces in the revert's data.
 * @param error - Whatever `tokenURI` or `ownerOf` threw.
 * @returns True only for that revert.
 */
export function isMissingToken(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName === "TokenDoesNotExist";
}

/**
 * @notice Runs the read of one token and says how it ended.
 * @dev A missing token is the contract answering, so it is not logged; anything else is a chain that could not be
 * read, so it is, once, on the server.
 * @param app - The deployment being read.
 * @param what - What is being read, as a noun phrase: "the token's art".
 * @param read - The read.
 * @returns What was read, or that the token does not exist, or that the chain is unavailable.
 */
export async function settle<T>(app: AppConfig, what: string, read: () => Promise<T>): Promise<ReadResult<T>> {
  try {
    return { kind: "found", value: await read() };
  } catch (error) {
    if (isMissingToken(error)) return { kind: "missing" };
    logFailure(what, app, error);
    return { kind: "unavailable" };
  }
}
