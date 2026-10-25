import { proofkinAbi } from "@proofkin/core";
import { updateTag } from "next/cache";
import { encodeAbiParameters, encodeEventTopics, TransactionReceiptNotFoundError } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `publicEnv` is read once, when `@/config/env` is first imported, so the variables must exist before the imports run.
vi.hoisted(() => {
  const settings = {
    NEXT_PUBLIC_CHAIN: "baseSepolia",
    NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
});

const getTransactionReceipt = vi.hoisted(() => vi.fn());
vi.mock("@/chain/server", () => ({ getServerClient: () => ({ getTransactionReceipt }) }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

const solvedReceipt = {
  status: "success",
  logs: [
    {
      address: CONTRACT,
      topics: encodeEventTopics({
        abi: proofkinAbi,
        eventName: "Solved",
        args: { tokenId: 7n, puzzleId: 2, author: ALICE },
      }),
      data: encodeAbiParameters([{ type: "uint8" }, { type: "uint16" }], [46, 1]),
      blockNumber: 10n,
      logIndex: 0,
    },
  ],
};

/** The action keeps what it has dealt with in the module, so every case imports it afresh. */
async function action() {
  vi.resetModules();
  return (await import("@/features/solve/refreshAfterMint")).refreshAfterMint;
}

describe("refreshAfterMint", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    getTransactionReceipt.mockReset();
    vi.mocked(updateTag).mockReset();
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("makes the gallery and the collection fresh once a reveal is proven to have solved", async () => {
    getTransactionReceipt.mockResolvedValueOnce(solvedReceipt);
    const refreshAfterMint = await action();
    await expect(refreshAfterMint(hash(1))).resolves.toEqual({ refreshed: true });
    expect(
      vi
        .mocked(updateTag)
        .mock.calls.map(([tag]) => tag)
        .sort(),
    ).toEqual(["collection", "solved"]);
  });

  it("does nothing for something that is not a transaction hash, and does not ask the node", async () => {
    const refreshAfterMint = await action();
    for (const bad of ["", "0x1234", "hello", `${hash(1)}00`, hash(1).slice(2), `0x${"g".repeat(64)}`]) {
      await expect(refreshAfterMint(bad)).resolves.toEqual({ refreshed: false });
    }
    expect(getTransactionReceipt).not.toHaveBeenCalled();
    expect(vi.mocked(updateTag)).not.toHaveBeenCalled();
  });

  it("does nothing for a transaction that was not a solve of this collection", async () => {
    getTransactionReceipt.mockResolvedValueOnce({ status: "success", logs: [] });
    const refreshAfterMint = await action();
    await expect(refreshAfterMint(hash(2))).resolves.toEqual({ refreshed: false });
    expect(vi.mocked(updateTag)).not.toHaveBeenCalled();
  });

  it("does nothing the second time for the same transaction: a hash on the wire is public, and replaying it must not keep the caches cold", async () => {
    getTransactionReceipt.mockResolvedValue(solvedReceipt);
    const refreshAfterMint = await action();
    await refreshAfterMint(hash(3));
    vi.mocked(updateTag).mockClear();
    getTransactionReceipt.mockClear();
    await expect(refreshAfterMint(hash(3))).resolves.toEqual({ refreshed: false });
    await expect(refreshAfterMint(hash(3).toUpperCase().replace("0X", "0x"))).resolves.toEqual({ refreshed: false });
    expect(vi.mocked(updateTag)).not.toHaveBeenCalled();
    expect(getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("can be asked again for a transaction that was not mined yet: that failure must not use the hash up", async () => {
    getTransactionReceipt.mockRejectedValueOnce(
      new TransactionReceiptNotFoundError({ hash: hash(4) as `0x${string}` }),
    );
    getTransactionReceipt.mockResolvedValueOnce(solvedReceipt);
    const refreshAfterMint = await action();
    await expect(refreshAfterMint(hash(4))).resolves.toEqual({ refreshed: false });
    await expect(refreshAfterMint(hash(4))).resolves.toEqual({ refreshed: true });
  });

  it("says why in the server log, and does not throw, when the node cannot be read", async () => {
    getTransactionReceipt.mockRejectedValueOnce(new Error("node down"));
    const refreshAfterMint = await action();
    await expect(refreshAfterMint(hash(5))).resolves.toEqual({ refreshed: false });
    expect(log.mock.calls.flat().map(String).join(" ")).toContain("node down");
  });

  it("stops asking the node after a budget of requests a minute, so the endpoint cannot be used to spend the node's allowance", async () => {
    getTransactionReceipt.mockResolvedValue({ status: "success", logs: [] });
    const refreshAfterMint = await action();
    for (let n = 100; n < 120; n++) await refreshAfterMint(hash(n)); // the budget
    getTransactionReceipt.mockClear();
    await expect(refreshAfterMint(hash(999))).resolves.toEqual({ refreshed: false });
    expect(getTransactionReceipt).not.toHaveBeenCalled();
  });
});
