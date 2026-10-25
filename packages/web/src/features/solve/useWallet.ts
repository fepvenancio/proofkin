"use client";

import { type ChainConfig, type Wallet } from "@proofkin/core";
import { type Address } from "viem";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";

export interface WalletView {
  /** "connecting": a wallet that was connected is being reconnected, or its client has not arrived yet. */
  status: "connected" | "connecting" | "none";
  network: "right" | "wrong";
  account: Address | undefined;
  /** A client that can send on the app's chain; absent unless the wallet is connected, ready and on that chain. */
  walletClient: Wallet | undefined;
  switchNetwork: () => void;
}

/**
 * @notice What the mint flow needs to know about the visitor's wallet, in the words of its gate.
 * @dev (1) wagmi's four states become three: reconnecting after a page load is "connecting", so the page does not flash
 * "connect a wallet" at someone who is already connected. (2) A wallet on another network gets no client, so nothing
 * can be sent to the wrong chain by mistake, and a button to switch. (3) A connected account whose client has not
 * arrived is still "connecting", which is true for the moment it lasts.
 * @param app - The chain the page works on, the only one it will send to. A deployment is one, and so is a bare chain.
 * @returns The wallet's state, its client when it can send, and a way to switch network.
 */
export function useWallet(app: ChainConfig): WalletView {
  const account = useAccount();
  const { data: client } = useWalletClient({ chainId: app.chain.id });
  const { switchChain } = useSwitchChain();

  const network = account.chainId === app.chain.id ? "right" : "wrong";
  const switchNetwork = () => switchChain({ chainId: app.chain.id });

  if (account.status === "connecting" || account.status === "reconnecting") {
    return { status: "connecting", network, account: undefined, walletClient: undefined, switchNetwork };
  }
  if (account.status !== "connected" || !account.address) {
    return { status: "none", network, account: undefined, walletClient: undefined, switchNetwork };
  }
  if (network === "wrong") {
    return { status: "connected", network, account: account.address, walletClient: undefined, switchNetwork };
  }
  if (!client) {
    return { status: "connecting", network, account: account.address, walletClient: undefined, switchNetwork };
  }
  return { status: "connected", network, account: account.address, walletClient: client as Wallet, switchNetwork };
}
