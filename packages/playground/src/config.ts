// Which chain and which contracts the page talks to, from the Vite environment (see .env.example).
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

export function parseConfig(env: Record<string, string | undefined>): ConfigResult {
  const problems: string[] = [];

  const names = Object.keys(CHAINS) as ChainName[];
  const name = names.find((n) => n === env.VITE_CHAIN);
  if (!name) problems.push(`VITE_CHAIN must be one of ${names.join(", ")} (it is ${env.VITE_CHAIN ? `"${env.VITE_CHAIN}"` : "not set"}).`);

  const address = (key: "VITE_PROOFKIN" | "VITE_RENDERER"): Address | undefined => {
    const value = env[key];
    if (value && isAddress(value, { strict: false })) return getAddress(value);
    problems.push(`${key} must be a contract address (it is ${value ? `"${value}"` : "not set"}).`);
    return undefined;
  };
  const proofkin = address("VITE_PROOFKIN");
  const renderer = address("VITE_RENDERER");

  let deployBlock = 0n;
  if (env.VITE_DEPLOY_BLOCK !== undefined && env.VITE_DEPLOY_BLOCK !== "") {
    if (/^\d+$/.test(env.VITE_DEPLOY_BLOCK)) deployBlock = BigInt(env.VITE_DEPLOY_BLOCK);
    else problems.push(`VITE_DEPLOY_BLOCK must be a block number (it is "${env.VITE_DEPLOY_BLOCK}").`);
  }

  let blockTime: number | undefined;
  if (env.VITE_BLOCK_TIME !== undefined && env.VITE_BLOCK_TIME !== "") {
    blockTime = Number(env.VITE_BLOCK_TIME);
    if (!(blockTime > 0)) problems.push(`VITE_BLOCK_TIME must be a positive number of seconds (it is "${env.VITE_BLOCK_TIME}").`);
  }

  if (!name || !proofkin || !renderer || problems.length > 0) return { ok: false, problems };
  const chain = CHAINS[name];
  const blockTimeSeconds = blockTime ?? DEFAULT_BLOCK_TIME[name];
  return {
    ok: true,
    config: {
      name,
      chain,
      rpcUrl: env.VITE_RPC_URL || chain.rpcUrls.default.http[0]!,
      proofkin,
      renderer,
      deployBlock,
      blockTimeSeconds,
      pollingIntervalMs: Math.max(100, Math.min(2000, Math.round(blockTimeSeconds * 500))),
    },
  };
}
