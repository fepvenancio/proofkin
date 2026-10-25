import { describe, expect, it } from "vitest";
import { parseChainConfig, parseConfig } from "../src/config.ts";

const PROOFKIN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const RENDERER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const base = { VITE_CHAIN: "anvil", VITE_PROOFKIN: PROOFKIN, VITE_RENDERER: RENDERER };

describe("parseConfig", () => {
  it("reads a local chain setup, with sensible defaults", () => {
    const r = parseConfig(base);
    if (!r.ok) throw new Error(r.problems.join("; "));
    expect(r.config).toMatchObject({
      name: "anvil",
      rpcUrl: "http://127.0.0.1:8545",
      proofkin: PROOFKIN,
      renderer: RENDERER,
      deployBlock: 0n,
      blockTimeSeconds: 1,
    });
    expect(r.config.chain.id).toBe(31337);
    expect(r.config.pollingIntervalMs).toBe(500); // half a block
  });

  it("knows Base Sepolia and Base mainnet by name", () => {
    const sepolia = parseConfig({ ...base, VITE_CHAIN: "baseSepolia", VITE_DEPLOY_BLOCK: "123456" });
    if (!sepolia.ok) throw new Error(sepolia.problems.join("; "));
    expect(sepolia.config.chain.id).toBe(84532);
    expect(sepolia.config.deployBlock).toBe(123456n);
    expect(sepolia.config.blockTimeSeconds).toBe(2);
    expect(sepolia.config.pollingIntervalMs).toBe(1000);
    expect(sepolia.config.rpcUrl).toMatch(/^https:\/\//);

    const mainnet = parseConfig({ ...base, VITE_CHAIN: "base" });
    if (!mainnet.ok) throw new Error(mainnet.problems.join("; "));
    expect(mainnet.config.chain.id).toBe(8453);
  });

  it("takes an RPC URL and block time from the environment", () => {
    const r = parseConfig({ ...base, VITE_RPC_URL: "https://rpc.example/key", VITE_BLOCK_TIME: "0.5" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.config.rpcUrl).toBe("https://rpc.example/key");
    expect(r.config.blockTimeSeconds).toBe(0.5);
  });

  it("normalises addresses to their checksummed form", () => {
    const r = parseConfig({ ...base, VITE_PROOFKIN: PROOFKIN.toLowerCase() });
    if (!r.ok) throw new Error("expected ok");
    expect(r.config.proofkin).toBe(PROOFKIN);
  });

  it("lists every problem at once, so one pass fixes the setup", () => {
    const r = parseConfig({ VITE_CHAIN: "mainnet", VITE_PROOFKIN: "nope", VITE_DEPLOY_BLOCK: "-3", VITE_BLOCK_TIME: "0" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.join("\n")).toMatch(/VITE_CHAIN/);
    expect(r.problems.join("\n")).toMatch(/VITE_PROOFKIN/);
    expect(r.problems.join("\n")).toMatch(/VITE_RENDERER/);
    expect(r.problems.join("\n")).toMatch(/VITE_DEPLOY_BLOCK/);
    expect(r.problems.join("\n")).toMatch(/VITE_BLOCK_TIME/);
  });

  it("asks for the chain when it is missing", () => {
    const r = parseConfig({ VITE_PROOFKIN: PROOFKIN, VITE_RENDERER: RENDERER });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toMatch(/VITE_CHAIN.*anvil.*baseSepolia.*base/);
  });
});

describe("parseConfig under another prefix", () => {
  // Vite calls its variables VITE_*; a Next.js app exposes NEXT_PUBLIC_* to the browser. The settings are the same.
  const next = { NEXT_PUBLIC_CHAIN: "baseSepolia", NEXT_PUBLIC_PROOFKIN: PROOFKIN, NEXT_PUBLIC_RENDERER: RENDERER };

  it("reads every setting under the prefix it is given", () => {
    const r = parseConfig(
      { ...next, NEXT_PUBLIC_DEPLOY_BLOCK: "777", NEXT_PUBLIC_RPC_URL: "https://rpc.example/k", NEXT_PUBLIC_BLOCK_TIME: "4" },
      "NEXT_PUBLIC_",
    );
    if (!r.ok) throw new Error(r.problems.join("; "));
    expect(r.config).toMatchObject({ name: "baseSepolia", proofkin: PROOFKIN, renderer: RENDERER, deployBlock: 777n, rpcUrl: "https://rpc.example/k", blockTimeSeconds: 4 });
  });

  it("does not read the default prefix when another is asked for", () => {
    const r = parseConfig({ ...base, VITE_DEPLOY_BLOCK: "5" }, "NEXT_PUBLIC_");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("\n")).not.toMatch(/VITE_/);
  });

  it("names the prefixed variables when something is wrong", () => {
    const r = parseConfig({ NEXT_PUBLIC_CHAIN: "mainnet", NEXT_PUBLIC_DEPLOY_BLOCK: "x", NEXT_PUBLIC_BLOCK_TIME: "0" }, "NEXT_PUBLIC_");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = r.problems.join("\n");
    for (const name of ["CHAIN", "PROOFKIN", "RENDERER", "DEPLOY_BLOCK", "BLOCK_TIME"]) expect(text).toMatch(new RegExp(`NEXT_PUBLIC_${name}`));
    expect(text).not.toMatch(/VITE_/);
  });

  it("still reads VITE_ when no prefix is given", () => {
    expect(parseConfig(base).ok).toBe(true);
    expect(parseConfig(next).ok).toBe(false);
  });
});

describe("parseChainConfig", () => {
  // The admin console runs before any contract exists, so it needs the chain and a way to reach it and nothing more.
  const chainOnly = { NEXT_PUBLIC_CHAIN: "baseSepolia" };

  it("reads the chain without any contract address, with the same defaults as parseConfig", () => {
    const r = parseChainConfig({ VITE_CHAIN: "anvil" });
    if (!r.ok) throw new Error(r.problems.join("; "));
    expect(r.config).toMatchObject({ name: "anvil", rpcUrl: "http://127.0.0.1:8545", blockTimeSeconds: 1, pollingIntervalMs: 500 });
    expect(r.config.chain.id).toBe(31337);
    expect("proofkin" in r.config).toBe(false);
    expect("renderer" in r.config).toBe(false);
  });

  it("takes an RPC URL and block time from the environment, under the prefix it is given", () => {
    const r = parseChainConfig({ ...chainOnly, NEXT_PUBLIC_RPC_URL: "https://rpc.example/k", NEXT_PUBLIC_BLOCK_TIME: "4" }, "NEXT_PUBLIC_");
    if (!r.ok) throw new Error(r.problems.join("; "));
    expect(r.config).toMatchObject({ name: "baseSepolia", rpcUrl: "https://rpc.example/k", blockTimeSeconds: 4, pollingIntervalMs: 2000 });
  });

  it("is the chain part of parseConfig, for every chain it knows", () => {
    for (const name of ["anvil", "baseSepolia", "base"]) {
      const env = { ...base, VITE_CHAIN: name, VITE_RPC_URL: "https://rpc.example/k", VITE_BLOCK_TIME: "3" };
      const whole = parseConfig(env);
      const part = parseChainConfig(env);
      if (!whole.ok || !part.ok) throw new Error(name);
      expect(part.config).toEqual({
        name: whole.config.name,
        chain: whole.config.chain,
        rpcUrl: whole.config.rpcUrl,
        blockTimeSeconds: whole.config.blockTimeSeconds,
        pollingIntervalMs: whole.config.pollingIntervalMs,
      });
    }
  });

  it("asks for nothing but the chain and the block time, and names them with the prefix", () => {
    const r = parseChainConfig({ NEXT_PUBLIC_CHAIN: "mainnet", NEXT_PUBLIC_BLOCK_TIME: "0" }, "NEXT_PUBLIC_");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = r.problems.join("\n");
    expect(text).toMatch(/NEXT_PUBLIC_CHAIN/);
    expect(text).toMatch(/NEXT_PUBLIC_BLOCK_TIME/);
    expect(text).not.toMatch(/PROOFKIN|RENDERER|DEPLOY_BLOCK/);
  });

  it("is not ok for a chain that is right and a block time that is not, whatever else is", () => {
    const r = parseChainConfig({ VITE_CHAIN: "base", VITE_BLOCK_TIME: "0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toEqual(['VITE_BLOCK_TIME must be a positive number of seconds (it is "0").']);
    expect(parseChainConfig({ VITE_CHAIN: "base", VITE_BLOCK_TIME: "soon" }).ok).toBe(false);
  });

  it("does not need the contract settings to be right, or even to exist", () => {
    expect(parseChainConfig({ VITE_CHAIN: "base", VITE_PROOFKIN: "nope", VITE_DEPLOY_BLOCK: "-3" }).ok).toBe(true);
  });

  it("asks for the chain when it is missing", () => {
    const r = parseChainConfig({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toMatch(/VITE_CHAIN.*anvil.*baseSepolia.*base/);
  });
});
