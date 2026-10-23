import { describe, expect, it } from "vitest";
import { etaSeconds, REVEAL_DELAY, REVEAL_WINDOW, revealPhase } from "../src/phase.ts";

describe("revealPhase", () => {
  const cb = 1000;

  it("uses the contract's constants", () => {
    expect(REVEAL_DELAY).toBe(2);
    expect(REVEAL_WINDOW).toBe(250);
  });

  it("waits until three blocks after the commit, counting the blocks still to come", () => {
    expect(revealPhase(cb, cb)).toEqual({ phase: "waiting", blocksUntilReady: 3 });
    expect(revealPhase(cb, cb + 1)).toEqual({ phase: "waiting", blocksUntilReady: 2 });
    expect(revealPhase(cb, cb + 2)).toEqual({ phase: "waiting", blocksUntilReady: 1 });
  });

  it("is ready from commitBlock + 3, counting how many more blocks the player can wait before sending", () => {
    expect(revealPhase(cb, cb + 3)).toEqual({ phase: "ready", blocksLeft: 246 });
    expect(revealPhase(cb, cb + 100)).toEqual({ phase: "ready", blocksLeft: 149 });
    // a reveal sent now is mined in cb + 250, the last block the contract accepts
    expect(revealPhase(cb, cb + 249)).toEqual({ phase: "ready", blocksLeft: 0 });
  });

  it("is expired as soon as a reveal sent now could only land after the window closes", () => {
    // sent at cb + 250 it is mined at cb + 251 or later, which the contract rejects
    expect(revealPhase(cb, cb + 250)).toEqual({ phase: "expired" });
    expect(revealPhase(cb, cb + 251)).toEqual({ phase: "expired" });
    expect(revealPhase(cb, cb + 5000)).toEqual({ phase: "expired" });
  });

  /**
   * Proofkin checks `block.number` of the block the reveal is MINED in, which is after the latest block
   * the page has seen. So the page must never call a send "ready" when the contract is certain to refuse it.
   */
  it("never advises a send that the contract is certain to refuse, at any block offset", () => {
    for (let offset = 0; offset < 300; offset++) {
      const current = cb + offset;
      const earliestInclusion = current + 1; // the soonest block a transaction sent now can be mined in
      const phase = revealPhase(cb, current);

      const refusedForSure = earliestInclusion > cb + REVEAL_WINDOW; // Proofkin: block.number > commitBlock + REVEAL_WINDOW
      if (phase.phase === "ready") expect(refusedForSure, `ready at +${offset}`).toBe(false);
      if (phase.phase === "expired") expect(refusedForSure, `expired at +${offset}`).toBe(true);
      // waiting is conservative by at most one block: the only waiting offset where a send would be accepted is +2
      if (phase.phase === "waiting") expect(current <= cb + REVEAL_DELAY, `waiting at +${offset}`).toBe(true);
    }
  });

  it("counts down by one per block while ready, from 246 to 0", () => {
    const left: number[] = [];
    for (let offset = 3; offset <= 249; offset++) {
      const p = revealPhase(cb, cb + offset);
      if (p.phase !== "ready") throw new Error(`expected ready at +${offset}`);
      left.push(p.blocksLeft);
    }
    expect(left).toEqual(Array.from({ length: 247 }, (_, i) => 246 - i));
  });
});

describe("etaSeconds", () => {
  it("is blocks times the block time, rounded up to a whole second", () => {
    expect(etaSeconds(247, 2)).toBe(494);
    expect(etaSeconds(3, 1.5)).toBe(5);
    expect(etaSeconds(0, 2)).toBe(0);
  });
});
