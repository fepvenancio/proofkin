// Which chain and which contracts an app talks to, from its environment (see the playground's .env.example).
import { type Address, type Chain, getAddress, isAddress } from "viem";
import { base, baseSepolia, foundry } from "viem/chains";

const CHAINS = { anvil: foundry, baseSepolia, base } as const;
export type ChainName = keyof typeof CHAINS;
const DEFAULT_BLOCK_TIME: Record<ChainName, number> = { anvil: 1, baseSepolia: 2, base: 2 };

export interface AppConfig {
  name: ChainName;
  chain: Chain;
  rpcUrl: string;
  proofkin: Address;
  renderer: Address;
  /** Where the gallery starts reading `Solved` events. */
  deployBlock: bigint;
  /** Used only to turn a block count into a rough wait. */
  blockTimeSeconds: number;
  /** How often to ask the node about new blocks and receipts: half a block, never slower than 2 s. */
  pollingIntervalMs: number;
}

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; problems: string[] };

/**
 * @notice Reads and checks the deployment an app is pointed at.
 * @dev The settings are CHAIN, PROOFKIN, RENDERER, DEPLOY_BLOCK, RPC_URL and BLOCK_TIME, under a prefix: Vite
 * exposes VITE_*, a Next.js app NEXT_PUBLIC_*. Every problem is reported at once, named by the variable the
 * caller has to fix, so one pass sets the environment right.
 * @param env The environment to read, usually `import.meta.env` or `process.env`.
 * @param prefix What the variable names start with.
 * @returns The checked configuration, or every problem found.
 */
export function parseConfig(env: Record<string, string | undefined>, prefix = "VITE_"): ConfigResult {
  const problems: string[] = [];
  const key = (setting: string) => `${prefix}${setting}`;

  const names = Object.keys(CHAINS) as ChainName[];
  const chainValue = env[key("CHAIN")];
  const name = names.find((n) => n === chainValue);
  if (!name) problems.push(`${key("CHAIN")} must be one of ${names.join(", ")} (it is ${chainValue ? `"${chainValue}"` : "not set"}).`);

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

  let blockTime: number | undefined;
  const blockTimeValue = env[key("BLOCK_TIME")];
  if (blockTimeValue !== undefined && blockTimeValue !== "") {
    blockTime = Number(blockTimeValue);
    if (!(blockTime > 0)) problems.push(`${key("BLOCK_TIME")} must be a positive number of seconds (it is "${blockTimeValue}").`);
  }

  if (!name || !proofkin || !renderer || problems.length > 0) return { ok: false, problems };
  const chain = CHAINS[name];
  const blockTimeSeconds = blockTime ?? DEFAULT_BLOCK_TIME[name];
  return {
    ok: true,
    config: {
      name,
      chain,
      rpcUrl: env[key("RPC_URL")] || chain.rpcUrls.default.http[0]!,
      proofkin,
      renderer,
      deployBlock,
      blockTimeSeconds,
      pollingIntervalMs: Math.max(100, Math.min(2000, Math.round(blockTimeSeconds * 500))),
    },
  };
}
