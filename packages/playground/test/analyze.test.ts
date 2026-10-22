import { readFileSync } from "node:fs";
import { PUZZLE_NAMES } from "@proofkin/vm";
import { describe, expect, it } from "vitest";
import { analyze, skeletonFor } from "../src/analyze.ts";
import { runLocalTest } from "../src/localTest.ts";

const solution = (name: string) =>
  readFileSync(new URL(`../../../fixtures/solutions/${name}.pk`, import.meta.url), "utf8");

describe("analyze: a well-formed program", () => {
  // node counts and depths of the six fixture circuits (depths worked out by hand, see docs/M3-notes.md)
  const expected: [string, number, number][] = [
    ["QUORUM7", 17, 8],
    ["MEDIAN5", 15, 5],
    ["SORT8", 46, 6],
    ["GRID_PATH", 26, 6],
    ["KNAPSACK3", 36, 8],
    ["FAIR_SPLIT4", 21, 5],
  ];

  it.each(expected)("%s: %i nodes, depth %i", (name, nodes, depth) => {
    const a = analyze(solution(name));
    if (!a.ok) throw new Error(a.message);
    expect(a.puzzleId).toBe(PUZZLE_NAMES.indexOf(name));
    expect(a.nodeCount).toBe(nodes);
    expect(a.depth).toBe(depth);
    expect(a.hex).toBe(`0x${Buffer.from(a.program).toString("hex")}`);
  });
});

describe("analyze: mistakes", () => {
  const head = "puzzle QUORUM7\n";

  it("reports assembler errors with their line", () => {
    const a = analyze(`${head}x = FOO 1\nout x`);
    expect(a).toMatchObject({ ok: false, stage: "assemble", line: 2 });
    expect(a.ok === false && a.message).toMatch(/unknown op/i);
  });

  it("reports a missing puzzle line", () => {
    expect(analyze("x = IN 0\nout x")).toMatchObject({ ok: false, stage: "assemble", line: 1 });
  });

  it("names the player's own node when it is never used", () => {
    const a = analyze(`${head}used = IN 0\nspare = IN 1\nout used`);
    expect(a).toMatchObject({ ok: false, stage: "validate" });
    expect(a.ok === false && a.message).toContain("spare");
    expect(a.ok === false && a.message).toMatch(/never used|feeds no output/i);
  });

  it("explains a wrong number of output slots in terms of the puzzle", () => {
    const a = analyze(`${head}x = IN 0\nout x x`);
    expect(a).toMatchObject({ ok: false, stage: "validate" });
    expect(a.ok === false && a.message).toMatch(/QUORUM7.*1 output/i);
  });

  it("explains an input index the puzzle does not have", () => {
    const a = analyze(`${head}x = IN 9\nout x`);
    expect(a.ok === false && a.message).toMatch(/x.*input 9.*0 to 7/i);
  });

  it("explains too many nodes", () => {
    const lines = Array.from({ length: 65 }, (_, i) => (i === 0 ? "n0 = IN 0" : `n${i} = ADD n${i - 1} n0`));
    const a = analyze(`${head}${lines.join("\n")}\nout n64`);
    expect(a.ok === false && a.message).toMatch(/65.*64|at most 64/i);
  });

  it("explains an unreadable output slot", () => {
    // `out` names a node, so the assembler already resolves it: this is an unknown name
    expect(analyze(`${head}x = IN 0\nout nope`)).toMatchObject({ ok: false, stage: "assemble", line: 3 });
  });

  it("is quiet about an empty editor", () => {
    expect(analyze("")).toMatchObject({ ok: false, stage: "assemble" });
  });
});

describe("skeletonFor", () => {
  const SEED = "0x00000000000000000000000000000000000000000000000000000000000000aa" as const;

  it.each(PUZZLE_NAMES.map((name, id) => [id, name] as const))(
    "%i %s starts the player on a working loop: a valid program that is plainly wrong",
    (id, name) => {
      const text = skeletonFor(id);
      expect(text.split("\n")[0]).toBe(`puzzle ${name}`);

      // it assembles and validates, so the preview and the local test work from the first keystroke...
      const a = analyze(text);
      if (!a.ok) throw new Error(a.message);
      expect(a.puzzleId).toBe(id);
      expect(a.nodeCount).toBe(1);

      // ...and it does not solve the puzzle
      expect(runLocalTest(a.program, { seed: SEED }).status).toBe("fail");
    },
  );

  it("lists the puzzle's input slots in a comment, with the names it declares", () => {
    const text = skeletonFor(0);
    expect(text).toMatch(/# Inputs:.*0 vote0.*6 vote6.*7 t/);
    expect(text).toContain("vote0 = IN 0");
  });

  it("gives every output slot the puzzle needs", () => {
    expect(skeletonFor(2).split("\n").find((l) => l.startsWith("out "))!.split(" ")).toHaveLength(1 + 8);
    expect(skeletonFor(5).split("\n").find((l) => l.startsWith("out "))!.split(" ")).toHaveLength(1 + 4);
  });
});
