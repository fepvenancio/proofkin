import { gridDiagramSvg } from "@proofkin/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PuzzleStatement } from "@/features/solve/PuzzleStatement";

describe("PuzzleStatement", () => {
  it("names the puzzle and says what it asks", () => {
    render(<PuzzleStatement puzzleId={2} />);
    expect(screen.getByRole("heading", { level: 1, name: "SORT8" })).toBeInTheDocument();
    expect(screen.getByText(/Eight numbers in: the same eight, smallest first\./)).toBeInTheDocument();
  });

  it("lists the inputs as the lines that read them, with the values they can take, a run of alike inputs as one line", () => {
    render(<PuzzleStatement puzzleId={2} />);
    const items = within(screen.getByRole("list", { name: "Inputs" })).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("IN 0 to 7");
    expect(items[0]).toHaveTextContent("x0 to x7");
    expect(items[0]).toHaveTextContent("0 to 255");
  });

  it("gives an input of its own a line of its own, named by the slot that reads it", () => {
    render(<PuzzleStatement puzzleId={0} />);
    const items = within(screen.getByRole("list", { name: "Inputs" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent("IN 7");
    expect(items[1]).toHaveTextContent("t, 1 to 7");
  });

  it("keeps every line when no two inputs are alike", () => {
    render(<PuzzleStatement puzzleId={4} />);
    expect(within(screen.getByRole("list", { name: "Inputs" })).getAllByRole("listitem")).toHaveLength(7);
  });

  it("says in words what the answer is, for a puzzle with one output", () => {
    render(<PuzzleStatement puzzleId={1} />);
    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Answers" })).not.toBeInTheDocument();
  });

  it("numbers the output slots, for a puzzle with several", () => {
    render(<PuzzleStatement puzzleId={2} />);
    const answers = screen.getByRole("list", { name: "Answers" });
    expect(within(answers).getAllByRole("listitem")).toHaveLength(8);
    expect(within(answers).getAllByRole("listitem")[0]).toHaveTextContent("0");
  });

  it("gives the rule, and every fixed edge case the contract tries whatever the seed", () => {
    render(<PuzzleStatement puzzleId={2} />);
    expect(screen.getByText("The eight values in ascending order, one per output slot.")).toBeInTheDocument();
    const cases = screen.getByRole("list", { name: "Edge cases" });
    expect(within(cases).getAllByRole("listitem")).toHaveLength(4);
  });

  it("explains how the 12 edges of GRID_PATH are numbered, and draws them", () => {
    const { container } = render(<PuzzleStatement puzzleId={3} />);
    expect(screen.getByText(/Inputs 0 to 5 are the horizontal edges/)).toBeInTheDocument();
    expect(container.querySelector("svg[aria-label='GRID_PATH edge numbering']")).not.toBeNull();
    expect(container.innerHTML).toContain(gridDiagramSvg().slice(0, 80));
  });

  it("has no diagram for a puzzle that does not need one", () => {
    const { container } = render(<PuzzleStatement puzzleId={2} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByText(/horizontal edges/)).not.toBeInTheDocument();
  });

  it("takes its colour from the puzzle", () => {
    const { container } = render(<PuzzleStatement puzzleId={2} />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--h")).toBe("265");
  });

  it("shows what the chain says about the puzzle when it was told, and nothing when it was not", () => {
    const { rerender } = render(
      <PuzzleStatement puzzleId={2} facts={{ price: "0.01 ETH", slotsLeft: 49, best: 46 }} />,
    );
    expect(screen.getByText("0.01 ETH")).toBeInTheDocument();
    expect(screen.getByText("49 of 50 left")).toBeInTheDocument();
    expect(screen.getByText("46 nodes")).toBeInTheDocument();
    rerender(<PuzzleStatement puzzleId={2} />);
    expect(screen.queryByText("0.01 ETH")).not.toBeInTheDocument();
  });

  it("says 'none yet' rather than 255 for a puzzle nobody has solved", () => {
    render(<PuzzleStatement puzzleId={2} facts={{ price: "0.01 ETH", slotsLeft: 50, best: undefined }} />);
    expect(screen.getByText("none yet")).toBeInTheDocument();
  });
});
