import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Page, { generateMetadata } from "@/app/puzzles/[slug]/solve/page";
import { getCollection } from "@/chain/collection";

import { collection } from "../../../../../test/data";

vi.hoisted(() => {
  const settings = {
    NEXT_PUBLIC_CHAIN: "baseSepolia",
    NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
});

vi.mock("@/chain/collection", () => ({ getCollection: vi.fn() }));
// The island needs a browser and the wallet providers; this page's job is what it hands to it.
vi.mock("@/features/solve/SolveIsland", () => ({
  SolveIsland: ({
    puzzleId,
    facts,
    children,
  }: {
    puzzleId: number;
    facts?: { price: string; slotsLeft: number };
    children: React.ReactNode;
  }) => (
    <div data-island data-puzzle={puzzleId} data-price={facts?.price} data-slots={facts?.slotsLeft}>
      {children}
    </div>
  ),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const open = (slug: string, state: typeof collection | null = collection) => {
  vi.mocked(getCollection).mockResolvedValueOnce(state ?? undefined);
  return Page({ params: Promise.resolve({ slug }) });
};

describe("the solve page", () => {
  it("gives the island the puzzle, with the puzzle's statement inside it", async () => {
    const { container } = render(await open("sort8"));
    const island = container.querySelector("[data-island]")!;
    expect(island).toHaveAttribute("data-puzzle", "2");
    expect(island.querySelector("h1")).toHaveTextContent("SORT8");
  });

  it("tells the statement what the chain says: the price, the slots left, the smallest solution", async () => {
    render(await open("sort8"));
    expect(screen.getByText("0.01 ETH")).toBeInTheDocument();
    expect(screen.getByText("49 of 50 left")).toBeInTheDocument(); // one SORT8 solution in the fixture
    expect(screen.getByText("19 nodes")).toBeInTheDocument();
  });

  it("says 'none yet' for a puzzle nobody has solved", async () => {
    render(await open("median5"));
    expect(screen.getByText("none yet")).toBeInTheDocument();
    expect(screen.getByText("50 of 50 left")).toBeInTheDocument();
  });

  it("still shows the puzzle when the chain cannot be read: writing and testing a program need no chain", async () => {
    render(await open("sort8", null));
    expect(screen.getByRole("heading", { level: 1, name: "SORT8" })).toBeInTheDocument();
    expect(screen.queryByText("Price")).not.toBeInTheDocument();
  });

  it("gives the island the same facts, because a reveal's price is what its button says", async () => {
    const { container } = render(await open("sort8"));
    const island = container.querySelector("[data-island]")!;
    expect(island).toHaveAttribute("data-price", "0.01 ETH");
    expect(island).toHaveAttribute("data-slots", "49");
  });

  it("gives the island no facts when the chain cannot be read, and it still stands", async () => {
    const { container } = render(await open("sort8", null));
    const island = container.querySelector("[data-island]")!;
    expect(island).not.toHaveAttribute("data-price");
  });

  it("is not found for a puzzle that does not exist", async () => {
    await expect(open("chess")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(open("SORT8")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is titled for the puzzle", async () => {
    await expect(generateMetadata({ params: Promise.resolve({ slug: "grid-path" }) })).resolves.toEqual({
      title: "Solve GRID_PATH",
    });
    await expect(generateMetadata({ params: Promise.resolve({ slug: "chess" }) })).resolves.toEqual({ title: "Solve" });
  });
});
