import { type LeaderboardEntry } from "@proofkin/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LeaderboardTable } from "@/components/LeaderboardTable";

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

const entries: LeaderboardEntry[] = [
  { tokenId: 4, author: ALICE, nodeCount: 17, rank: 3, holdsRecord: true },
  { tokenId: 2, author: BOB, nodeCount: 17, rank: 2, holdsRecord: true },
  { tokenId: 1, author: ALICE, nodeCount: 19, rank: 1, holdsRecord: false },
];

describe("LeaderboardTable", () => {
  it("is named for its puzzle", () => {
    render(<LeaderboardTable puzzleId={2} entries={entries} />);
    expect(screen.getByRole("table", { name: "Smallest solutions of SORT8" })).toBeInTheDocument();
  });

  it("has a row per solution, in the order it was given", () => {
    render(<LeaderboardTable puzzleId={2} entries={entries} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0]!.textContent)).toEqual(["17", "17", "19"]);
  });

  it("links each solution to its token", () => {
    render(<LeaderboardTable puzzleId={2} entries={entries} />);
    expect(screen.getByRole("link", { name: "#4" })).toHaveAttribute("href", "/token/4");
  });

  it("shows who solved it, shortened, and the whole address on hover", () => {
    render(<LeaderboardTable puzzleId={2} entries={entries} />);
    const [first] = screen.getAllByText("0x7099…79C8");
    expect(first).toHaveAttribute("title", ALICE);
  });

  it("says in words where in the order it came", () => {
    render(<LeaderboardTable puzzleId={2} entries={entries} />);
    expect(screen.getByText("3rd")).toBeInTheDocument();
    expect(screen.getByText("1st")).toBeInTheDocument();
  });

  it("marks the solutions that hold the record, in words as well as with the ring", () => {
    render(<LeaderboardTable puzzleId={2} entries={entries} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Smallest so far")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Smallest so far")).toBeInTheDocument();
    expect(within(rows[2]!).queryByText("Smallest so far")).not.toBeInTheDocument();
  });

  it("invites the first solution when there are none", () => {
    render(<LeaderboardTable puzzleId={2} entries={[]} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Nobody has solved SORT8 yet. The first solution sets the record.")).toBeInTheDocument();
  });
});
