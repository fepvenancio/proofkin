import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Page from "@/app/page";
import { getCollection } from "@/chain/collection";
import { getSolvedEntries } from "@/chain/solved";

import { collection, entries } from "../../test/data";

// `publicEnv` is read once, when `@/config/env` is first imported, so the variables must exist before the imports run.
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

const show = async (state = collection, found = entries) => {
  vi.mocked(getCollection).mockResolvedValueOnce(state);
  vi.mocked(getSolvedEntries).mockResolvedValueOnce(found);
  render(await Page());
};

describe("the home page", () => {
  it("says what the collection is, in a heading", async () => {
    await show();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/solve, not buy/i);
  });

  it("says how much is solved, what a solution costs and on which chain", async () => {
    await show();
    expect(screen.getByText("3 of 300 solved. Minting costs 0.01 ETH, on Base Sepolia.")).toBeInTheDocument();
  });

  it("shows the newest token as the large plate, and links to it", async () => {
    await show();
    const hero = screen.getByRole("link", { name: /Newest: Proofkin #3/ });
    expect(hero).toHaveAttribute("href", "/token/3");
    expect(screen.getByRole("img", { name: /Proofkin #3.*SORT8.*19 nodes/ })).toHaveAttribute("src", "/token/3/art");
    expect(screen.getByRole("img", { name: /Proofkin #3.*SORT8/ })).toHaveAttribute("loading", "eager");
  });

  it("shows an empty plate and invites the first solution when nothing is solved", async () => {
    await show({ ...collection, totalSupply: 0, solvedCount: [0, 0, 0, 0, 0, 0], bestNodes: Array(6).fill(255) }, []);
    expect(screen.getByRole("img", { name: /nothing has been solved yet/i })).toBeInTheDocument();
    expect(screen.getByText("Nothing has been solved yet. The first solution sets every record.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Newest/ })).not.toBeInTheDocument();
  });

  it("lists the six puzzles, each with a link to its page", async () => {
    await show();
    const section = screen.getByRole("region", { name: "Six puzzles, fifty solutions each" });
    expect(
      within(section)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"]);
    expect(within(section).getByRole("link", { name: "SORT8" })).toHaveAttribute("href", "/puzzles/sort8");
  });

  it("gives each puzzle its count, its smallest size and the ring on the solution that holds it", async () => {
    await show();
    expect(screen.getByText("2 of 50 solved. The smallest is 17 nodes.")).toBeInTheDocument();
    const strip = screen.getByRole("img", { name: "2 of 50 solved, smallest 17 nodes" });
    const kinds = [...strip.querySelectorAll("[data-slot]")].slice(0, 3).map((s) => s.getAttribute("data-slot"));
    expect(kinds).toEqual(["filled", "record", "empty"]); // token 2 was the 2nd QUORUM7 solution
    expect(screen.getAllByText("Nobody has solved it yet.")).toHaveLength(4);
  });

  it("says so, rather than showing short lists as complete, when the history is missing solutions", async () => {
    await show(collection, entries.slice(0, 2));
    expect(screen.getByRole("status")).toHaveTextContent("The lists below know 2 of 3 solutions");
  });

  it("says which chain it could not reach, when the collection cannot be read", async () => {
    vi.mocked(getCollection).mockResolvedValueOnce(undefined);
    vi.mocked(getSolvedEntries).mockResolvedValueOnce(entries);
    render(await Page());
    expect(screen.getByRole("status")).toHaveTextContent("Could not reach Base Sepolia right now");
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("says the same when the solutions cannot be read", async () => {
    vi.mocked(getCollection).mockResolvedValueOnce(collection);
    vi.mocked(getSolvedEntries).mockResolvedValueOnce(undefined);
    render(await Page());
    expect(screen.getByRole("status")).toHaveTextContent("Could not reach Base Sepolia right now");
  });

  it("names no RPC endpoint when it cannot read", async () => {
    vi.mocked(getCollection).mockResolvedValueOnce(undefined);
    vi.mocked(getSolvedEntries).mockResolvedValueOnce(undefined);
    const { container } = render(await Page());
    expect(container.textContent).not.toMatch(/https?:/);
  });
});
