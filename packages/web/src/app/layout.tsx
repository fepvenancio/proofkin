import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import { Recursive } from "next/font/google";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";

import { Providers } from "@/app/providers";
import { ConfigProblems } from "@/components/ConfigProblems";
import { SiteHeader } from "@/components/SiteHeader";
import { readAppConfig } from "@/config/env";
import { SITE_DESCRIPTION, SITE_NAME } from "@/config/site";
import { createWagmiConfig } from "@/config/wagmi";

import type { Metadata } from "next";
import type { ReactNode } from "react";

/** One family for prose and for code: `MONO` switches an address to the monospaced setting, `CASL` stays linear. */
const recursive = Recursive({
  subsets: ["latin"],
  axes: ["MONO", "CASL"],
  variable: "--font-recursive",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
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
      <html lang="en" className={recursive.variable}>
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
    <html lang="en" className={recursive.variable}>
      <body>
        <Providers initialState={initialState}>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
