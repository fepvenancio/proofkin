import type { Account, Chain, Transport, WalletClient } from "viem";

/** A wallet client tied to an account on one chain, so it can send transactions. */
export type Wallet = WalletClient<Transport, Chain, Account>;
