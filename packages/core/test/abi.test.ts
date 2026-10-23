import { readFileSync } from "node:fs";
import { type Abi, type AbiFunction, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { renderAbiModule } from "../scripts/gen-abi.ts";
import { proofkinAbi, rendererAbi } from "../src/abi.ts";

// A plain lookup: viem's getAbiItem builds enormous types from an 80-entry const ABI.
const find = (abi: Abi, name: string) => abi.find((item) => "name" in item && item.name === name);

describe("src/abi.ts", () => {
  it("is what the compiled contracts say (run `pnpm gen:abi` after `forge build`)", () => {
    const onDisk = readFileSync(new URL("../src/abi.ts", import.meta.url), "utf8");
    expect(onDisk).toBe(renderAbiModule());
  });

  it("has every function, event and error the playground relies on", () => {
    for (const name of ["commit", "reveal", "tokens", "tokenURI", "totalSupply", "mintPrice", "seen", "solvedCount", "bestNodes", "commitBlock", "ownerOf"]) {
      expect(find(proofkinAbi, name), name).toBeDefined();
    }
    expect(find(proofkinAbi, "Solved")).toMatchObject({ type: "event" });
    for (const name of ["NoCommit", "TooEarly", "Expired", "NoBlockhash", "WrongPayment", "AlreadyMinted", "PuzzleFull", "SolveFailed", "AlreadyCommitted"]) {
      expect(find(proofkinAbi, name), name).toMatchObject({ type: "error" });
    }
    expect(find(rendererAbi, "render")).toMatchObject({ type: "function", stateMutability: "pure" });
  });

  it("keeps reveal payable, and nothing else the playground sends", () => {
    expect(find(proofkinAbi, "reveal")).toMatchObject({ stateMutability: "payable" });
    expect(find(proofkinAbi, "commit")).toMatchObject({ stateMutability: "nonpayable" });
    expect(toFunctionSelector("commit(bytes32)")).toBe(toFunctionSelector(find(proofkinAbi, "commit") as AbiFunction));
  });
});
