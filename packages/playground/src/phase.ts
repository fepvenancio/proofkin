// Where a commit stands relative to its reveal window, from the latest block the page has seen.
//
// Proofkin._seedFor checks `block.number` of the block the reveal is MINED in: too early while
// `block.number <= commitBlock + REVEAL_DELAY`, expired once `block.number > commitBlock + REVEAL_WINDOW`.
// A reveal sent now is mined in the next block at the soonest, so the late edge is measured one block
// earlier than the contract's own comparison, or the page would invite a send that is certain to revert.
export const REVEAL_DELAY = 2;
export const REVEAL_WINDOW = 250;

export type RevealPhase =
  | { phase: "waiting"; blocksUntilReady: number }
  | { phase: "ready"; blocksLeft: number }
  | { phase: "expired" };

/**
 * `blocksUntilReady`: blocks still to be mined before the reveal may be sent (the commit has to be three
 * blocks old, as PLAN.md §9 says). `blocksLeft`: how many more blocks the player can let pass and still
 * send in time; 0 means send now.
 */
export function revealPhase(commitBlock: number, currentBlock: number): RevealPhase {
  if (currentBlock <= commitBlock + REVEAL_DELAY) {
    return { phase: "waiting", blocksUntilReady: commitBlock + REVEAL_DELAY + 1 - currentBlock };
  }
  if (currentBlock >= commitBlock + REVEAL_WINDOW) return { phase: "expired" };
  return { phase: "ready", blocksLeft: commitBlock + REVEAL_WINDOW - 1 - currentBlock };
}

export const etaSeconds = (blocks: number, blockTimeSeconds: number): number => Math.ceil(blocks * blockTimeSeconds);
