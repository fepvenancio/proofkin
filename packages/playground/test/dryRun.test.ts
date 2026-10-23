import { PUZZLE_NAMES } from "@proofkin/vm";
import { type Address, parseEther } from "viem";
import { describe, expect, it } from "vitest";
import { dryRunMints } from "../scripts/dry-run.ts";
import { type MintDeps, PendingStore, parseConfig, proofkinAbi } from "@proofkin/core";
import { isolateChain, makeKit } from "@proofkin/core/testing";

describe("dryRunMints", async () => {
  const kit = await makeKit();
  isolateChain(kit);

  const solver = kit.accounts[2]!;
  const deps = (): MintDeps => ({
    publicClient: kit.publicClient,
    walletClient: kit.walletFor(solver),
    config: kit.config,
    store: new PendingStore(undefined),
  });
  // The local chain makes a block only when something is sent, so waiting means making one.
  const pause = async () => {
    await kit.testClient.mine({ blocks: 1 });
  };
  const read = <T extends "totalSupply" | "mintPrice">(functionName: T) =>
    kit.publicClient.readContract({ address: kit.config.proofkin, abi: proofkinAbi, functionName });
  const ownerOf = (id: bigint): Promise<Address> =>
    kit.publicClient.readContract({ address: kit.config.proofkin, abi: proofkinAbi, functionName: "ownerOf", args: [id] });

  it("mints each puzzle's fixture solution once, and reads every token back through the renderer", async () => {
    const lines: string[] = [];
    const results = await dryRunMints(deps(), { pause, onProgress: (line) => lines.push(line) });

    expect(results.map((r) => r.puzzle)).toEqual([...PUZZLE_NAMES]);
    expect(results.map((r) => r.outcome)).toEqual(Array(6).fill("minted"));
    expect(results.map((r) => r.tokenId)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const r of results) {
      expect(r.revealGas, r.puzzle).toBeGreaterThan(100_000n);
      expect(r.commitTx, r.puzzle).toMatch(/^0x[0-9a-f]{64}$/);
      expect(r.revealTx, r.puzzle).toMatch(/^0x[0-9a-f]{64}$/);
      expect(await ownerOf(BigInt(r.tokenId!)), r.puzzle).toBe(solver);
    }
    expect(await read("totalSupply")).toBe(6n);
    expect(await kit.publicClient.getBalance({ address: kit.config.proofkin })).toBe(6n * (await read("mintPrice")));
    for (const name of PUZZLE_NAMES) expect(lines.some((l) => l.includes(name)), name).toBe(true);
  });

  it("run again, it mints nothing and says each program is already there", async () => {
    await dryRunMints(deps(), { pause });
    const again = await dryRunMints(deps(), { pause });

    expect(again.map((r) => r.outcome)).toEqual(Array(6).fill("skipped"));
    for (const r of again) expect(r.note, r.puzzle).toMatch(/already minted/i);
    expect(await read("totalSupply")).toBe(6n);
  });

  it("refuses Base mainnet, where every mint takes a slot from the public", async () => {
    const mainnet = parseConfig({ VITE_CHAIN: "base", VITE_PROOFKIN: kit.config.proofkin, VITE_RENDERER: kit.config.renderer });
    if (!mainnet.ok) throw new Error(mainnet.problems.join("; "));

    await expect(dryRunMints({ ...deps(), config: mainnet.config }, { pause })).rejects.toThrow(/mainnet/i);
    expect(await read("totalSupply")).toBe(0n);
  });

  it("checks the wallet can pay for the whole run before it sends anything", async () => {
    await kit.testClient.setBalance({ address: solver, value: parseEther("0.05") }); // six mints cost 0.06 ETH

    await expect(dryRunMints(deps(), { pause })).rejects.toThrow(/0\.06 ETH/);
    expect(await read("totalSupply")).toBe(0n);
  });

  it("stops when a token does not read back as the program that was minted", async () => {
    // A renderer (or a node) that answers tokenURI with the wrong token: every token reads back as #1.
    const wrong = new Proxy(kit.publicClient, {
      get(target, prop, receiver) {
        if (prop !== "readContract") return Reflect.get(target, prop, receiver);
        return (args: Parameters<typeof target.readContract>[0]) =>
          target.readContract(args.functionName === "tokenURI" ? { ...args, args: [1n] } : args);
      },
    });

    await expect(dryRunMints({ ...deps(), publicClient: wrong as typeof kit.publicClient }, { pause })).rejects.toThrow(
      /MEDIAN5: token #2 reads back as QUORUM7 with 17 nodes/,
    );
  });

  it("gives up if the chain stops making blocks", async () => {
    // pause() that makes none, so the commit never becomes old enough to reveal
    await expect(dryRunMints(deps(), { pause: async () => {} })).rejects.toThrow(/not making blocks/i);
    expect(await read("totalSupply")).toBe(0n);
  });

  it("gives up with a readable message if the reveal window passes while waiting", async () => {
    let waited = 0;
    const slow = async () => {
      waited++;
      await kit.testClient.mine({ blocks: 300 });
    };
    // 300 blocks in one wait: the commit is past its 250-block window before the reveal is sent
    await expect(dryRunMints(deps(), { pause: slow })).rejects.toThrow(/window/i);
    expect(waited).toBeGreaterThan(0);
    expect(await read("totalSupply")).toBe(0n);
  });
});
