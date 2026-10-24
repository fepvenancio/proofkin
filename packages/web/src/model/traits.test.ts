import { describe, expect, it } from "vitest";

import { describeArt, describeTraits } from "@/model/traits";

// What the contract's `tokenURI` lists, in its order.
const traits = [
  { trait: "Puzzle", value: "SORT8" },
  { trait: "Nodes", value: 19 },
  { trait: "Depth", value: 6 },
  { trait: "Solve rank", value: 1 },
  { trait: "First Solver", value: "Yes" },
  { trait: "Record Setter", value: "No" },
  { trait: "Optimal", value: "Yes" },
  { trait: "Dominant op family", value: "Select" },
];

const find = (label: string) => describeTraits(traits).find((row) => row.label === label);

describe("describeTraits", () => {
  it("keeps the contract's order, one row for each trait", () => {
    expect(describeTraits(traits).map((row) => row.label)).toEqual([
      "Puzzle",
      "Nodes",
      "Depth",
      "Solved",
      "First solver",
      "Record setter",
      "Smallest so far",
      "Main operations",
    ]);
  });

  it("says where in the puzzle's 50 slots the solution came", () => {
    expect(find("Solved")?.value).toBe("1st of 50");
    expect(describeTraits([{ trait: "Solve rank", value: 12 }])[0]?.value).toBe("12th of 50");
  });

  it("prints numbers as text, and leaves the contract's words alone", () => {
    expect(find("Nodes")?.value).toBe("19");
    expect(find("Puzzle")?.value).toBe("SORT8");
    expect(find("Main operations")?.value).toBe("Select");
    expect(find("First solver")?.value).toBe("Yes");
  });

  it("warns that only the live trait can change", () => {
    expect(find("Smallest so far")?.note).toMatch(/smaller solution/i);
    expect(describeTraits(traits).filter((row) => row.note)).toHaveLength(1);
  });

  it("shows a trait the contract adds later as it is, rather than hiding it", () => {
    expect(describeTraits([{ trait: "Mood", value: "calm" }])).toEqual([{ label: "Mood", value: "calm" }]);
  });
});

describe("describeArt", () => {
  it("says in a sentence what the picture is, for someone who cannot see it", () => {
    expect(describeArt("Proofkin #3", "SORT8", 19)).toBe("Proofkin #3, a SORT8 solution of 19 nodes");
  });
});
