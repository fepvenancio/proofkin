import "server-only";

import { type AppConfig } from "@proofkin/core";
import { createPublicClient, http } from "viem";

import { serverRpcUrl } from "@/config/env";

/**
 * @notice A read-only client for the chain, for server components.
 * @dev (1) Server code reads through `RPC_URL`, which may carry a provider key, so that key is never in the browser
 * bundle. The `server-only` import above makes the bundler fail the build if a client component ever reaches this file.
 * (2) Reads made at the same moment travel as one JSON-RPC batch: the collection alone is fourteen calls, and a public
 * node rate-limits by request.
 * @param app - The deployment to read.
 * @param env - The server settings; the real ones unless a test supplies others.
 * @returns A viem public client on the configured chain.
 */
export function getServerClient(app: AppConfig, env?: Record<string, string | undefined>) {
  return createPublicClient({ chain: app.chain, transport: http(serverRpcUrl(app, env), { batch: true }) });
}
