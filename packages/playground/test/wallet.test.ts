import { describe, expect, it } from "vitest";
import { type AppConfig, parseConfig } from "@proofkin/core";
import { connectWallet, type Eip1193 } from "../src/wallet.ts";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const mk = (chain: string): AppConfig => {
  const r = parseConfig({
    VITE_CHAIN: chain,
    VITE_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    VITE_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  });
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.config;
};

/** A wallet that records what it was asked and answers from a script. */
function fakeWallet(opts: { chainId: number; accounts?: string[]; unknownChain?: boolean; reject?: boolean; refuseSwitch?: boolean }) {
  const calls: { method: string; params?: unknown }[] = [];
  let chainId = opts.chainId;
  const provider: Eip1193 = {
    async request({ method, params }) {
      calls.push({ method, params });
      switch (method) {
        case "eth_requestAccounts":
          if (opts.reject) throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          return opts.accounts ?? [ACCOUNT];
        case "eth_chainId":
          return `0x${chainId.toString(16)}`;
        case "wallet_switchEthereumChain": {
          if (opts.refuseSwitch) throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          const target = Number.parseInt((params as [{ chainId: string }])[0].chainId, 16);
          if (opts.unknownChain && !calls.some((c) => c.method === "wallet_addEthereumChain")) {
            throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
          }
          chainId = target;
          return null;
        }
        case "wallet_addEthereumChain":
          return null;
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  };
  return { provider, calls: () => calls.map((c) => c.method) };
}

describe("connectWallet", () => {
  it("returns the first account, and leaves a wallet that is already on the right network alone", async () => {
    const w = fakeWallet({ chainId: 31337, accounts: [ACCOUNT, "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"] });
    const r = await connectWallet(w.provider, mk("anvil"));
    expect(r.account).toBe(ACCOUNT);
    expect(w.calls()).toEqual(["eth_requestAccounts", "eth_chainId"]);
  });

  it("asks the wallet to switch when it is on another network", async () => {
    const w = fakeWallet({ chainId: 1 });
    await connectWallet(w.provider, mk("baseSepolia"));
    expect(w.calls()).toEqual(["eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain"]);
  });

  it("sends the target chain id in hex", async () => {
    const seen: unknown[] = [];
    const w = fakeWallet({ chainId: 1 });
    const spy: Eip1193 = {
      request: async (a) => {
        if (a.method === "wallet_switchEthereumChain") seen.push(a.params);
        return w.provider.request(a);
      },
    };
    await connectWallet(spy, mk("baseSepolia"));
    expect(seen).toEqual([[{ chainId: "0x14a34" }]]); // 84532
  });

  it("adds the network when the wallet has never heard of it, then switches", async () => {
    const w = fakeWallet({ chainId: 1, unknownChain: true });
    await connectWallet(w.provider, mk("baseSepolia"));
    expect(w.calls()).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
    ]);
  });

  it("does not try to add the network when the user simply refuses to switch", async () => {
    const w = fakeWallet({ chainId: 1, refuseSwitch: true });
    await expect(connectWallet(w.provider, mk("baseSepolia"))).rejects.toThrow(/rejected/i);
    expect(w.calls()).toEqual(["eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain"]);
  });

  it("says plainly when the user refuses to connect", async () => {
    const w = fakeWallet({ chainId: 31337, reject: true });
    await expect(connectWallet(w.provider, mk("anvil"))).rejects.toThrow(/rejected|refused|denied/i);
  });

  it("says plainly when the wallet has no account", async () => {
    const w = fakeWallet({ chainId: 31337, accounts: [] });
    await expect(connectWallet(w.provider, mk("anvil"))).rejects.toThrow(/no account/i);
  });

  it("hands back a wallet client for that account on that chain", async () => {
    const w = fakeWallet({ chainId: 31337 });
    const r = await connectWallet(w.provider, mk("anvil"));
    expect(r.walletClient.account?.address).toBe(ACCOUNT);
    expect(r.walletClient.chain?.id).toBe(31337);
  });
});
