import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Page from "@/app/(site)/token/[id]/page";
import { getCollection } from "@/chain/collection";
import { getSolvedEntries } from "@/chain/solved";
import { getTokenDetail } from "@/chain/token";
import { type ReadResult, type TokenDetail } from "@/model/data";

import { collection, entries, owners } from "../../../../../test/data";

vi.hoisted(() => {
  const settings = {
    NEXT_PUBLIC_CHAIN: "baseSepolia",
    NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
});

vi.mock("@/chain/collection", () => ({ getCollection: vi.fn() }));
vi.mock("@/chain/token", () => ({ getTokenDetail: vi.fn() }));
vi.mock("@/chain/solved", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/chain/solved")>()),
  getSolvedEntries: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const detail = (id: number): TokenDetail => ({
  id,
  name: `Proofkin #${id}`,
  attributes: [
    { trait: "Puzzle", value: "SORT8" },
    { trait: "Nodes", value: 19 },
    { trait: "Solve rank", value: 1 },
    { trait: "Optimal", value: "Yes" },
  ],
  owner: owners.bob,
});

const open = (
  id: string,
  result: ReadResult<TokenDetail> = { kind: "found", value: detail(Number(id)) },
  state: typeof collection | null = collection,
) => {
  vi.mocked(getCollection).mockResolvedValueOnce(state ?? undefined);
  vi.mocked(getTokenDetail).mockResolvedValueOnce(result);
  vi.mocked(getSolvedEntries).mockResolvedValueOnce(entries);
  return Page({ params: Promise.resolve({ id }) });
};

describe("a token's page", () => {
  it("names the token", async () => {
    render(await open("3"));
    expect(screen.getByRole("heading", { level: 1, name: "Proofkin #3" })).toBeInTheDocument();
  });

  it("shows its art large and first, described in words", async () => {
    render(await open("3"));
    const art = screen.getByRole("img", { name: "Proofkin #3, a SORT8 solution of 19 nodes" });
    expect(art).toHaveAttribute("src", "/token/3/art");
    expect(art).toHaveAttribute("loading", "eager");
  });

  it("lists the contract's traits, and says the live one can change", async () => {
    render(await open("3"));
    expect(screen.getByText("Smallest so far")).toBeInTheDocument();
    expect(screen.getByText(/smaller solution/i)).toBeInTheDocument();
    expect(screen.getByText("1st of 50")).toBeInTheDocument();
  });

  it("says who solved it and who owns it now, which tokens being tradable makes two people", async () => {
    render(await open("3"));
    expect(screen.getByText("Solved by")).toBeInTheDocument();
    expect(screen.getByText(owners.alice)).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText(owners.bob)).toBeInTheDocument();
  });

  it("links to the puzzle it solves", async () => {
    render(await open("3"));
    expect(screen.getByRole("link", { name: "SORT8" })).toHaveAttribute("href", "/puzzles/sort8");
  });

  it("links on to the next and previous tokens", async () => {
    render(await open("2"));
    expect(screen.getByRole("link", { name: "Previous: #1" })).toHaveAttribute("href", "/token/1");
    expect(screen.getByRole("link", { name: "Next: #3" })).toHaveAttribute("href", "/token/3");
  });

  it("has nothing before the first token", async () => {
    render(await open("1"));
    expect(screen.queryByRole("link", { name: /Previous/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next: #2" })).toBeInTheDocument();
  });

  it("has nothing after the newest", async () => {
    render(await open("3"));
    expect(screen.queryByRole("link", { name: /Next/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous: #2" })).toBeInTheDocument();
  });

  it("links to the token on the chain's explorer", async () => {
    render(await open("3"));
    expect(screen.getByRole("link", { name: "View on the explorer" })).toHaveAttribute(
      "href",
      "https://sepolia.basescan.org/nft/0x5FbDB2315678afecb367f032d93F642f64180aa3/3",
    );
  });

  it("is not found for an id that is not a token number, or above the 300 the collection can hold, without reading", async () => {
    for (const bad of ["0", "03", "abc", "-1", "301"]) {
      await expect(Page({ params: Promise.resolve({ id: bad }) })).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(vi.mocked(getTokenDetail)).not.toHaveBeenCalled();
    expect(vi.mocked(getCollection)).not.toHaveBeenCalled();
  });

  it("asks the contract about a token beyond the cached supply, so one minted a moment ago is not a 404", async () => {
    // the cache says 3 tokens exist; the contract says token 4 does, because someone minted it since
    render(await open("4"));
    expect(screen.getByRole("heading", { level: 1, name: "Proofkin #4" })).toBeInTheDocument();
    expect(vi.mocked(getTokenDetail)).toHaveBeenCalledWith(expect.anything(), 4);
  });

  it("is not found for a token the contract has not minted, even one within 300", async () => {
    await expect(open("4", { kind: "missing" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is not found when the contract says the token does not exist", async () => {
    await expect(open("3", { kind: "missing" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("says which chain it could not reach, when the token cannot be read", async () => {
    render(await open("3", { kind: "unavailable" }));
    expect(screen.getByRole("status")).toHaveTextContent("Could not reach Base Sepolia right now");
  });

  it("says the same when the collection cannot be read", async () => {
    render(await open("3", undefined, null));
    expect(screen.getByRole("status")).toHaveTextContent("Could not reach Base Sepolia right now");
  });
});
