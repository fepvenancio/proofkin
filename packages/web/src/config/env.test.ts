// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { publicEnv, readAppConfig, requireAppConfig, serverRpcUrl, walletConnectProjectId } from "@/config/env";

const PROOFKIN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const RENDERER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const valid = {
  NEXT_PUBLIC_CHAIN: "baseSepolia",
  NEXT_PUBLIC_PROOFKIN: PROOFKIN,
  NEXT_PUBLIC_RENDERER: RENDERER,
};

describe("readAppConfig", () => {
  it("reads the deployment from NEXT_PUBLIC_ variables", () => {
    const result = readAppConfig({ ...valid, NEXT_PUBLIC_DEPLOY_BLOCK: "123" });
    if (!result.ok) throw new Error(result.problems.join("; "));
    expect(result.config).toMatchObject({
      name: "baseSepolia",
      proofkin: PROOFKIN,
      renderer: RENDERER,
      deployBlock: 123n,
    });
    expect(result.config.chain.id).toBe(84532);
  });

  it("reports every problem at once, naming the variable to fix", () => {
    const result = readAppConfig({ NEXT_PUBLIC_CHAIN: "mainnet", NEXT_PUBLIC_PROOFKIN: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = result.problems.join("\n");
    expect(text).toMatch(/NEXT_PUBLIC_CHAIN/);
    expect(text).toMatch(/NEXT_PUBLIC_PROOFKIN/);
    expect(text).toMatch(/NEXT_PUBLIC_RENDERER/);
    expect(text).not.toMatch(/VITE_/);
  });

  it("does not read the Vite names", () => {
    expect(readAppConfig({ VITE_CHAIN: "anvil", VITE_PROOFKIN: PROOFKIN, VITE_RENDERER: RENDERER }).ok).toBe(false);
  });
});

describe("what Deploy.s.sol prints for this app", () => {
  // The same text as test_theNextEnvBlockIsTheSameSettingsUnderTheNextPublicPrefix in contracts/test/Deploy.t.sol.
  const printed = [
    "NEXT_PUBLIC_CHAIN=baseSepolia",
    "NEXT_PUBLIC_PROOFKIN=0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "NEXT_PUBLIC_RENDERER=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    "NEXT_PUBLIC_DEPLOY_BLOCK=123",
  ].join("\n");

  it("is a complete, valid configuration", () => {
    const env = Object.fromEntries(printed.split("\n").map((line) => line.split("=") as [string, string]));
    const result = readAppConfig(env);
    if (!result.ok) throw new Error(result.problems.join("; "));
    expect(result.config).toMatchObject({
      name: "baseSepolia",
      proofkin: PROOFKIN,
      renderer: RENDERER,
      deployBlock: 123n,
    });
  });
});

describe("requireAppConfig", () => {
  it("hands back the configuration when it is valid", () => {
    expect(requireAppConfig(valid).name).toBe("baseSepolia");
  });

  it("throws one error that lists every problem", () => {
    expect(() => requireAppConfig({})).toThrowError(
      /not configured[\s\S]*NEXT_PUBLIC_CHAIN[\s\S]*NEXT_PUBLIC_PROOFKIN/,
    );
  });
});

describe("walletConnectProjectId", () => {
  it("is the trimmed id when there is one", () => {
    expect(walletConnectProjectId({ NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "  abc123 " })).toBe("abc123");
  });

  it("is undefined when it is missing or blank, so the app falls back to injected wallets", () => {
    expect(walletConnectProjectId({})).toBeUndefined();
    expect(walletConnectProjectId({ NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "   " })).toBeUndefined();
  });
});

describe("serverRpcUrl", () => {
  const config = requireAppConfig(valid);

  it("prefers the server-only RPC_URL, which may carry a provider key", () => {
    expect(serverRpcUrl(config, { RPC_URL: "https://keyed.example/abc" })).toBe("https://keyed.example/abc");
  });

  it("ignores a blank RPC_URL and falls back to the public one", () => {
    expect(serverRpcUrl(config, { RPC_URL: "  " })).toBe(config.rpcUrl);
    expect(serverRpcUrl(config, {})).toBe(config.rpcUrl);
  });
});

describe("publicEnv", () => {
  it("lists exactly the public variables .env.example documents, so neither can drift", () => {
    const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const documented = example
      .split("\n")
      .map((line) => line.match(/^(NEXT_PUBLIC_[A-Z_]+)=/)?.[1])
      .filter((name): name is string => name !== undefined);
    expect(documented.sort()).toEqual(Object.keys(publicEnv).sort());
  });

  it("holds only NEXT_PUBLIC_ names, the only ones Next.js ships to the browser", () => {
    for (const name of Object.keys(publicEnv)) expect(name).toMatch(/^NEXT_PUBLIC_/);
  });
});
