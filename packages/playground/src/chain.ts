// Everything the page reads from the chain. Writes (commit, reveal) are in mint.ts.
import { type Chain, createPublicClient, type Hex, hexToBytes, http, type PublicClient, type Transport } from "viem";
import { proofkinAbi, rendererAbi } from "./abi.ts";
import type { AppConfig } from "./config.ts";
import { programHash } from "./commitment.ts";

export type Reader = PublicClient<Transport, Chain | undefined>;

/** Slots per puzzle (PLAN.md §4). */
export const SLOTS_PER_PUZZLE = 50;
export const PUZZLES = 6;

export function makePublicClient(config: AppConfig): Reader {
  return createPublicClient({ chain: config.chain, transport: http(config.rpcUrl), pollingInterval: config.pollingIntervalMs });
}

export interface CollectionState {
  mintPrice: bigint;
  totalSupply: bigint;
  /** Per puzzle. */
  solvedCount: number[];
  /** Smallest node count solved so far per puzzle; 255 until the first solve. */
  bestNodes: number[];
}

export async function readCollection(client: Reader, config: AppConfig): Promise<CollectionState> {
  const read = <N extends "mintPrice" | "totalSupply">(functionName: N) =>
    client.readContract({ address: config.proofkin, abi: proofkinAbi, functionName });
  const perPuzzle = (functionName: "solvedCount" | "bestNodes") =>
    Promise.all(
      Array.from({ length: PUZZLES }, (_, i) =>
        client.readContract({ address: config.proofkin, abi: proofkinAbi, functionName, args: [BigInt(i)] }),
      ),
    );
  const [mintPrice, totalSupply, solvedCount, bestNodes] = await Promise.all([
    read("mintPrice"),
    read("totalSupply"),
    perPuzzle("solvedCount"),
    perPuzzle("bestNodes"),
  ]);
  return { mintPrice, totalSupply, solvedCount: solvedCount.map(Number), bestNodes: bestNodes.map(Number) };
}

export type ProgramStatus = "free" | "alreadyMinted" | "puzzleFull";

/** What the contract would say to this exact program today, before spending gas on a commit. */
export async function checkProgram(client: Reader, config: AppConfig, program: Hex): Promise<ProgramStatus> {
  const puzzleId = hexToBytes(program)[1] ?? 0;
  const [seen, solved] = await Promise.all([
    client.readContract({ address: config.proofkin, abi: proofkinAbi, functionName: "seen", args: [programHash(program)] }),
    client.readContract({ address: config.proofkin, abi: proofkinAbi, functionName: "solvedCount", args: [BigInt(puzzleId)] }),
  ]);
  if (seen) return "alreadyMinted";
  return solved >= SLOTS_PER_PUZZLE ? "puzzleFull" : "free";
}

/** `Renderer.render(program, seed)` as a plain call: the SVG a token with this program and seed would show. */
export function previewSvg(client: Reader, config: AppConfig, program: Hex, seed: Hex): Promise<string> {
  return client.readContract({ address: config.renderer, abi: rendererAbi, functionName: "render", args: [program, seed] });
}

/** Never cached: viem would otherwise answer from a few seconds ago, and the reveal countdown needs the truth. */
export async function currentBlock(client: Reader): Promise<number> {
  return Number(await client.getBlockNumber({ cacheTime: 0 }));
}

/** The block a commit landed in, or 0 if there is no such commit. */
export async function commitBlockOf(client: Reader, config: AppConfig, hash: Hex): Promise<number> {
  return Number(await client.readContract({ address: config.proofkin, abi: proofkinAbi, functionName: "commitBlock", args: [hash] }));
}
