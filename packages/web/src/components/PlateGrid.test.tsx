import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlateGrid } from "@/components/PlateGrid";
import { type SolvedEntry } from "@/model/data";

const entry = (tokenId: number, puzzleId: number, nodeCount: number, rank = 1): SolvedEntry => ({
  tokenId,
  puzzleId,
  author: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  nodeCount,
  rank,
});

// Puzzle 2 (SORT8) has solved at 19 nodes and nobody smaller; puzzle 0 (QUORUM7) is at 17.
const bestNodes = [17, 255, 19, 255, 255, 255];

describe("PlateGrid", () => {
  it("lists one token per entry, in the order it was given", () => {
    render(<PlateGrid entries={[entry(3, 2, 19), entry(2, 0, 17), entry(1, 0, 20, 2)]} bestNodes={bestNodes} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => within(item).getByText(/^Proofkin #\d+$/).textContent)).toEqual([
      "Proofkin #3",
      "Proofkin #2",
      "Proofkin #1",
    ]);
  });

  it("links each token to its page", () => {
    render(<PlateGrid entries={[entry(3, 2, 19)]} bestNodes={bestNodes} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/token/3");
  });

  it("says which puzzle it solves and how small it is", () => {
    render(<PlateGrid entries={[entry(3, 2, 19)]} bestNodes={bestNodes} />);
    expect(screen.getByText("SORT8, 19 nodes")).toBeInTheDocument();
  });

  it("names the link by its caption, since the art beside it says nothing a screen reader can use", () => {
    render(<PlateGrid entries={[entry(3, 2, 19)]} bestNodes={bestNodes} />);
    expect(screen.getByRole("link", { name: /Proofkin #3.*SORT8, 19 nodes/ })).toBeInTheDocument();
    expect(screen.getByRole("link").querySelector("img")).toHaveAttribute("alt", "");
  });

  it("marks the smallest solution of a puzzle, and only those", () => {
    render(<PlateGrid entries={[entry(3, 2, 19), entry(1, 0, 20, 2), entry(2, 0, 17)]} bestNodes={bestNodes} />);
    const marked = screen.getAllByText("Smallest so far").map((mark) => mark.closest("li")!);
    expect(marked.map((item) => within(item).getByText(/^Proofkin #\d+$/).textContent)).toEqual([
      "Proofkin #3",
      "Proofkin #2",
    ]);
  });

  it("marks every solution that shares the smallest size", () => {
    render(<PlateGrid entries={[entry(4, 0, 17, 3), entry(2, 0, 17)]} bestNodes={bestNodes} />);
    expect(screen.getAllByText("Smallest so far")).toHaveLength(2);
  });

  it("is an empty list, not a broken page, with nothing to show", () => {
    render(<PlateGrid entries={[]} bestNodes={bestNodes} />);
    expect(screen.getByRole("list")).toBeEmptyDOMElement();
  });
});
