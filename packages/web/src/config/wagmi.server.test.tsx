// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { cookieToInitialState, serialize, WagmiProvider } from "wagmi";

import { requireAppConfig } from "@/config/env";
import { createWagmiConfig, getWagmiConfig } from "@/config/wagmi";

// `publicEnv` is read once, when `@/config/env` is first imported, so the variables must exist before the imports run.
const env = vi.hoisted(() => {
  const settings = {
    NEXT_PUBLIC_CHAIN: "baseSepolia",
    NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
  return settings;
});
const ALICE = "0x000000000000000000000000000000000000A11c";
const BOB = "0x0000000000000000000000000000000000000B0b";

/** The `wagmi.store` cookie a browser sends once `account` has connected. */
function cookieFor(account: string) {
  const uid = `uid-${account}`;
  const connector = { id: "injected", name: "Browser Wallet", type: "injected", uid };
  const stored = {
    state: {
      connections: new Map([[uid, { accounts: [account], chainId: 84532, connector }]]),
      chainId: 84532,
      current: uid,
    },
    version: 2,
  };
  return `wagmi.store=${serialize(stored)}`;
}

/** What the root layout does with a request's cookie. */
const initialStateOf = (account: string) =>
  cookieToInitialState(createWagmiConfig({ app: requireAppConfig(env), server: true }), cookieFor(account));

/** Server-rendering a page is what hands the request's wallet to its configuration. */
const renderRequest = (config: ReturnType<typeof getWagmiConfig>, account: string) =>
  renderToString(
    <WagmiProvider config={config} initialState={initialStateOf(account)}>
      <span />
    </WagmiProvider>,
  );

const accountsOf = (config: ReturnType<typeof getWagmiConfig>) =>
  [...config.state.connections.values()].flatMap((connection) => [...connection.accounts]);

describe("getWagmiConfig on the server", () => {
  it("has no wallet connectors, because nothing on a server can start one", () => {
    expect(getWagmiConfig().connectors).toHaveLength(0);
  });

  it("gives each request its own configuration, so a later request's wallet never replaces an earlier one's", () => {
    const first = getWagmiConfig();
    renderRequest(first, ALICE);
    const second = getWagmiConfig();
    renderRequest(second, BOB);

    expect(accountsOf(first)).toEqual([ALICE]);
    expect(accountsOf(second)).toEqual([BOB]);
  });
});
