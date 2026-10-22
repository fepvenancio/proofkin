// Connecting a browser wallet (any EIP-1193 provider) and putting it on the right network.
import { type Account, type Address, type Chain, createWalletClient, custom, getAddress, toHex, type Transport, type WalletClient } from "viem";
import type { AppConfig } from "./config.ts";

export interface Eip1193 {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

const errorCode = (e: unknown): number | undefined =>
  typeof e === "object" && e !== null && "code" in e && typeof e.code === "number" ? e.code : undefined;

const USER_REJECTED = 4001;
const UNKNOWN_CHAIN = 4902;

async function ensureNetwork(provider: Eip1193, config: AppConfig): Promise<void> {
  const current = Number.parseInt(String(await provider.request({ method: "eth_chainId" })), 16);
  if (current === config.chain.id) return;

  const chainId = toHex(config.chain.id);
  const explorer = config.chain.blockExplorers?.default.url;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    if (errorCode(e) !== UNKNOWN_CHAIN) throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: config.chain.name,
          nativeCurrency: config.chain.nativeCurrency,
          rpcUrls: [config.rpcUrl],
          ...(explorer ? { blockExplorerUrls: [explorer] } : {}),
        },
      ],
    });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  }
}

/** A wallet client that is tied to an account, so it can send transactions. */
export type Wallet = WalletClient<Transport, Chain, Account>;

export async function connectWallet(provider: Eip1193, config: AppConfig): Promise<{ account: Address; walletClient: Wallet }> {
  let accounts: unknown;
  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (e) {
    if (errorCode(e) === USER_REJECTED) throw new Error("You rejected the connection request in your wallet.");
    throw e;
  }
  const first = Array.isArray(accounts) ? (accounts[0] as string | undefined) : undefined;
  if (!first) throw new Error("The wallet has no account to connect: unlock it or create one.");

  await ensureNetwork(provider, config);
  const account = getAddress(first);
  return { account, walletClient: createWalletClient({ account, chain: config.chain, transport: custom(provider) }) };
}
