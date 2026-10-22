import { parseEther } from "viem";
import { describe, expect, it } from "vitest";
import { proofkinAbi } from "../src/abi.ts";
import { makeKit } from "./kit.ts";

const kit = await makeKit();

describe("the local chain a test file gets", () => {
  it("has the real contracts deployed, with the launch price of 0.01 ETH", async () => {
    const { proofkin, renderer } = kit.config;
    expect(await kit.publicClient.getCode({ address: proofkin })).toBeTruthy();
    expect(await kit.publicClient.getCode({ address: renderer })).toBeTruthy();
    expect(await kit.publicClient.readContract({ address: proofkin, abi: proofkinAbi, functionName: "mintPrice" })).toBe(parseEther("0.01"));
    expect(await kit.publicClient.readContract({ address: proofkin, abi: proofkinAbi, functionName: "renderer" })).toBe(renderer);
    expect(await kit.publicClient.readContract({ address: proofkin, abi: proofkinAbi, functionName: "owner" })).toBe(kit.accounts[0]);
  });
});
