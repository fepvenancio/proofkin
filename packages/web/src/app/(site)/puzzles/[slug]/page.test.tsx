import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Page from "@/app/(site)/puzzles/[slug]/page";
import { getCollection } from "@/chain/collection";
import { getSolvedEntries } from "@/chain/solved";

import { collection, entries } from "../../../../../test/data";

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

const open = (slug: string, state = collection, found = entries) => {
  vi.mocked(getCollection).mockResolvedValueOnce(state);
  vi.mocked(getSolvedEntries).mockResolvedValueOnce(found);
  return Page({ params: Promise.resolve({ slug }) });
};

describe("a puzzle's page", () => {
  it("names the puzzle and says what it asks", async () => {
    render(await open("sort8"));
    expect(screen.getByRole("heading", { level: 1, name: "SORT8" })).toBeInTheDocument();
    expect(screen.getByText(/Eight numbers in: the same eight, smallest first\./)).toBeInTheDocument();
    expect(screen.getByText("The eight values in ascending order, one per output slot.")).toBeInTheDocument();
  });

  it("shows the puzzle's slots and how many are solved", async () => {
    render(await open("quorum7"));
    expect(screen.getByRole("img", { name: "2 of 50 solved, smallest 17 nodes" })).toBeInTheDocument();
  });

  it("lists the puzzle's solutions smallest first, which is the leaderboard", async () => {
    render(await open("quorum7"));
    const rows = within(screen.getByRole("table", { name: "Smallest solutions of QUORUM7" }))
      .getAllByRole("row")
      .slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0]!.textContent)).toEqual(["17", "20"]);
    expect(within(rows[0]!).getByRole("link", { name: "#2" })).toHaveAttribute("href", "/token/2");
  });

  it("leaves another puzzle's solutions out", async () => {
    render(await open("quorum7"));
    expect(screen.queryByRole("link", { name: "#3" })).not.toBeInTheDocument();
  });

  it("invites the first solution to a puzzle nobody has solved", async () => {
    render(await open("median5"));
    expect(screen.getByText("Nobody has solved MEDIAN5 yet. The first solution sets the record.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("offers to solve the puzzle, above its leaderboard", async () => {
    render(await open("sort8"));
    expect(screen.getByRole("link", { name: "Solve SORT8" })).toHaveAttribute("href", "/puzzles/sort8/solve");
  });

  it("links to the puzzle's plates in the gallery", async () => {
    render(await open("sort8"));
    expect(screen.getByRole("link", { name: "See SORT8 in the gallery" })).toHaveAttribute(
      "href",
      "/gallery?puzzle=sort8",
    );
  });

  it("is not found for a puzzle that does not exist", async () => {
    await expect(open("chess")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(open("SORT8")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("says so when the history is missing solutions", async () => {
    render(await open("quorum7", collection, entries.slice(0, 2)));
    expect(screen.getByRole("status")).toHaveTextContent("The lists below know 2 of 3 solutions");
  });

  it("says which chain it could not reach", async () => {
    vi.mocked(getCollection).mockResolvedValueOnce(undefined);
    vi.mocked(getSolvedEntries).mockResolvedValueOnce(entries);
    render(await Page({ params: Promise.resolve({ slug: "sort8" }) }));
    expect(screen.getByRole("status")).toHaveTextContent("Could not reach Base Sepolia right now");
  });
});
