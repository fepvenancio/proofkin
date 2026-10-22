import { readFileSync } from "node:fs";
import { hexToBytes, parseEther } from "viem";
import { describe, expect, it } from "vitest";
import { proofkinAbi } from "../src/abi.ts";
import { commitHash, newSalt, programHash } from "../src/commitment.ts";
import { checkProgram, commitBlockOf, currentBlock, previewSvg, readCollection } from "../src/chain.ts";
import { isolateChain, makeKit, programOf, solutionText, swapVariant } from "./kit.ts";

const kit = await makeKit();
isolateChain(kit);
const { publicClient, testClient, config } = kit;
const [alice, bob] = kit.accounts as [`0x${string}`, `0x${string}`];

/** commit, wait out the delay and reveal, straight against the contract (not through the app's flow) */
async function mintDirect(account: `0x${string}`, program: `0x${string}`) {
  const wallet = kit.walletFor(account);
  const salt = newSalt();
  const h = commitHash(program, account, salt);
  const mined = (hash: `0x${string}`) => publicClient.waitForTransactionReceipt({ hash });
  await mined(await wallet.writeContract({ address: config.proofkin, abi: proofkinAbi, functionName: "commit", args: [h], chain: config.chain }));
  await testClient.mine({ blocks: 3 });
  const receipt = await mined(
    await wallet.writeContract({
      address: config.proofkin,
      abi: proofkinAbi,
      functionName: "reveal",
      args: [program, salt],
      value: parseEther("0.01"),
      chain: config.chain,
    }),
  );
  if (receipt.status !== "success") throw new Error("the direct reveal reverted");
}

describe("readCollection", () => {
  it("reads the price, the supply, and each puzzle's solved count and record", async () => {
    expect(await readCollection(publicClient, config)).toEqual({
      mintPrice: parseEther("0.01"),
      totalSupply: 0n,
      solvedCount: [0, 0, 0, 0, 0, 0],
      bestNodes: [255, 255, 255, 255, 255, 255],
    });
  });

  it("follows a mint", async () => {
    await mintDirect(alice, programOf(solutionText("SORT8")).hex);
    const c = await readCollection(publicClient, config);
    expect(c.totalSupply).toBe(1n);
    expect(c.solvedCount).toEqual([0, 0, 1, 0, 0, 0]);
    expect(c.bestNodes).toEqual([255, 255, 46, 255, 255, 255]);
  });
});

describe("checkProgram", () => {
  const sort8 = programOf(solutionText("SORT8"));

  it("calls an untouched program free", async () => {
    expect(await checkProgram(publicClient, config, sort8.hex)).toBe("free");
  });

  it("knows a program once it is minted, and that a variant of it is a different program", async () => {
    await mintDirect(alice, sort8.hex);
    expect(await checkProgram(publicClient, config, sort8.hex)).toBe("alreadyMinted");
    const variant = swapVariant(sort8.program, 1);
    expect(await checkProgram(publicClient, config, `0x${Buffer.from(variant).toString("hex")}`)).toBe("free");
  });

  it("knows when a puzzle has no slots left", async () => {
    const quorum = programOf(solutionText("QUORUM7"));
    for (let mask = 0; mask < 50; mask++) {
      await mintDirect(alice, `0x${Buffer.from(swapVariant(quorum.program, mask)).toString("hex")}`);
    }
    const next = `0x${Buffer.from(swapVariant(quorum.program, 50)).toString("hex")}` as const;
    expect(await checkProgram(publicClient, config, next)).toBe("puzzleFull");
    // another puzzle is unaffected
    expect(await checkProgram(publicClient, config, sort8Hex())).toBe("free");
  });

  function sort8Hex() {
    return programOf(solutionText("SORT8")).hex;
  }
});

describe("previewSvg: Renderer.render over eth_call", () => {
  // The seed fixed in contracts/test/RendererSnapshots.t.sol, which wrote fixtures/renders/*.svg
  const seed = /SEED = (0x[0-9a-f]{64});/.exec(
    readFileSync(new URL("../../../contracts/test/RendererSnapshots.t.sol", import.meta.url), "utf8"),
  )![1] as `0x${string}`;

  it("returns exactly the SVG the Solidity snapshot test pins, for all six fixture circuits", async () => {
    for (const name of ["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"]) {
      const svg = await previewSvg(publicClient, config, programOf(solutionText(name)).hex, seed);
      expect(svg, name).toBe(readFileSync(new URL(`../../../fixtures/renders/${name}.svg`, import.meta.url), "utf8"));
    }
  });

  it("draws a different picture for a different seed", async () => {
    const hex = programOf(solutionText("SORT8")).hex;
    const a = await previewSvg(publicClient, config, hex, seed);
    const b = await previewSvg(publicClient, config, hex, `0x${"00".repeat(32)}`);
    expect(a).not.toBe(b);
  });

  it("refuses a program that is not valid, naming the rule", async () => {
    const bad = hexToBytes(programOf(solutionText("SORT8")).hex);
    bad[0] = 2; // version 2
    await expect(previewSvg(publicClient, config, `0x${Buffer.from(bad).toString("hex")}`, seed)).rejects.toThrow(/BadVersion/);
  });
});

describe("small reads", () => {
  it("reads the current block", async () => {
    const before = await currentBlock(publicClient);
    await testClient.mine({ blocks: 2 });
    expect(await currentBlock(publicClient)).toBe(before + 2);
  });

  it("reads where a commit landed, and 0 for one that never did", async () => {
    const h = commitHash(programOf(solutionText("MEDIAN5")).hex, bob, newSalt());
    expect(await commitBlockOf(publicClient, config, h)).toBe(0);
    const hash = await kit.walletFor(bob).writeContract({ address: config.proofkin, abi: proofkinAbi, functionName: "commit", args: [h], chain: config.chain });
    await publicClient.waitForTransactionReceipt({ hash });
    expect(await commitBlockOf(publicClient, config, h)).toBe(await currentBlock(publicClient));
  });

  it("hashes programs the way the contract keys `seen`", async () => {
    const { hex } = programOf(solutionText("MEDIAN5"));
    expect(await publicClient.readContract({ address: config.proofkin, abi: proofkinAbi, functionName: "seen", args: [programHash(hex)] })).toBe(false);
    await mintDirect(alice, hex);
    expect(await publicClient.readContract({ address: config.proofkin, abi: proofkinAbi, functionName: "seen", args: [programHash(hex)] })).toBe(true);
  });
});
