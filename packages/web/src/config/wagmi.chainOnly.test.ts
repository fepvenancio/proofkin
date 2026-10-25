import { parseChainConfig } from "@proofkin/core";
import { describe, expect, it, vi } from "vitest";

import { createWagmiConfig, getWagmiConfig } from "@/config/wagmi";

// `publicEnv` is read once, when `@/config/env` is first imported, so the variable must exist before the imports run.
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_CHAIN", "baseSepolia");
});

describe("the wallet configuration before any contract exists", () => {
  it("is made from the chain alone, since a deployment is what the admin console is there to make", () => {
    const result = parseChainConfig({ NEXT_PUBLIC_CHAIN: "baseSepolia" }, "NEXT_PUBLIC_");
    if (!result.ok) throw new Error(result.problems.join("; "));
    expect(createWagmiConfig({ app: result.config, server: false }).chains.map((c) => c.id)).toEqual([84532]);
  });

  it("is built from the environment's chain even when no contract is set", () => {
    expect(getWagmiConfig().chains.map((c) => c.id)).toEqual([84532]);
  });
});
