import { describe, expect, it } from "vitest";
import { mintGate, type MintGateInput } from "../src/mintGate.ts";

const ready: MintGateInput = {
  analysis: "ok",
  localTest: "pass",
  wallet: "connected",
  network: "right",
  onChain: "free",
  busy: false,
};

describe("mintGate", () => {
  it("lets a valid, locally passing program be minted from a connected wallet on the right network", () => {
    expect(mintGate(ready)).toEqual({ enabled: true });
  });

  it.each<[string, Partial<MintGateInput>, RegExp]>([
    ["the program does not assemble or validate", { analysis: "invalid" }, /fix the program/i],
    ["the local test has not been run", { localTest: "notRun" }, /run the local test/i],
    ["the local test failed", { localTest: "fail" }, /local test.*fail|pass the local test/i],
    ["no wallet is connected", { wallet: "none" }, /connect/i],
    ["the wallet is on another network", { network: "wrong" }, /switch.*network|network/i],
    ["this exact program is already minted", { onChain: "alreadyMinted" }, /already.*minted/i],
    ["the puzzle has all its slots taken", { onChain: "puzzleFull" }, /50|full|slots/i],
    ["the chain has not been checked yet", { onChain: "unknown" }, /check/i],
    ["a mint is already in progress", { busy: true }, /in progress|wait/i],
  ])("is closed when %s, and says why", (_label, change, reason) => {
    const gate = mintGate({ ...ready, ...change });
    expect(gate.enabled).toBe(false);
    expect(gate.enabled === false && gate.reason).toMatch(reason);
  });

  it("gives the most fundamental reason first when several apply", () => {
    const gate = mintGate({ analysis: "invalid", localTest: "notRun", wallet: "none", network: "wrong", onChain: "unknown", busy: false });
    expect(gate.enabled === false && gate.reason).toMatch(/fix the program/i);
  });
});
