// What the views share: the chain, the saved commits, and the connected wallet.
import type { Address } from "viem";
import type { Reader } from "../chain.ts";
import type { AppConfig } from "../config.ts";
import type { PendingStore } from "../storage.ts";
import type { Wallet } from "../wallet.ts";

export interface WalletState {
  account: Address;
  walletClient: Wallet;
}

export interface App {
  config: AppConfig;
  client: Reader;
  store: PendingStore;
  wallet: WalletState | undefined;
  /** Ask the browser wallet to connect (and switch network). Throws a message fit for the player. */
  connect(): Promise<void>;
  /** Called whenever the wallet connects. Returns an unsubscribe function. */
  onWallet(listener: () => void): () => void;
}
