import { proofkinAbi } from "@proofkin/core";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  HttpRequestError,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isMissingToken, settle } from "@/chain/failure";
import { requireAppConfig } from "@/config/env";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

/** What viem throws when `tokenURI` reverts with the given error of the contract. */
function revertWith(errorName: "TokenDoesNotExist" | "Unauthorized") {
  const data = encodeErrorResult({ abi: proofkinAbi, errorName });
  const reverted = new ContractFunctionRevertedError({ abi: proofkinAbi, data, functionName: "tokenURI" });
  return new ContractFunctionExecutionError(reverted, {
    abi: proofkinAbi,
    functionName: "tokenURI",
    args: [9n],
    contractAddress: CONTRACT,
  });
}

describe("isMissingToken", () => {
  it("knows the contract's answer for an id nobody has minted", () => {
    expect(isMissingToken(revertWith("TokenDoesNotExist"))).toBe(true);
  });

  it("does not take any other revert for a missing token", () => {
    expect(isMissingToken(revertWith("Unauthorized"))).toBe(false);
  });

  it("does not take a node that cannot be reached for a missing token", () => {
    expect(
      isMissingToken(new HttpRequestError({ url: "https://rpc.example", body: {}, details: "fetch failed" })),
    ).toBe(false);
    expect(isMissingToken(new Error("boom"))).toBe(false);
    expect(isMissingToken("TokenDoesNotExist")).toBe(false);
  });
});

describe("settle", () => {
  const app = requireAppConfig({
    NEXT_PUBLIC_CHAIN: "base",
    NEXT_PUBLIC_PROOFKIN: CONTRACT,
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  });
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("hands back what was read", async () => {
    await expect(settle(app, "a token", async () => ({ n: 1 }))).resolves.toEqual({ kind: "found", value: { n: 1 } });
    expect(log).not.toHaveBeenCalled();
  });

  it("says a token is missing when the contract says so, and does not log it as a failure", async () => {
    await expect(settle(app, "a token", () => Promise.reject(revertWith("TokenDoesNotExist")))).resolves.toEqual({
      kind: "missing",
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("says the chain is unavailable for any other failure, and logs why", async () => {
    await expect(settle(app, "a token", () => Promise.reject(new Error("boom")))).resolves.toEqual({
      kind: "unavailable",
    });
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("a token");
    expect(logged).toContain("boom");
  });
});
