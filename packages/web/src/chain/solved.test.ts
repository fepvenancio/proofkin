import { fetchSolved, type SolvedRow } from "@proofkin/core";
import { HttpRequestError } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { coverageProblem, getSolvedEntries } from "@/chain/solved";
import { requireAppConfig } from "@/config/env";

vi.mock("@proofkin/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@proofkin/core")>()),
  fetchSolved: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_cache: (read: () => Promise<unknown>) => read }));

const app = requireAppConfig({
  NEXT_PUBLIC_CHAIN: "base",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
});

const row = (tokenId: number, puzzleId: number, nodeCount: number, rank: number): SolvedRow => ({
  tokenId,
  puzzleId,
  author: `0x${tokenId.toString(16).padStart(40, "0")}`,
  nodeCount,
  rank,
  blockNumber: 1_000n + BigInt(tokenId),
});

describe("getSolvedEntries", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("lists who solved what, without the block, which a page has no use for", async () => {
    vi.mocked(fetchSolved).mockResolvedValueOnce([row(1, 2, 46, 1), row(2, 0, 17, 1)]);
    const entries = await getSolvedEntries(app, {});
    expect(entries).toEqual([
      { tokenId: 1, puzzleId: 2, author: row(1, 2, 46, 1).author, nodeCount: 46, rank: 1 },
      { tokenId: 2, puzzleId: 0, author: row(2, 0, 17, 1).author, nodeCount: 17, rank: 1 },
    ]);
  });

  it("holds only what a cache can store: no bigint survives into the answer", async () => {
    vi.mocked(fetchSolved).mockResolvedValueOnce([row(1, 2, 46, 1)]);
    const entries = await getSolvedEntries(app, {});
    expect(JSON.parse(JSON.stringify(entries))).toEqual(entries);
  });

  it("is undefined, not an exception, when the node cannot be read, and logs why without the URL", async () => {
    const failure = new HttpRequestError({
      url: "https://rpc.example/v2/SECRETKEY",
      body: {},
      details: "fetch failed",
    });
    vi.mocked(fetchSolved).mockRejectedValueOnce(failure);
    await expect(getSolvedEntries(app, {})).resolves.toBeUndefined();
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("the solutions");
    expect(logged).toContain("fetch failed");
    expect(logged).not.toContain("SECRETKEY");
  });
});

describe("coverageProblem", () => {
  it("is quiet when every solution was found", () => {
    expect(coverageProblem(3, 3)).toBeUndefined();
    expect(coverageProblem(0, 0)).toBeUndefined();
  });

  it("says how many are missing, and blames the deploy block, when the history is short", () => {
    const problem = coverageProblem(2, 3);
    expect(problem).toContain("2 of 3");
    expect(problem).toMatch(/deploy block/i);
  });
});
