// @vitest-environment node
import { readFileSync } from "node:fs";

import { analyze, runLocalTest, skeletonFor } from "@proofkin/core";
import { describe, expect, it } from "vitest";

import { programNote, previewView, statusLine, testView } from "@/features/solve/views";

const sort8 = readFileSync(new URL("../../../../../fixtures/solutions/SORT8.pk", import.meta.url), "utf8");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

/* //////////////////////////////////////////////////////////////
                           STATUS LINE
//////////////////////////////////////////////////////////////*/

describe("statusLine", () => {
  it("says how big a valid program is", () => {
    const line = statusLine(analyze(sort8));
    expect(line).toEqual({ tone: "good", text: "46 nodes, depth 6. The program is valid." });
  });

  it("says 'node' for one node", () => {
    expect(statusLine(analyze(skeletonFor(2)))).toEqual({
      tone: "good",
      text: "1 node, depth 0. The program is valid.",
    });
  });

  it("points at the line the assembler stopped on", () => {
    const line = statusLine(analyze("puzzle SORT8\nvalue = BOGUS 1\n"));
    expect(line.tone).toBe("bad");
    expect(line.line).toBe(2);
    expect(line.text.length).toBeGreaterThan(5);
  });

  it("explains a program that assembles but is not valid, with no line to point at", () => {
    const line = statusLine(analyze("puzzle SORT8\na = IN 0\nb = IN 1\nout a a a a a a a a\n"));
    expect(line.tone).toBe("bad");
    expect(line.line).toBeUndefined();
    expect(line.text).toMatch(/"b" is never used/);
  });
});

/* //////////////////////////////////////////////////////////////
                           LOCAL TEST
//////////////////////////////////////////////////////////////*/

describe("testView", () => {
  it("is blocked until the program is valid", () => {
    expect(testView({ valid: false }, 2)).toEqual({ kind: "blocked", text: "Fix the program first." });
  });

  it("says what a run will try, before there is one", () => {
    expect(testView({ valid: true }, 2)).toEqual({
      kind: "notRun",
      text: "Runs your program on the 4 fixed edge cases and 100 random ones.", // SORT8 has four since milestone 3.5
    });
  });

  it("counts the cases a passing program was run on, and says it is a rehearsal", () => {
    const analysis = analyze(sort8);
    if (!analysis.ok) throw new Error("fixture does not assemble");
    const report = runLocalTest(analysis.program);
    const view = testView({ valid: true, report }, 2);
    expect(view.kind).toBe("pass");
    if (view.kind !== "pass") return;
    expect(view.headline).toMatch(/^Passed all \d+ cases\.$/);
    expect(view.note).toMatch(/rehearsal, not a guarantee/);
    expect(view.note).toContain(report.seed.slice(0, 10));
  });

  it("names the first case a wrong program fails, with its inputs, the right answer and its own", () => {
    const analysis = analyze(skeletonFor(2));
    if (!analysis.ok) throw new Error("starting point does not assemble");
    const report = runLocalTest(analysis.program);
    const view = testView({ valid: true, report }, 2);
    expect(view.kind).toBe("fail");
    if (view.kind !== "fail") return;
    // the starting point copies one input to every output, which is right when all eight are equal (the first edge
    // case), so the first case it fails is the second
    expect(view.headline).toMatch(/^Failed the second edge case/);
    expect(view.rows.map((row) => row.label)).toEqual(["Inputs", "Expected", "Got"]);
    expect(view.rows[0]!.value).toMatch(/^x0=\d+/); // SORT8 names its inputs x0 to x7
  });

  it("shows the answer wanted and the answer given as themselves, so the two can be compared", () => {
    const analysis = analyze(skeletonFor(2));
    if (!analysis.ok) throw new Error("starting point does not assemble");
    const report = runLocalTest(analysis.program);
    if (report.status !== "fail" || !report.failure.got)
      throw new Error("the starting point should fail with an answer");
    const view = testView({ valid: true, report }, 2);
    if (view.kind !== "fail") throw new Error("expected a failure");
    expect(view.rows[1]).toEqual({ label: "Expected", value: report.failure.expected.join(", ") });
    expect(view.rows[2]).toEqual({ label: "Got", value: report.failure.got.join(", ") });
    expect(view.rows[2]!.value).not.toBe(view.rows[1]!.value);
  });

  it("says an arithmetic failure is one, where the program gave no answer at all", () => {
    // divides by zero on the first case it is given
    const analysis = analyze("puzzle SORT8\na = IN 0\nz = CONST 0\nd = DIV a z\nout d d d d d d d d\n");
    if (!analysis.ok) throw new Error("program does not assemble");
    const report = runLocalTest(analysis.program);
    const view = testView({ valid: true, report }, 2);
    expect(view.kind).toBe("fail");
    if (view.kind !== "fail") return;
    expect(view.rows[2]!.value).toMatch(/^an arithmetic failure/);
  });
});

/* //////////////////////////////////////////////////////////////
                              PREVIEW
//////////////////////////////////////////////////////////////*/

describe("previewView", () => {
  const valid = analyze(sort8);
  const invalid = analyze("nonsense");

  it("asks for a valid program before it draws anything, whatever the query says", () => {
    expect(previewView(invalid, { data: SVG, isFetching: true })).toEqual({
      kind: "invalid",
      text: "Fix the program and it will be drawn here.",
    });
  });

  it("says it is drawing before the first picture arrives", () => {
    expect(previewView(valid, { isFetching: true })).toEqual({ kind: "drawing", text: "Drawing…" });
    expect(previewView(valid, {})).toEqual({ kind: "drawing", text: "Drawing…" });
  });

  it("shows the picture when it has one", () => {
    const view = previewView(valid, { data: SVG, isFetching: false });
    expect(view.kind).toBe("drawn");
    if (view.kind === "drawn") {
      expect(view.src).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(view.dimmed).toBe(false);
    }
  });

  it("keeps the last picture, dimmed, while the next is drawn, so the plate does not blink out", () => {
    const view = previewView(valid, { data: SVG, isFetching: true });
    expect(view.kind).toBe("drawn");
    if (view.kind === "drawn") expect(view.dimmed).toBe(true);
  });

  it("says why when there is no picture to keep", () => {
    expect(previewView(valid, { error: "The node refused.", isFetching: false })).toEqual({
      kind: "error",
      text: "The node refused.",
    });
  });

  it("prefers a picture it has to an error about drawing the next one", () => {
    const view = previewView(valid, { data: SVG, error: "The node refused.", isFetching: false });
    expect(view.kind).toBe("drawn");
  });
});

/* //////////////////////////////////////////////////////////////
                     WHAT THE CHAIN SAYS ABOUT IT
//////////////////////////////////////////////////////////////*/

describe("programNote", () => {
  it("says an exact program that was minted already cannot be minted again", () => {
    expect(programNote("alreadyMinted")).toMatch(/already been minted/);
  });

  it("says when a puzzle has no slots left", () => {
    expect(programNote("puzzleFull")).toBe("All 50 slots of this puzzle are taken.");
  });

  it("has nothing to say when the way is clear, or not yet known", () => {
    expect(programNote("free")).toBeUndefined();
    expect(programNote("unknown")).toBeUndefined();
  });
});
