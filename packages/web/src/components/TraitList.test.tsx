import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TraitList } from "@/components/TraitList";

const attributes = [
  { trait: "Puzzle", value: "SORT8" },
  { trait: "Nodes", value: 19 },
  { trait: "Solve rank", value: 1 },
  { trait: "Optimal", value: "Yes" },
];

describe("TraitList", () => {
  it("is a list of terms and what they mean", () => {
    render(<TraitList attributes={attributes} />);
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual([
      "Puzzle",
      "Nodes",
      "Solved",
      "Smallest so far",
    ]);
  });

  it("pairs each term with its value", () => {
    const { container } = render(<TraitList attributes={attributes} />);
    const values = [...container.querySelectorAll("dd")].map((d) => d.firstChild?.textContent);
    expect(values).toEqual(["SORT8", "19", "1st of 50", "Yes"]);
  });

  it("says that the live trait can change, beside that trait only", () => {
    const { container } = render(<TraitList attributes={attributes} />);
    const notes = screen.getAllByText(/smaller solution/i);
    expect(notes).toHaveLength(1);
    expect(within(notes[0]!.closest("dd")!).getByText("Yes")).toBeInTheDocument();
    expect(container.querySelectorAll("dd")).toHaveLength(4);
  });
});
