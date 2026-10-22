// Reading the collection back: who solved what, and what each token looks like.
import type { Address } from "viem";
import { proofkinAbi } from "./abi.ts";
import { PUZZLES, type Reader } from "./chain.ts";
import type { AppConfig } from "./config.ts";

// ------------------------------------------------------------------ one token

const JSON_PREFIX = "data:application/json;base64,";
const SVG_PREFIX = "data:image/svg+xml;base64,";

export interface TokenAttribute {
  trait: string;
  value: string | number;
}

export interface TokenView {
  name: string;
  description: string;
  attributes: TokenAttribute[];
  /** A `data:image/svg+xml;base64,` URI, safe to use as an `<img>` source. */
  imageSrc: string;
  /** The same image as markup, for inspection (never inserted into the page as HTML). */
  svg: string;
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/**
 * Decodes what `tokenURI` returns. The contract is trusted, but the page still only accepts the two shapes
 * it expects: a base64 JSON document whose image is a base64 SVG. Anything else is refused outright.
 */
export function decodeTokenUri(uri: string): TokenView {
  if (!uri.startsWith(JSON_PREFIX)) throw new Error("The token's metadata is not a base64 JSON data URI.");
  let doc: unknown;
  try {
    doc = JSON.parse(fromBase64(uri.slice(JSON_PREFIX.length)));
  } catch {
    throw new Error("The token's metadata is not valid JSON.");
  }
  const meta = doc as { name?: unknown; description?: unknown; attributes?: unknown; image?: unknown };
  if (typeof meta.name !== "string") throw new Error("The token's metadata has no name.");
  if (typeof meta.image !== "string" || !meta.image.startsWith(SVG_PREFIX)) {
    throw new Error("The token's image is not an SVG data URI.");
  }

  const attributes: TokenAttribute[] = [];
  if (Array.isArray(meta.attributes)) {
    for (const a of meta.attributes as unknown[]) {
      const item = a as { trait_type?: unknown; value?: unknown } | null;
      if (item && typeof item.trait_type === "string" && (typeof item.value === "string" || typeof item.value === "number")) {
        attributes.push({ trait: item.trait_type, value: item.value });
      }
    }
  }

  return {
    name: meta.name,
    description: typeof meta.description === "string" ? meta.description : "",
    attributes,
    imageSrc: meta.image,
    svg: fromBase64(meta.image.slice(SVG_PREFIX.length)),
  };
}

export async function fetchToken(client: Reader, config: AppConfig, id: number): Promise<TokenView> {
  const uri = await client.readContract({ address: config.proofkin, abi: proofkinAbi, functionName: "tokenURI", args: [BigInt(id)] });
  return decodeTokenUri(uri);
}

// ----------------------------------------------------------- who solved what

export interface SolvedRow {
  tokenId: number;
  puzzleId: number;
  author: Address;
  nodeCount: number;
  /** 1-based solve order within the puzzle. */
  rank: number;
  blockNumber: bigint;
}

/**
 * Every `Solved` event since the deployment, oldest first. Public RPC nodes cap the block range of one
 * `eth_getLogs` request, so the history is read in slices.
 */
export async function fetchSolved(client: Reader, config: AppConfig, opts: { blockRange?: bigint } = {}): Promise<SolvedRow[]> {
  const range = opts.blockRange ?? 9000n;
  const latest = await client.getBlockNumber({ cacheTime: 0 });
  const rows: SolvedRow[] = [];
  for (let from = config.deployBlock; from <= latest; from += range) {
    const to = from + range - 1n < latest ? from + range - 1n : latest;
    const logs = await client.getContractEvents({
      address: config.proofkin,
      abi: proofkinAbi,
      eventName: "Solved",
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      rows.push({
        tokenId: Number(log.args.tokenId),
        puzzleId: Number(log.args.puzzleId),
        author: log.args.author!,
        nodeCount: Number(log.args.nodeCount),
        rank: Number(log.args.rank),
        blockNumber: log.blockNumber,
      });
    }
  }
  return rows.sort((a, b) => a.tokenId - b.tokenId);
}

export interface LeaderboardEntry {
  tokenId: number;
  author: Address;
  nodeCount: number;
  rank: number;
  /** Shares the smallest node count solved for this puzzle (what "Optimal" means on the token). */
  holdsRecord: boolean;
}

/** One list per puzzle: smallest program first, and among equals the earlier solver. */
export function leaderboards(rows: SolvedRow[]): LeaderboardEntry[][] {
  return Array.from({ length: PUZZLES }, (_, puzzleId) => {
    const mine = rows.filter((r) => r.puzzleId === puzzleId).sort((a, b) => a.nodeCount - b.nodeCount || a.rank - b.rank);
    const best = mine[0]?.nodeCount;
    return mine.map((r) => ({ tokenId: r.tokenId, author: r.author, nodeCount: r.nodeCount, rank: r.rank, holdsRecord: r.nodeCount === best }));
  });
}
