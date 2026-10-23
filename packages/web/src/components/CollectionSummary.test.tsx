import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollectionSummary } from "@/components/CollectionSummary";

const state = {
  mintPrice: 10n ** 16n,
  totalSupply: 3n,
  solvedCount: [2, 1, 0, 0, 0, 0],
  bestNodes: [17, 15, 255, 255, 255, 255],
};

describe("CollectionSummary", () => {
  it("shows the chain, the price and how much of the collection is solved", () => {
    render(<CollectionSummary chainName="Base Sepolia" state={state} />);
    expect(screen.getByText("Base Sepolia")).toBeInTheDocument();
    expect(screen.getByText("0.01 ETH")).toBeInTheDocument();
    expect(screen.getByText("3 of 300")).toBeInTheDocument();
  });

  it("has a row per puzzle with its solved count and smallest solution", () => {
    render(<CollectionSummary chainName="Base Sepolia" state={state} />);
    const quorum = screen.getByRole("row", { name: /QUORUM7/ });
    expect(within(quorum).getByText("2 of 50")).toBeInTheDocument();
    expect(within(quorum).getByText("17 nodes")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + 6); // the header and six puzzles
  });

  it("says 'none yet' for a puzzle nobody has solved, not 255 nodes", () => {
    render(<CollectionSummary chainName="Base Sepolia" state={state} />);
    const sort = screen.getByRole("row", { name: /SORT8/ });
    expect(within(sort).getByText("none yet")).toBeInTheDocument();
    expect(screen.queryByText(/255/)).toBeNull();
  });
});
