import { PUZZLE_INFO } from "@proofkin/core";
import { describe, expect, it } from "vitest";

import { groupInputs } from "@/features/solve/inputGroups";

const slots = (id: number) => groupInputs(PUZZLE_INFO[id]!.inputs);

describe("groupInputs", () => {
  it("makes one line of a run of inputs that are alike, so a puzzle with twelve edges is not twelve lines", () => {
    expect(slots(3)).toEqual([{ first: 0, last: 11, firstLabel: "edge 0", lastLabel: "edge 11", lo: 0, hi: 15 }]);
    expect(slots(2)).toEqual([{ first: 0, last: 7, firstLabel: "x0", lastLabel: "x7", lo: 0, hi: 255 }]);
    expect(slots(1)).toEqual([{ first: 0, last: 4, firstLabel: "x0", lastLabel: "x4", lo: 0, hi: 255 }]);
  });

  it("leaves a different input on a line of its own, after the run", () => {
    expect(slots(0)).toEqual([
      { first: 0, last: 6, firstLabel: "vote0", lastLabel: "vote6", lo: 0, hi: 1 },
      { first: 7, last: 7, firstLabel: "t", lastLabel: "t", lo: 1, hi: 7 },
    ]);
  });

  it("leaves a different input on a line of its own, before the run", () => {
    expect(slots(5)).toEqual([
      { first: 0, last: 0, firstLabel: "B", lastLabel: "B", lo: 1, hi: 4000 },
      { first: 1, last: 4, firstLabel: "r0", lastLabel: "r3", lo: 1, hi: 1000 },
    ]);
  });

  it("does not join inputs whose names or ranges alternate, because that would hide what each one is", () => {
    const groups = slots(4);
    expect(groups).toHaveLength(7);
    expect(groups.map((g) => g.firstLabel)).toEqual(["w0", "v0", "w1", "v1", "w2", "v2", "cap"]);
  });

  it("covers every input exactly once, in order, for every puzzle", () => {
    for (const puzzle of PUZZLE_INFO) {
      const covered = groupInputs(puzzle.inputs).flatMap((g) =>
        Array.from({ length: g.last - g.first + 1 }, (_, i) => g.first + i),
      );
      expect(covered).toEqual(puzzle.inputs.map((_, slot) => slot));
    }
  });

  it("does not join two, which is no shorter than saying each", () => {
    const two = [
      { label: "a0", lo: 0, hi: 9 },
      { label: "a1", lo: 0, hi: 9 },
    ];
    expect(groupInputs(two)).toHaveLength(2);
  });

  it("does not join names that differ, even when their numbers count on", () => {
    const groups = groupInputs([
      { label: "a0", lo: 0, hi: 9 },
      { label: "b1", lo: 0, hi: 9 },
      { label: "c2", lo: 0, hi: 9 },
    ]);
    expect(groups.map((g) => g.firstLabel)).toEqual(["a0", "b1", "c2"]);
  });

  it("does not join names that skip a number, or ranges that differ", () => {
    expect(
      groupInputs([
        { label: "a0", lo: 0, hi: 9 },
        { label: "a2", lo: 0, hi: 9 },
        { label: "a3", lo: 0, hi: 9 },
      ]),
    ).toHaveLength(3);
    expect(
      groupInputs([
        { label: "a0", lo: 0, hi: 9 },
        { label: "a1", lo: 0, hi: 9 },
        { label: "a2", lo: 0, hi: 8 },
      ]),
    ).toHaveLength(3);
  });
});
