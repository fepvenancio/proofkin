import { parseChainConfig } from "@proofkin/core";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAppConfig } from "@/config/env";
import { useWallet } from "@/features/solve/useWallet";

const wagmi = vi.hoisted(() => ({
  account: {} as { address?: string; status: string; chainId?: number },
  walletClient: undefined as unknown,
  switchChain: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useAccount: () => wagmi.account,
  useWalletClient: () => ({ data: wagmi.walletClient }),
  useSwitchChain: () => ({ switchChain: wagmi.switchChain }),
}));

const app = requireAppConfig({
  NEXT_PUBLIC_CHAIN: "baseSepolia",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
});
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const CLIENT = { account: { address: ALICE } };

const wallet = () => renderHook(() => useWallet(app)).result.current;

describe("useWallet", () => {
  it("needs only the chain, so the admin console can use it before a contract exists", () => {
    const chain = parseChainConfig({ NEXT_PUBLIC_CHAIN: "baseSepolia" }, "NEXT_PUBLIC_");
    if (!chain.ok) throw new Error(chain.problems.join("; "));
    wagmi.account = { status: "connected", address: ALICE, chainId: 84532 };
    wagmi.walletClient = CLIENT;
    expect(renderHook(() => useWallet(chain.config)).result.current).toMatchObject({
      status: "connected",
      network: "right",
    });
  });

  beforeEach(() => {
    wagmi.account = { status: "disconnected" };
    wagmi.walletClient = undefined;
    wagmi.switchChain.mockReset();
  });

  it("is none when no wallet is connected", () => {
    expect(wallet()).toMatchObject({ status: "none", account: undefined, walletClient: undefined });
  });

  it.each(["connecting", "reconnecting"])(
    "is connecting while the wallet is %s, as just after the page loads",
    (status) => {
      wagmi.account = { status };
      expect(wallet().status).toBe("connecting");
    },
  );

  it("is connected, on the right network, with a client that can send, when the wallet is on the app's chain", () => {
    wagmi.account = { status: "connected", address: ALICE, chainId: 84532 };
    wagmi.walletClient = CLIENT;
    expect(wallet()).toMatchObject({ status: "connected", network: "right", account: ALICE, walletClient: CLIENT });
  });

  it("offers no client when the wallet is on another network, because a send there would go to the wrong chain", () => {
    wagmi.account = { status: "connected", address: ALICE, chainId: 1 };
    wagmi.walletClient = CLIENT;
    expect(wallet()).toMatchObject({ status: "connected", network: "wrong", account: ALICE, walletClient: undefined });
  });

  it("is still connecting while a connected wallet's client has not arrived", () => {
    wagmi.account = { status: "connected", address: ALICE, chainId: 84532 };
    wagmi.walletClient = undefined;
    expect(wallet().status).toBe("connecting");
  });

  it("asks the wallet to switch to the app's chain, and only that chain", () => {
    wagmi.account = { status: "connected", address: ALICE, chainId: 1 };
    wallet().switchNetwork();
    expect(wagmi.switchChain).toHaveBeenCalledWith({ chainId: 84532 });
  });
});
