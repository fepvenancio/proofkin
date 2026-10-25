// Which chain and which contracts an app talks to, from its environment (see the playground's .env.example).
import { type Address, type Chain, getAddress, isAddress } from "viem";
import { base, baseSepolia, foundry } from "viem/chains";

const CHAINS = { anvil: foundry, baseSepolia, base } as const;
export type ChainName = keyof typeof CHAINS;
const DEFAULT_BLOCK_TIME: Record<ChainName, number> = { anvil: 1, baseSepolia: 2, base: 2 };

/** The chain an app talks to and how to reach it: all there is to know before any contract exists. */
export interface ChainConfig {
  name: ChainName;
  chain: Chain;
  rpcUrl: string;
  /** Used only to turn a block count into a rough wait. */
  blockTimeSeconds: number;
  /** How often to ask the node about new blocks and receipts: half a block, never slower than 2 s. */
  pollingIntervalMs: number;
}

export interface AppConfig extends ChainConfig {
  proofkin: Address;
  renderer: Address;
  /** Where the gallery starts reading `Solved` events. */
  deployBlock: bigint;
}

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; problems: string[] };
export type ChainConfigResult = { ok: true; config: ChainConfig } | { ok: false; problems: string[] };

type Env = Record<string, string | undefined>;

function readChainName(env: Env, key: (setting: string) => string, problems: string[]): ChainName | undefined {
  const names = Object.keys(CHAINS) as ChainName[];
  const chainValue = env[key("CHAIN")];
  const name = names.find((n) => n === chainValue);
  if (!name) problems.push(`${key("CHAIN")} must be one of ${names.join(", ")} (it is ${chainValue ? `"${chainValue}"` : "not set"}).`);
  return name;
}

function readBlockTime(env: Env, key: (setting: string) => string, problems: string[]): number | undefined {
  const blockTimeValue = env[key("BLOCK_TIME")];
  if (blockTimeValue === undefined || blockTimeValue === "") return undefined;
  const blockTime = Number(blockTimeValue);
  if (!(blockTime > 0)) problems.push(`${key("BLOCK_TIME")} must be a positive number of seconds (it is "${blockTimeValue}").`);
  return blockTime;
}

function chainConfig(name: ChainName, blockTime: number | undefined, rpcUrl: string | undefined): ChainConfig {
  const chain = CHAINS[name];
  const blockTimeSeconds = blockTime ?? DEFAULT_BLOCK_TIME[name];
  return {
    name,
    chain,
    rpcUrl: rpcUrl || chain.rpcUrls.default.http[0]!,
    blockTimeSeconds,
    pollingIntervalMs: Math.max(100, Math.min(2000, Math.round(blockTimeSeconds * 500))),
  };
}

/**
 * @notice Reads and checks the chain an app is pointed at, and nothing about contracts.
 * @dev For the pages that run before any contract exists, as the admin console does to deploy one. The settings are the
 * same CHAIN, RPC_URL and BLOCK_TIME that `parseConfig` reads, under the same prefix, with the same messages.
 * @param env The environment to read, usually `import.meta.env` or `process.env`.
 * @param prefix What the variable names start with.
 * @returns The checked chain, or every problem found.
 */
export function parseChainConfig(env: Env, prefix = "VITE_"): ChainConfigResult {
  const problems: string[] = [];
  const key = (setting: string) => `${prefix}${setting}`;

  const name = readChainName(env, key, problems);
  const blockTime = readBlockTime(env, key, problems);

  if (!name || problems.length > 0) return { ok: false, problems };
  return { ok: true, config: chainConfig(name, blockTime, env[key("RPC_URL")]) };
}

/**
 * @notice Reads and checks the deployment an app is pointed at.
 * @dev The settings are CHAIN, PROOFKIN, RENDERER, DEPLOY_BLOCK, RPC_URL and BLOCK_TIME, under a prefix: Vite
 * exposes VITE_*, a Next.js app NEXT_PUBLIC_*. Every problem is reported at once, named by the variable the
 * caller has to fix, so one pass sets the environment right.
 * @param env The environment to read, usually `import.meta.env` or `process.env`.
 * @param prefix What the variable names start with.
 * @returns The checked configuration, or every problem found.
 */
export function parseConfig(env: Env, prefix = "VITE_"): ConfigResult {
  const problems: string[] = [];
  const key = (setting: string) => `${prefix}${setting}`;

  const name = readChainName(env, key, problems);

  const address = (setting: "PROOFKIN" | "RENDERER"): Address | undefined => {
    const value = env[key(setting)];
    if (value && isAddress(value, { strict: false })) return getAddress(value);
    problems.push(`${key(setting)} must be a contract address (it is ${value ? `"${value}"` : "not set"}).`);
    return undefined;
  };
  const proofkin = address("PROOFKIN");
  const renderer = address("RENDERER");

  let deployBlock = 0n;
  const deployBlockValue = env[key("DEPLOY_BLOCK")];
  if (deployBlockValue !== undefined && deployBlockValue !== "") {
    if (/^\d+$/.test(deployBlockValue)) deployBlock = BigInt(deployBlockValue);
    else problems.push(`${key("DEPLOY_BLOCK")} must be a block number (it is "${deployBlockValue}").`);
  }

  const blockTime = readBlockTime(env, key, problems);

  if (!name || !proofkin || !renderer || problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    config: { ...chainConfig(name, blockTime, env[key("RPC_URL")]), proofkin, renderer, deployBlock },
  };
}
