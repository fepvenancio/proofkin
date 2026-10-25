import { describe, expect, it } from "vitest";
import { resolveMintStep } from "../src/mintStep.ts";
import type { PendingCommit } from "../src/storage.ts";

const base: PendingCommit = {
  version: 1,
  chainId: 31337,
  contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  program: "0x010203",
  salt: "0x" + "11".repeat(32),
  hash: "0x" + "22".repeat(32),
  puzzleId: 2,
  nodeCount: 46,
  status: "prepared",
  createdAt: 1,
} as PendingCommit;

const committed = (commitBlock: number): PendingCommit => ({ ...base, status: "committed", commitBlock });

describe("resolveMintStep", () => {
  it("is idle when there is no commit", () => {
    expect(resolveMintStep(undefined, 100)).toEqual({ step: "idle" });
  });

  it("is a commit that has been saved but not sent, whatever block it is", () => {
    expect(resolveMintStep(base, undefined)).toEqual({ step: "unsent" });
    expect(resolveMintStep(base, 100)).toEqual({ step: "unsent" });
  });

  it("is done when it has been revealed, with the token, even if the block is not known", () => {
    const revealed: PendingCommit = { ...committed(100), status: "revealed", tokenId: 7 };
    expect(resolveMintStep(revealed, undefined)).toEqual({ step: "revealed", tokenId: 7 });
    expect(resolveMintStep(revealed, 9_999)).toEqual({ step: "revealed", tokenId: 7 });
  });

  it("is revealed without a token when the receipt had no Solved event to read", () => {
    expect(resolveMintStep({ ...committed(100), status: "revealed" }, 120)).toEqual({ step: "revealed", tokenId: undefined });
  });

  it("is checking while a sent commit has no block to be measured against", () => {
    expect(resolveMintStep(committed(100), undefined)).toEqual({ step: "checking" });
  });

  it("waits until the commit is three blocks old, and counts the blocks to go", () => {
    expect(resolveMintStep(committed(100), 100)).toEqual({ step: "waiting", blocksUntilReady: 3 });
    expect(resolveMintStep(committed(100), 102)).toEqual({ step: "waiting", blocksUntilReady: 1 });
  });

  it("is ready from the third block on, and counts the blocks it can still wait", () => {
    expect(resolveMintStep(committed(100), 103)).toEqual({ step: "ready", blocksLeft: 246 });
    expect(resolveMintStep(committed(100), 348)).toEqual({ step: "ready", blocksLeft: 1 });
  });

  it("says to send now on the last block a reveal can land in", () => {
    expect(resolveMintStep(committed(100), 349)).toEqual({ step: "ready", blocksLeft: 0 });
  });

  it("expires once a reveal sent now would be mined after the window", () => {
    expect(resolveMintStep(committed(100), 350)).toEqual({ step: "expired" });
    expect(resolveMintStep(committed(100), 10_000)).toEqual({ step: "expired" });
  });

  it("agrees with the reveal phase at every block, which is the contract's own window", () => {
    // revealPhase has its own exhaustive tests; this pins that the step is that phase and not a copy of it
    for (let block = 95; block < 360; block++) {
      const step = resolveMintStep(committed(100), block);
      const expected = block <= 102 ? "waiting" : block >= 350 ? "expired" : "ready";
      expect(step.step).toBe(expected);
    }
  });

  it("treats a sent commit with no recorded block as still being checked, not as a crash", () => {
    expect(resolveMintStep({ ...base, status: "committed" }, 120)).toEqual({ step: "checking" });
  });
});
