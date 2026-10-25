import { parseEther } from "viem";
import { describe, expect, it } from "vitest";
import { readCollectionAdmin } from "../src/launch/index.ts";
import { makeKit } from "../src/testing/kit.ts";

const kit = await makeKit();

describe("readCollectionAdmin", () => {
  it("reads what an owner administers: who owns it, which renderer and whether it is locked, the price, the supply and the fees held", async () => {
    const state = await readCollectionAdmin(kit.publicClient, kit.config.proofkin);
    expect(state).toEqual({
      owner: kit.accounts[0],
      renderer: kit.config.renderer,
      rendererLocked: false,
      mintPrice: parseEther("0.01"),
      totalSupply: 0n,
      balance: 0n,
    });
  });

  it("reports the fees the contract holds, which are what withdraw would send", async () => {
    await kit.testClient.setBalance({ address: kit.config.proofkin, value: parseEther("0.06") });
    expect((await readCollectionAdmin(kit.publicClient, kit.config.proofkin)).balance).toBe(parseEther("0.06"));
  });
});
