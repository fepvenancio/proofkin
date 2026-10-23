import "server-only";

import { type AppConfig } from "@proofkin/core";
import { createPublicClient, http } from "viem";

import { serverRpcUrl } from "@/config/env";

/**
 * @notice A read-only client for the chain, for server components.
 * @dev Server code reads through `RPC_URL`, which may carry a provider key, so that key is never in the browser
 * bundle. The `server-only` import above makes the bundler fail the build if a client component ever reaches this file.
 * @param app - The deployment to read.
 * @param env - The server settings; the real ones unless a test supplies others.
 * @returns A viem public client on the configured chain.
 */
export function getServerClient(app: AppConfig, env?: Record<string, string | undefined>) {
  return createPublicClient({ chain: app.chain, transport: http(serverRpcUrl(app, env)) });
}
