"use client";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type State, WagmiProvider } from "wagmi";

import { getWagmiConfig } from "@/config/wagmi";
import { walletTheme } from "@/config/walletTheme";

/**
 * @notice Everything a wallet-aware component needs above it: wagmi, the query cache, and the RainbowKit modal.
 * @dev (1) `initialState` is the wallet connection the server read from the cookie, so the first paint already knows
 * whether someone is connected. (2) The query client and the wagmi configuration are created per mount, not at module
 * level: a module-level one would be shared by every visitor's render on the server. In the browser
 * `getWagmiConfig` hands back the same configuration each time.
 * @param props - `initialState`: the connection state the root layout read from the cookie. `children`: the app.
 */
export function Providers({ children, initialState }: { children: ReactNode; initialState?: State }) {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmiConfig] = useState(() => getWagmiConfig());
  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={walletTheme}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
