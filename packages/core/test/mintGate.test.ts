import { describe, expect, it } from "vitest";
import { mintGate, type MintGateInput, stepGate, type StepGateInput } from "../src/mintGate.ts";

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
    ["the wallet is still connecting, as when the page has just reloaded", { wallet: "connecting" }, /connecting/i],
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

describe("mintGate while the wallet is connecting", () => {
  it("says so, rather than asking to connect a wallet that is about to be there", () => {
    const gate = mintGate({ ...ready, wallet: "connecting" });
    expect(gate.enabled === false && gate.reason).not.toMatch(/^Connect a wallet/);
  });

  it("asks about the wallet before the network, which it cannot know yet", () => {
    const gate = mintGate({ ...ready, wallet: "connecting", network: "wrong" });
    expect(gate.enabled === false && gate.reason).toMatch(/connecting/i);
  });
});

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

const stepReady: StepGateInput = { busy: false, wallet: "connected", network: "right", account: ALICE, committedBy: ALICE };

describe("stepGate: whether the next step of a commit already in flight may be sent", () => {
  it("is open for the account that committed, on the right network", () => {
    expect(stepGate(stepReady)).toEqual({ enabled: true });
  });

  it.each<[string, Partial<StepGateInput>, RegExp]>([
    ["a step is already being sent", { busy: true }, /in progress|wait/i],
    ["no wallet is connected", { wallet: "none", account: undefined }, /connect/i],
    ["the wallet is still connecting", { wallet: "connecting", account: undefined }, /connecting/i],
    ["the wallet is on another network", { network: "wrong" }, /network/i],
  ])("is closed when %s, and says why", (_label, change, reason) => {
    const gate = stepGate({ ...stepReady, ...change });
    expect(gate.enabled).toBe(false);
    expect(gate.enabled === false && gate.reason).toMatch(reason);
  });

  it("is closed for another account, because the commit binds the account that sent it, and names the one to switch to", () => {
    const gate = stepGate({ ...stepReady, account: BOB });
    expect(gate.enabled).toBe(false);
    expect(gate.enabled === false && gate.reason).toContain("0x7099…79C8");
    expect(gate.enabled === false && gate.reason).toMatch(/switch/i);
  });

  it("does not take the same account in another letter case for another account", () => {
    expect(stepGate({ ...stepReady, account: ALICE.toLowerCase() as `0x${string}` })).toEqual({ enabled: true });
  });

  it("reports a step in progress before anything else", () => {
    const gate = stepGate({ busy: true, wallet: "none", network: "wrong", account: undefined, committedBy: ALICE });
    expect(gate.enabled === false && gate.reason).toMatch(/in progress|wait/i);
  });
});
