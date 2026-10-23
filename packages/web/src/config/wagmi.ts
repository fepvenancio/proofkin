import { type AppConfig } from "@proofkin/core";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";

import { requireAppConfig, walletConnectProjectId } from "@/config/env";

export interface WagmiSettings {
  /** The deployment the wallet talks to; its chain is the only chain offered. */
  app: AppConfig;
  /** True while rendering on the server, where no wallet connector can start. */
  server: boolean;
  /** Lets WalletConnect-based wallets in. Without it only browser and Coinbase wallets are offered. */
  walletConnectProjectId?: string;
}

/**
 * @notice A wagmi configuration for the one chain this deployment lives on.
 * @dev (1) The connected wallet is kept in a cookie, so the server can render the page already knowing it, with no
 * flash of "connect". (2) On the server there are no connectors: WalletConnect reaches for browser storage as it
 * starts, and the server only needs the chain and the cookie to read the initial state. (3) Wallets that go through
 * WalletConnect are offered only when a project id exists.
 * @param settings - The deployment, where this runs, and the optional WalletConnect project id.
 * @returns The configuration. `getWagmiConfig` decides how often to build one: each server request gets its own, the
 * browser keeps one.
 */
export function createWagmiConfig({ app, server, walletConnectProjectId: projectId }: WagmiSettings) {
  const wallets = projectId
    ? [injectedWallet, metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet]
    : [injectedWallet, coinbaseWallet];

  return createConfig({
    chains: [app.chain],
    connectors: server
      ? []
      : connectorsForWallets([{ groupName: "Recommended", wallets }], {
          appName: "Proofkin",
          projectId: projectId ?? "",
        }),
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: { [app.chain.id]: http(app.rpcUrl) },
  });
}

let browserConfig: ReturnType<typeof createWagmiConfig> | undefined;

/**
 * @notice The wagmi configuration for the code that is rendering now.
 * @dev (1) On the server every call builds a new one. A configuration's connection state is overwritten by each
 * request's cookie (a server never counts as hydrated), so one shared by two requests would show a visitor the wallet
 * of whoever rendered after them. (2) In the browser there is one visitor and one store: a second configuration would
 * not see a connection made through the first, so it is built once.
 * @returns A configuration built from the app's settings.
 */
export function getWagmiConfig() {
  const create = (server: boolean) =>
    createWagmiConfig({ app: requireAppConfig(), server, walletConnectProjectId: walletConnectProjectId() });

  if (typeof window === "undefined") return create(true);
  browserConfig ??= create(false);
  return browserConfig;
}
