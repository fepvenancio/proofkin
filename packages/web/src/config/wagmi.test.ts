import { describe, expect, it, vi } from "vitest";

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
const app = requireAppConfig(env);

const ids = (config: ReturnType<typeof createWagmiConfig>) => config.connectors.map((c) => c.id);

describe("createWagmiConfig", () => {
  it("serves only the configured chain", () => {
    const config = createWagmiConfig({ app, server: false });
    expect(config.chains.map((c) => c.id)).toEqual([84532]);
  });

  it("is a server-rendering config that keeps the connected wallet in a cookie", () => {
    const config = createWagmiConfig({ app, server: false });
    expect(config._internal.ssr).toBe(true);
    expect(config.storage).not.toBeNull();
  });

  it("has no wallet connectors on the server, where WalletConnect cannot start", () => {
    expect(createWagmiConfig({ app, server: true }).connectors).toHaveLength(0);
  });

  it("offers browser wallets without a WalletConnect project id, and no WalletConnect", () => {
    const found = ids(createWagmiConfig({ app, server: false }));
    expect(found.length).toBeGreaterThan(0);
    expect(found).not.toContain("walletConnect");
  });

  it("adds WalletConnect when there is a project id", () => {
    const found = ids(createWagmiConfig({ app, server: false, walletConnectProjectId: "abc123" }));
    expect(found).toContain("walletConnect");
  });
});

describe("getWagmiConfig in a browser", () => {
  it("is one configuration for the whole page, so a connection made anywhere is seen everywhere", () => {
    expect(getWagmiConfig()).toBe(getWagmiConfig());
  });

  it("offers wallet connectors, which a browser can start", () => {
    expect(getWagmiConfig().connectors.length).toBeGreaterThan(0);
  });
});
