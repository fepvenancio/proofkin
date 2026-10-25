import { proofkinAbi } from "@proofkin/core";
import { encodeAbiParameters, encodeEventTopics, type Hex, TransactionReceiptNotFoundError } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyReveal } from "@/chain/refresh";
import { requireAppConfig } from "@/config/env";

const getTransactionReceipt = vi.hoisted(() => vi.fn());
vi.mock("@/chain/server", () => ({ getServerClient: () => ({ getTransactionReceipt }) }));

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const OTHER = "0x0000000000000000000000000000000000000bad";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const HASH: Hex = `0x${"ab".repeat(32)}`;

const app = requireAppConfig({
  NEXT_PUBLIC_CHAIN: "baseSepolia",
  NEXT_PUBLIC_PROOFKIN: CONTRACT,
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
});

/** A `Solved` log as the contract emits it: three indexed arguments, then the node count and the rank. */
const solved = (tokenId: number, address: string = CONTRACT) => ({
  address,
  topics: encodeEventTopics({
    abi: proofkinAbi,
    eventName: "Solved",
    args: { tokenId: BigInt(tokenId), puzzleId: 2, author: ALICE },
  }),
  data: encodeAbiParameters([{ type: "uint8" }, { type: "uint16" }], [46, 1]),
  blockNumber: 10n,
  logIndex: 0,
});

const receipt = (over: { status?: "success" | "reverted"; logs?: unknown[] } = {}) => ({
  status: over.status ?? "success",
  logs: over.logs ?? [solved(7)],
});

describe("verifyReveal", () => {
  beforeEach(() => getTransactionReceipt.mockReset());

  it("says a transaction was a solve, and which token, when the contract emitted Solved", async () => {
    getTransactionReceipt.mockResolvedValueOnce(receipt());
    await expect(verifyReveal(app, HASH)).resolves.toEqual({ kind: "solved", tokenId: 7 });
    expect(getTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
  });

  it("is not a solve when the transaction reverted", async () => {
    getTransactionReceipt.mockResolvedValueOnce(receipt({ status: "reverted" }));
    await expect(verifyReveal(app, HASH)).resolves.toEqual({ kind: "not-a-solve" });
  });

  it("is not a solve when nothing in it came from this collection, even if a log looks right", async () => {
    getTransactionReceipt.mockResolvedValueOnce(receipt({ logs: [solved(7, OTHER)] }));
    await expect(verifyReveal(app, HASH)).resolves.toEqual({ kind: "not-a-solve" });
  });

  it("is not a solve when the contract emitted nothing of the kind", async () => {
    getTransactionReceipt.mockResolvedValueOnce(receipt({ logs: [] }));
    await expect(verifyReveal(app, HASH)).resolves.toEqual({ kind: "not-a-solve" });
  });

  it("compares the address without regard to letter case, as the node may spell it differently", async () => {
    getTransactionReceipt.mockResolvedValueOnce(receipt({ logs: [solved(7, CONTRACT.toLowerCase())] }));
    await expect(verifyReveal(app, HASH)).resolves.toEqual({ kind: "solved", tokenId: 7 });
  });

  it("says the transaction is not mined yet when the node does not know it, so asking again later can work", async () => {
    getTransactionReceipt.mockRejectedValueOnce(new TransactionReceiptNotFoundError({ hash: HASH }));
    await expect(verifyReveal(app, HASH)).resolves.toEqual({ kind: "pending" });
  });

  it("lets any other failure of the node through, to be logged by whoever asked", async () => {
    getTransactionReceipt.mockRejectedValueOnce(new Error("node down"));
    await expect(verifyReveal(app, HASH)).rejects.toThrow("node down");
  });
});
