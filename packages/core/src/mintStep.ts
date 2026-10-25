// Which step of a mint a commit is at: the one thing the mint panel needs to decide what to show.
import { revealPhase } from "./phase.ts";
import type { PendingCommit } from "./storage.ts";

export type MintStep =
  | { step: "idle" }
  /** Saved in this browser; the commit has not been sent. */
  | { step: "unsent" }
  /** Sent, but there is no block yet to measure the window against. */
  | { step: "checking" }
  | { step: "waiting"; blocksUntilReady: number }
  | { step: "ready"; blocksLeft: number }
  | { step: "expired" }
  | { step: "revealed"; tokenId: number | undefined };

/**
 * Ordered, the first that holds wins: no commit is idle; a revealed one is done whatever the block; one not yet sent is
 * unsent; a sent one with no block to measure is being checked; and then the reveal window decides, exactly as
 * `revealPhase` does, so the page can never invite a send the contract is certain to refuse.
 */
export function resolveMintStep(pending: PendingCommit | undefined, blockNumber: number | undefined): MintStep {
  if (!pending) return { step: "idle" };
  if (pending.status === "revealed") return { step: "revealed", tokenId: pending.tokenId };
  if (pending.status === "prepared") return { step: "unsent" };
  if (pending.commitBlock === undefined || blockNumber === undefined) return { step: "checking" };
  const phase = revealPhase(pending.commitBlock, blockNumber);
  if (phase.phase === "waiting") return { step: "waiting", blocksUntilReady: phase.blocksUntilReady };
  if (phase.phase === "ready") return { step: "ready", blocksLeft: phase.blocksLeft };
  return { step: "expired" };
}
