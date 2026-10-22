import { bytesToHex } from "viem";
import { describe, expect, it } from "vitest";
import { type SolvedRow, decodeTokenUri, fetchSolved, fetchToken, leaderboards } from "../src/gallery.ts";
import { type MintDeps, prepareCommit, sendCommit, sendReveal } from "../src/mint.ts";
import { PendingStore } from "../src/storage.ts";
import { isolateChain, makeKit, padVariant, programOf, solutionText } from "./kit.ts";
import { MemoryStorage } from "./memoryStorage.ts";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const b64 = (s: string) => Buffer.from(s).toString("base64");
const uriOf = (json: unknown) => `data:application/json;base64,${b64(JSON.stringify(json))}`;
const goodJson = {
  name: "Proofkin #7",
  description: "A solved puzzle.",
  attributes: [
    { trait_type: "Puzzle", value: "SORT8" },
    { trait_type: "Nodes", display_type: "number", value: 46 },
    { trait_type: "Optimal", value: "Yes" },
  ],
  image: `data:image/svg+xml;base64,${b64(SVG)}`,
};

describe("decodeTokenUri", () => {
  it("reads the name, description, traits in order, and the image", () => {
    const view = decodeTokenUri(uriOf(goodJson));
    expect(view.name).toBe("Proofkin #7");
    expect(view.description).toBe("A solved puzzle.");
    expect(view.attributes).toEqual([
      { trait: "Puzzle", value: "SORT8" },
      { trait: "Nodes", value: 46 },
      { trait: "Optimal", value: "Yes" },
    ]);
    expect(view.imageSrc).toBe(goodJson.image);
    expect(view.svg).toBe(SVG);
  });

  it("copes with non-ASCII text", () => {
    const view = decodeTokenUri(`data:application/json;base64,${Buffer.from(JSON.stringify({ ...goodJson, name: "Proofkin #7 · ✓" })).toString("base64")}`);
    expect(view.name).toBe("Proofkin #7 · ✓");
  });

  it.each([
    ["not a JSON data URI", "https://example.com/token/7"],
    ["JSON that does not parse", `data:application/json;base64,${b64("{nope")}`],
    ["no name", uriOf({ ...goodJson, name: undefined })],
    ["an image that is not an SVG data URI", uriOf({ ...goodJson, image: "https://example.com/x.png" })],
    ["a script as the image", uriOf({ ...goodJson, image: "javascript:alert(1)" })],
    ["an HTML data URI as the image", uriOf({ ...goodJson, image: `data:text/html;base64,${b64("<script>1</script>")}` })],
  ])("refuses %s", (_label, uri) => {
    expect(() => decodeTokenUri(uri)).toThrow();
  });

  it("drops malformed trait entries rather than failing the whole token", () => {
    const view = decodeTokenUri(uriOf({ ...goodJson, attributes: [{ trait_type: "Puzzle", value: "SORT8" }, { nope: 1 }, "junk", { trait_type: "X", value: { nested: true } }] }));
    expect(view.attributes).toEqual([{ trait: "Puzzle", value: "SORT8" }]);
  });
});

describe("leaderboards", () => {
  const row = (tokenId: number, puzzleId: number, nodeCount: number, rank: number): SolvedRow => ({
    tokenId,
    puzzleId,
    author: `0x${tokenId.toString(16).padStart(40, "0")}`,
    nodeCount,
    rank,
    blockNumber: BigInt(tokenId),
  });

  it("has one list per puzzle, smallest program first, earlier solver first among equals", () => {
    const boards = leaderboards([row(1, 0, 19, 1), row(2, 0, 17, 2), row(3, 2, 46, 1), row(4, 0, 17, 3), row(5, 0, 18, 4)]);
    expect(boards).toHaveLength(6);
    expect(boards[0]!.map((e) => e.tokenId)).toEqual([2, 4, 5, 1]);
    expect(boards[2]!.map((e) => e.tokenId)).toEqual([3]);
    expect(boards[1]).toEqual([]);
  });

  it("orders equal sizes by solve rank whatever order the rows arrive in", () => {
    const [board] = leaderboards([row(4, 0, 17, 3), row(2, 0, 17, 2), row(9, 0, 17, 4)]);
    expect(board!.map((e) => e.tokenId)).toEqual([2, 4, 9]);
  });

  it("marks everyone who shares the smallest size as holding the record", () => {
    const [board] = leaderboards([row(1, 0, 19, 1), row(2, 0, 17, 2), row(3, 0, 17, 3)]);
    expect(board!.map((e) => e.holdsRecord)).toEqual([true, true, false]);
  });

  it("carries the fields a table needs", () => {
    const [board] = leaderboards([row(2, 0, 17, 2)]);
    expect(board![0]).toEqual({ tokenId: 2, author: row(2, 0, 17, 2).author, nodeCount: 17, rank: 2, holdsRecord: true });
  });
});

describe("reading a real collection", async () => {
  const kit = await makeKit();
  isolateChain(kit);
  const { publicClient, testClient, config } = kit;
  const [, alice, bob] = kit.accounts as [`0x${string}`, `0x${string}`, `0x${string}`];

  const depsFor = (account: `0x${string}`): MintDeps => ({ publicClient, walletClient: kit.walletFor(account), config, store: new PendingStore(new MemoryStorage()) });

  /** the app's own flow: prepare, commit, wait, reveal */
  async function mint(account: `0x${string}`, program: Uint8Array) {
    const d = depsFor(account);
    const hex = bytesToHex(program);
    const committed = await sendCommit(d, await prepareCommit(d, { program: hex, puzzleId: program[1]!, nodeCount: program[2]! }));
    await testClient.mine({ blocks: 3 });
    return sendReveal(d, committed);
  }

  const quorum = programOf(solutionText("QUORUM7")).program;
  const sort8 = programOf(solutionText("SORT8")).program;

  it("finds every Solved event, with who solved what and in which order", async () => {
    await mint(alice, padVariant(quorum, 2)); // 19 nodes
    await mint(bob, quorum); // 17 nodes
    await mint(alice, sort8); // 46 nodes

    const rows = await fetchSolved(publicClient, config);
    expect(rows.map(({ tokenId, puzzleId, author, nodeCount, rank }) => ({ tokenId, puzzleId, author, nodeCount, rank }))).toEqual([
      { tokenId: 1, puzzleId: 0, author: alice, nodeCount: 19, rank: 1 },
      { tokenId: 2, puzzleId: 0, author: bob, nodeCount: 17, rank: 2 },
      { tokenId: 3, puzzleId: 2, author: alice, nodeCount: 46, rank: 1 },
    ]);

    const [q, , s] = leaderboards(rows);
    expect(q!.map((e) => [e.tokenId, e.nodeCount, e.holdsRecord])).toEqual([[2, 17, true], [1, 19, false]]);
    expect(s!.map((e) => e.tokenId)).toEqual([3]);
  });

  it("reads the same events in small block ranges, which public RPCs require", async () => {
    await mint(alice, quorum);
    await mint(bob, sort8);
    const whole = await fetchSolved(publicClient, config);
    const chunked = await fetchSolved(publicClient, config, { blockRange: 2n });
    expect(chunked).toEqual(whole);
    expect(chunked).toHaveLength(2); // none lost at a chunk edge, none counted twice
  });

  it("is empty before anything is minted", async () => {
    expect(await fetchSolved(publicClient, config)).toEqual([]);
  });

  it("fetches and decodes a real token", async () => {
    await mint(alice, sort8);
    const view = await fetchToken(publicClient, config, 1);
    expect(view.name).toBe("Proofkin #1");
    const traits = Object.fromEntries(view.attributes.map((a) => [a.trait, a.value]));
    expect(traits).toMatchObject({ Puzzle: "SORT8", Nodes: 46, "Solve rank": 1, "First Solver": "Yes", Optimal: "Yes" });
    expect(view.imageSrc).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(view.svg.startsWith("<svg ")).toBe(true);
    expect(view.svg.endsWith("</svg>")).toBe(true);
  });

  it("shows Optimal moving to a smaller solution of the same puzzle", async () => {
    await mint(alice, padVariant(quorum, 2));
    const before = await fetchToken(publicClient, config, 1);
    expect(before.attributes.find((a) => a.trait === "Optimal")?.value).toBe("Yes");

    await mint(bob, quorum);
    const after = await fetchToken(publicClient, config, 1);
    expect(after.attributes.find((a) => a.trait === "Optimal")?.value).toBe("No");
  });

  it("says plainly when a token does not exist", async () => {
    await expect(fetchToken(publicClient, config, 99)).rejects.toThrow();
  });
});
