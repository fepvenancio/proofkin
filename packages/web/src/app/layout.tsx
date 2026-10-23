import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";

import { Providers } from "@/app/providers";
import { ConfigProblems } from "@/components/ConfigProblems";
import { readAppConfig } from "@/config/env";
import { createWagmiConfig } from "@/config/wagmi";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Proofkin",
  description:
    "A collection you cannot buy: you solve it. Each token is a tiny program that solves an on-chain puzzle.",
};

/**
 * @notice The root of every page.
 * @dev (1) A deployment that is not configured shows what is wrong and nothing else, so a bad environment is never a
 * stack trace. (2) Otherwise it reads the wallet cookie on the server and hands the connection to the providers as their
 * initial state. Reading headers makes every page dynamic, which is what reading the chain on each request needs anyway.
 * @param props - `children`: the page.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const config = readAppConfig();
  if (!config.ok) {
    return (
      <html lang="en">
        <body>
          <ConfigProblems problems={config.problems} />
        </body>
      </html>
    );
  }

  const initialState = cookieToInitialState(
    createWagmiConfig({ app: config.config, server: true }),
    (await headers()).get("cookie"),
  );
  return (
    <html lang="en">
      <body>
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
