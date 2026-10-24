import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PuzzleFilter } from "@/components/PuzzleFilter";

describe("PuzzleFilter", () => {
  it("offers every puzzle and all of them", () => {
    render(<PuzzleFilter />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "All",
      "QUORUM7",
      "MEDIAN5",
      "SORT8",
      "GRID_PATH",
      "KNAPSACK3",
      "FAIR_SPLIT4",
    ]);
  });

  it("links each choice to the gallery filtered that way, from its first page", () => {
    render(<PuzzleFilter current={2} />);
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/gallery");
    expect(screen.getByRole("link", { name: "GRID_PATH" })).toHaveAttribute("href", "/gallery?puzzle=grid-path");
  });

  it("says which one is showing", () => {
    render(<PuzzleFilter current={2} />);
    expect(screen.getByRole("link", { name: "SORT8" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current");
  });

  it("says All is showing when no puzzle is chosen", () => {
    render(<PuzzleFilter />);
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  });

  it("is a navigation of its own, named for what it does", () => {
    render(<PuzzleFilter />);
    expect(screen.getByRole("navigation", { name: "Filter by puzzle" })).toBeInTheDocument();
  });
});
