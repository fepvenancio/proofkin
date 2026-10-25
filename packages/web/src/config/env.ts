import {
  type AppConfig,
  type ChainConfig,
  type ChainConfigResult,
  type ConfigResult,
  parseChainConfig,
  parseConfig,
} from "@proofkin/core";

/* //////////////////////////////////////////////////////////////
                           PUBLIC SETTINGS
//////////////////////////////////////////////////////////////*/

/**
 * @notice Every setting the browser may see, by its NEXT_PUBLIC_ name.
 * @dev This is the only place the app reads `process.env`, and only as `process.env.NAME`: at build time Next.js
 * replaces exactly those expressions, and in the browser `process.env` itself is empty, so a computed read or a
 * whole-object read would work on the server and silently break on the client. `test/architecture.test.ts` enforces
 * both, and `env.test.ts` checks this list against `.env.example`.
 */
export const publicEnv = {
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_PROOFKIN: process.env.NEXT_PUBLIC_PROOFKIN,
  NEXT_PUBLIC_RENDERER: process.env.NEXT_PUBLIC_RENDERER,
  NEXT_PUBLIC_DEPLOY_BLOCK: process.env.NEXT_PUBLIC_DEPLOY_BLOCK,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_BLOCK_TIME: process.env.NEXT_PUBLIC_BLOCK_TIME,
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
} satisfies Record<string, string | undefined>;

type Env = Record<string, string | undefined>;

/**
 * @notice Reads and checks which deployment the app is pointed at.
 * @dev Never throws: a bad setup is a result the caller shows, with every problem at once, so one pass fixes it.
 * @param env - The settings to read; the app's own unless a test supplies others.
 * @returns The checked configuration, or every problem found.
 */
export function readAppConfig(env: Env = publicEnv): ConfigResult {
  return parseConfig(env, "NEXT_PUBLIC_");
}

/**
 * @notice The configuration, or an error that lists everything wrong with it.
 * @dev For code that cannot run without one, such as the wallet providers. The root layout checks first and shows
 * the problems instead, so a visitor never sees this error on a misconfigured deploy.
 * @param env - The settings to read; the app's own unless a test supplies others.
 * @returns The checked configuration.
 */
export function requireAppConfig(env: Env = publicEnv): AppConfig {
  const result = readAppConfig(env);
  if (!result.ok) {
    throw new Error(`Proofkin is not configured:\n${result.problems.map((problem) => `  ${problem}`).join("\n")}`);
  }
  return result.config;
}

/** Which collection the settings name: one, none yet, or an attempt that does not add up. */
export type CollectionSource =
  { kind: "configured"; app: AppConfig } | { kind: "none" } | { kind: "broken"; problems: string[] };

/**
 * @notice The collection the settings name, if they name one.
 * @dev None is not a problem: before the first deployment there is nothing to name, and the admin console is there to
 * make one. But a collection named in part, or with a typo, is a mistake and is reported as one. The chain is not
 * judged here: the root layout has already refused a page without one.
 * @param env - The settings to read; the app's own unless a test supplies others.
 * @returns The collection, nothing, or the problems with what was named.
 */
export function collectionFromEnv(env: Env = publicEnv): CollectionSource {
  const result = readAppConfig(env);
  if (result.ok) return { kind: "configured", app: result.config };
  const named = Boolean(env.NEXT_PUBLIC_PROOFKIN?.trim() || env.NEXT_PUBLIC_RENDERER?.trim());
  return named ? { kind: "broken", problems: result.problems } : { kind: "none" };
}

/**
 * @notice Reads and checks the chain the app is pointed at, and nothing about contracts.
 * @dev For what runs before a collection exists: the wallet providers every page sits in, and the admin console that
 * deploys one. Never throws, like `readAppConfig`.
 * @param env - The settings to read; the app's own unless a test supplies others.
 * @returns The checked chain, or every problem found.
 */
export function readChainConfig(env: Env = publicEnv): ChainConfigResult {
  return parseChainConfig(env, "NEXT_PUBLIC_");
}

/**
 * @notice The chain configuration, or an error that lists everything wrong with it.
 * @dev For code that cannot run without a chain, such as the wallet configuration. The root layout checks first and
 * shows the problems instead, so a visitor never sees this error on a misconfigured deploy.
 * @param env - The settings to read; the app's own unless a test supplies others.
 * @returns The checked chain.
 */
export function requireChainConfig(env: Env = publicEnv): ChainConfig {
  const result = readChainConfig(env);
  if (!result.ok) {
    throw new Error(`Proofkin is not configured:\n${result.problems.map((problem) => `  ${problem}`).join("\n")}`);
  }
  return result.config;
}

/**
 * @notice The WalletConnect project id, if one is set.
 * @dev A project id identifies the app to WalletConnect and is shipped to the browser by design. Without one the app
 * still works with browser wallets; only the QR-code wallets are missing.
 * @param env - The settings to read; the app's own unless a test supplies others.
 * @returns The trimmed id, or undefined when it is missing or blank.
 */
export function walletConnectProjectId(env: Env = publicEnv): string | undefined {
  const id = env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  return id ? id : undefined;
}

/* //////////////////////////////////////////////////////////////
                           SERVER SETTINGS
//////////////////////////////////////////////////////////////*/

/**
 * @notice The settings only the server may see.
 * @dev Never a NEXT_PUBLIC_ name, so the bundler cannot ship them. Only server code (`@/chain/server`) calls this.
 * @returns The server-only settings as they are in the environment now.
 */
export function serverEnv(): Env {
  return { RPC_URL: process.env.RPC_URL };
}

/**
 * @notice The RPC endpoint server code reads the chain through.
 * @dev A provider URL usually carries an API key, so it lives in `RPC_URL`, which never reaches the browser. The
 * public endpoint is the fallback, so a local setup needs nothing extra.
 * @param config - The deployment, whose public RPC URL is the fallback.
 * @param env - The server settings; the real ones unless a test supplies others.
 * @returns The URL to use.
 */
export function serverRpcUrl(config: AppConfig, env: Env = serverEnv()): string {
  const url = env.RPC_URL?.trim();
  return url ? url : config.rpcUrl;
}
