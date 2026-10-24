import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PuzzleRow } from "@/components/PuzzleRow";

describe("PuzzleRow", () => {
  it("names the puzzle and links to its page", () => {
    render(<PuzzleRow puzzleId={3} solved={0} best={255} recordRanks={[]} />);
    expect(screen.getByRole("link", { name: "GRID_PATH" })).toHaveAttribute("href", "/puzzles/grid-path");
  });

  it("offers to solve it, which is what the visitor came to do", () => {
    render(<PuzzleRow puzzleId={3} solved={0} best={255} recordRanks={[]} />);
    expect(screen.getByRole("link", { name: "Solve GRID_PATH" })).toHaveAttribute("href", "/puzzles/grid-path/solve");
  });

  it("says in a sentence what the puzzle asks", () => {
    render(<PuzzleRow puzzleId={2} solved={0} best={255} recordRanks={[]} />);
    expect(screen.getByText(/Eight numbers in: the same eight, smallest first\./)).toBeInTheDocument();
  });

  it("says how many are solved and how small the smallest is", () => {
    render(<PuzzleRow puzzleId={2} solved={3} best={19} recordRanks={[2]} />);
    expect(screen.getByText("3 of 50 solved. The smallest is 19 nodes.")).toBeInTheDocument();
  });

  it("invites the first solution, rather than showing 255, when nobody has solved it", () => {
    render(<PuzzleRow puzzleId={2} solved={0} best={255} recordRanks={[]} />);
    expect(screen.getByText("Nobody has solved it yet.")).toBeInTheDocument();
    expect(screen.queryByText(/255/)).not.toBeInTheDocument();
  });

  it("shows the puzzle's slots", () => {
    render(<PuzzleRow puzzleId={2} solved={3} best={19} recordRanks={[2]} />);
    expect(screen.getByRole("img", { name: "3 of 50 solved, smallest 19 nodes" })).toBeInTheDocument();
  });

  it("does not tell a puzzle with no solution to show a smallest size to the strip", () => {
    render(<PuzzleRow puzzleId={2} solved={0} best={255} recordRanks={[]} />);
    expect(screen.getByRole("img", { name: "0 of 50 solved" })).toBeInTheDocument();
  });
});
