import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Page from "@/app/gallery/page";
import { getCollection } from "@/chain/collection";
import { getSolvedEntries } from "@/chain/solved";
import { type SolvedEntry } from "@/model/data";

import { collection, entries } from "../../../test/data";

vi.hoisted(() => {
  const settings = {
    NEXT_PUBLIC_CHAIN: "baseSepolia",
    NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
});

vi.mock("@/chain/collection", () => ({ getCollection: vi.fn() }));
vi.mock("@/chain/solved", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/chain/solved")>()),
  getSolvedEntries: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const open = (params: Record<string, string> = {}, state = collection, found: SolvedEntry[] = entries) => {
  vi.mocked(getCollection).mockResolvedValueOnce(state);
  vi.mocked(getSolvedEntries).mockResolvedValueOnce(found);
  return Page({ searchParams: Promise.resolve(params) });
};

const names = () => screen.getAllByText(/^Proofkin #\d+$/).map((n) => n.textContent);

/** `count` QUORUM7 solutions, ids 1..count. */
const many = (count: number): SolvedEntry[] =>
  Array.from({ length: count }, (_, i) => ({ ...entries[0]!, tokenId: i + 1, rank: (i % 50) + 1 }));

describe("the gallery", () => {
  it("shows every token, newest first", async () => {
    render(await open());
    expect(names()).toEqual(["Proofkin #3", "Proofkin #2", "Proofkin #1"]);
  });

  it("has a heading, and says how many there are", async () => {
    render(await open());
    expect(screen.getByRole("heading", { level: 1, name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByText("3 tokens, newest first.")).toBeInTheDocument();
  });

  it("shows only one puzzle's tokens when asked, and says which filter is on", async () => {
    render(await open({ puzzle: "quorum7" }));
    expect(names()).toEqual(["Proofkin #2", "Proofkin #1"]);
    expect(screen.getByRole("link", { name: "QUORUM7" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("2 QUORUM7 tokens, newest first.")).toBeInTheDocument();
  });

  it("marks the smallest solutions against what the collection says is smallest", async () => {
    render(await open());
    const marked = screen.getAllByText("Smallest so far").map((mark) => mark.closest("li")!);
    expect(marked.map((li) => within(li).getByText(/^Proofkin #\d+$/).textContent)).toEqual([
      "Proofkin #3",
      "Proofkin #2",
    ]);
  });

  it("pages through 24 at a time, with the way to the older ones", async () => {
    render(await open({}, { ...collection, totalSupply: 30 }, many(30)));
    expect(names()).toHaveLength(24);
    expect(names()[0]).toBe("Proofkin #30");
    expect(screen.getByRole("link", { name: "Older" })).toHaveAttribute("href", "/gallery?page=2");
  });

  it("shows the rest on the next page", async () => {
    render(await open({ page: "2" }, { ...collection, totalSupply: 30 }, many(30)));
    expect(names()).toEqual(["Proofkin #6", "Proofkin #5", "Proofkin #4", "Proofkin #3", "Proofkin #2", "Proofkin #1"]);
    expect(screen.getByRole("link", { name: "Newer" })).toHaveAttribute("href", "/gallery");
  });

  it("is not found beyond the last page, though the first page always exists", async () => {
    await expect(open({ page: "2" })).rejects.toThrow("NEXT_NOT_FOUND");
    vi.mocked(getCollection).mockResolvedValueOnce({ ...collection, totalSupply: 0 });
    vi.mocked(getSolvedEntries).mockResolvedValueOnce([]);
    await expect(Page({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
  });

  it("invites the first solution when there is nothing to show", async () => {
    render(await open({}, { ...collection, totalSupply: 0 }, []));
    expect(screen.getByText("Nothing has been solved yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the puzzles" })).toHaveAttribute("href", "/");
  });

  it("says when a puzzle has nothing yet, and offers the others", async () => {
    render(await open({ puzzle: "median5" }));
    expect(screen.getByText("Nobody has solved MEDIAN5 yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All" })).toBeInTheDocument();
  });

  it("says so when the history is missing solutions", async () => {
    render(await open({}, collection, entries.slice(0, 2)));
    expect(screen.getByRole("status")).toHaveTextContent("The lists below know 2 of 3 solutions");
  });

  it("says which chain it could not reach", async () => {
    vi.mocked(getCollection).mockResolvedValueOnce(undefined);
    vi.mocked(getSolvedEntries).mockResolvedValueOnce(entries);
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("status")).toHaveTextContent("Could not reach Base Sepolia right now");
  });
});
