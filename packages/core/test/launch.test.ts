import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, encodeAbiParameters, getAddress, type Hex, http, parseEther, size, slice } from "viem";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";
import { proofkinAbi } from "../src/abi.ts";
import { parseConfig } from "../src/config.ts";
import {
  confirmationTail,
  DEPLOY_CHAIN_IDS,
  envBlock,
  expectedProofkinRuntime,
  isConfirmed,
  LAUNCH_MINT_PRICE,
  proofkinCreationCode,
  proofkinImmutables,
  proofkinRuntimeCode,
  rendererCreationCode,
  rendererRuntimeCode,
  verifyCommands,
} from "../src/launch/index.ts";
import { renderLaunchModule } from "../scripts/gen-abi.ts";
import { startAnvil } from "../src/testing/local-chain.ts";

const PROOFKIN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const RENDERER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const word = (n: bigint): Hex => encodeAbiParameters([{ type: "uint256" }], [n]);

describe("src/launch/bytecode.ts", () => {
  it("is what the compiled contracts say (run `pnpm gen:abi` after `forge build`)", () => {
    const onDisk = readFileSync(new URL("../src/launch/bytecode.ts", import.meta.url), "utf8");
    expect(onDisk).toBe(renderLaunchModule());
  });

  it("holds code each contract can be deployed with, and each fits the 24,576-byte limit once deployed", () => {
    expect(size(rendererRuntimeCode)).toBeLessThanOrEqual(24_576);
    expect(size(proofkinRuntimeCode)).toBeLessThanOrEqual(24_576);
    // a constructor carries the runtime code it deploys
    expect(rendererCreationCode.includes(rendererRuntimeCode.slice(2))).toBe(true);
    expect(proofkinCreationCode.includes(proofkinRuntimeCode.slice(2))).toBe(true);
  });

  it("knows where the one immutable, the mint price, sits in the collection's code, as two empty 32-byte words", () => {
    expect(proofkinImmutables).toHaveLength(2);
    for (const { start, length } of proofkinImmutables) {
      expect(length).toBe(32);
      expect(start + length).toBeLessThanOrEqual(size(proofkinRuntimeCode));
      expect(slice(proofkinRuntimeCode, start, start + length)).toBe(word(0n));
    }
  });
});

describe("expectedProofkinRuntime", () => {
  it("is the compiled code with the price written into each place the compiler left for it, and nothing else changed", () => {
    const price = parseEther("0.01");
    const expected = expectedProofkinRuntime(price);
    expect(size(expected)).toBe(size(proofkinRuntimeCode));
    for (const { start, length } of proofkinImmutables) expect(slice(expected, start, start + length)).toBe(word(price));

    const before = proofkinRuntimeCode.slice(2);
    const after = expected.slice(2);
    let differing = 0;
    for (let i = 0; i < before.length; i += 2) if (before.slice(i, i + 2) !== after.slice(i, i + 2)) differing++;
    // 0.01 ether is 0x2386f26fc10000, which has five non-zero bytes, written in each of the two places
    expect(differing).toBe(5 * 2);
  });

  it("differs from the code of a collection with another price", () => {
    expect(expectedProofkinRuntime(parseEther("0.01"))).not.toBe(expectedProofkinRuntime(parseEther("0.02")));
  });
});

describe("the code that a real chain ends up holding", () => {
  // The embedded creation code, sent to a chain, must leave behind exactly the code `expectedProofkinRuntime` says:
  // that is what lets the console tell a correct deployment from a wrong one, so it is checked on a real node, for two
  // prices (a wrong offset would pass with one price that happens to be zero in that place).
  it.each([parseEther("0.01"), parseEther("0.37")])("is exactly what is expected, for a price of %d wei", async (price) => {
    const chain = await startAnvil();
    try {
      const transport = http(chain.rpcUrl);
      const publicClient = createPublicClient({ chain: foundry, transport });
      const [account] = await createWalletClient({ chain: foundry, transport }).getAddresses();
      if (!account) throw new Error("the chain has no unlocked accounts");
      const wallet = createWalletClient({ account, chain: foundry, transport });

      const send = async (data: Hex) => {
        const hash = await wallet.sendTransaction({ data });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return getAddress(receipt.contractAddress!);
      };
      const renderer = await send(rendererCreationCode);
      const args = encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "uint256" }],
        [account, renderer, price],
      );
      const proofkin = await send(`${proofkinCreationCode}${args.slice(2)}`);

      expect(await publicClient.getCode({ address: renderer })).toBe(rendererRuntimeCode);
      expect(await publicClient.getCode({ address: proofkin })).toBe(expectedProofkinRuntime(price));
      expect(await publicClient.readContract({ address: proofkin, abi: proofkinAbi, functionName: "mintPrice" })).toBe(price);
    } finally {
      await chain.stop();
    }
  });
});

describe("what a deployment is allowed to be", () => {
  const script = readFileSync(new URL("../../../contracts/script/Deploy.s.sol", import.meta.url), "utf8");
  const solidityNumber = (name: string) => {
    const found = new RegExp(`${name}\\s*=\\s*([\\d_.]+)`).exec(script);
    if (!found) throw new Error(`Deploy.s.sol has no ${name}`);
    return found[1]!.replaceAll("_", "");
  };

  it("is the script's mint price, which is fixed in the constructor call and cannot change afterwards", () => {
    expect(LAUNCH_MINT_PRICE).toBe(parseEther(solidityNumber("MINT_PRICE")));
    expect(LAUNCH_MINT_PRICE).toBe(parseEther("0.01"));
  });

  it("is the script's three chains, a local one, Base Sepolia and Base, and no other", () => {
    const fromScript = ["LOCAL", "BASE_SEPOLIA", "BASE"].map((name) => Number(solidityNumber(name)));
    expect([...DEPLOY_CHAIN_IDS].sort()).toEqual(fromScript.sort());
  });
});

describe("envBlock", () => {
  it("prints the lines Deploy.s.sol prints for the web app, with checksummed addresses", () => {
    expect(envBlock({ chainId: 84532, proofkin: PROOFKIN.toLowerCase() as Hex, renderer: RENDERER, deployBlock: 123 })).toBe(
      [
        "NEXT_PUBLIC_CHAIN=baseSepolia",
        `NEXT_PUBLIC_PROOFKIN=${PROOFKIN}`,
        `NEXT_PUBLIC_RENDERER=${RENDERER}`,
        "NEXT_PUBLIC_DEPLOY_BLOCK=123",
      ].join("\n"),
    );
  });

  it.each([
    [31337, "anvil"],
    [84532, "baseSepolia"],
    [8453, "base"],
  ] as const)("names chain %d %s, and what it prints is a configuration the app accepts", (chainId, name) => {
    const text = envBlock({ chainId, proofkin: PROOFKIN, renderer: RENDERER, deployBlock: 77 });
    const env = Object.fromEntries(text.split("\n").map((line) => line.split("=") as [string, string]));
    const parsed = parseConfig(env, "NEXT_PUBLIC_");
    if (!parsed.ok) throw new Error(parsed.problems.join("; "));
    expect(parsed.config).toMatchObject({ name, proofkin: PROOFKIN, renderer: RENDERER, deployBlock: 77n });
    expect(parsed.config.chain.id).toBe(chainId);
  });

  it("refuses a chain it does not deploy to, rather than printing a setting that would point somewhere else", () => {
    expect(() => envBlock({ chainId: 1, proofkin: PROOFKIN, renderer: RENDERER, deployBlock: 1 })).toThrow(/chain 1/);
  });
});

describe("verifyCommands", () => {
  const args = { chainId: 84532, owner: OWNER, proofkin: PROOFKIN, renderer: RENDERER } as const;

  it("verifies both contracts on Blockscout, the explorer that needs no key, naming the constructor arguments", () => {
    const [renderer, proofkin] = verifyCommands(args)!;
    expect(renderer).toBe(
      `forge verify-contract ${RENDERER} contracts/src/Renderer.sol:Renderer --chain base-sepolia --verifier blockscout --verifier-url https://base-sepolia.blockscout.com/api/`,
    );
    expect(proofkin).toContain(`forge verify-contract ${PROOFKIN} contracts/src/Proofkin.sol:Proofkin --chain base-sepolia`);
    expect(proofkin).toContain(
      `--constructor-args $(cast abi-encode "constructor(address,address,uint256)" ${OWNER} ${RENDERER} ${LAUNCH_MINT_PRICE})`,
    );
  });

  it("uses Base's own names on mainnet", () => {
    const [renderer] = verifyCommands({ ...args, chainId: 8453 })!;
    expect(renderer).toContain("--chain base ");
    expect(renderer).toContain("https://base.blockscout.com/api/");
  });

  it("has nothing to verify on a local chain", () => {
    expect(verifyCommands({ ...args, chainId: 31337 })).toBeUndefined();
  });
});

describe("the typed confirmation", () => {
  it("is the last six characters of the address, so the person has to read it", () => {
    expect(confirmationTail(OWNER)).toBe(OWNER.slice(-6).toLowerCase());
    expect(confirmationTail(OWNER)).toHaveLength(6);
  });

  it("accepts what was typed in either case and with spaces round it", () => {
    expect(isConfirmed(` ${confirmationTail(OWNER).toUpperCase()} `, OWNER)).toBe(true);
    expect(isConfirmed(confirmationTail(OWNER), OWNER)).toBe(true);
  });

  it("rejects nothing typed, too little, too much, and the tail of another address", () => {
    const tail = confirmationTail(OWNER);
    expect(isConfirmed("", OWNER)).toBe(false);
    expect(isConfirmed(tail.slice(1), OWNER)).toBe(false);
    expect(isConfirmed(`0${tail}`, OWNER)).toBe(false);
    expect(isConfirmed(confirmationTail(PROOFKIN), OWNER)).toBe(false);
  });
});
