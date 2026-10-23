import { readFileSync } from "node:fs";
import { fixedTrials, inputCount, inputs, outputCount, PUZZLE_COUNT, PUZZLE_NAMES, reference } from "@proofkin/vm";
import { describe, expect, it } from "vitest";
import { GRID_EDGES, gridDiagramSvg, PUZZLE_HUES, PUZZLE_INFO } from "../src/puzzleInfo.ts";

const GRID_PATH = 3;

describe("puzzle descriptions match the VM's puzzles", () => {
  it("has one entry per puzzle, in id order, with the VM's name", () => {
    expect(PUZZLE_INFO).toHaveLength(PUZZLE_COUNT);
    PUZZLE_INFO.forEach((p, id) => {
      expect(p.id).toBe(id);
      expect(p.name).toBe(PUZZLE_NAMES[id]);
    });
  });

  it("labels every input and output slot", () => {
    for (const p of PUZZLE_INFO) {
      expect(p.inputs, p.name).toHaveLength(inputCount(p.id));
      expect(p.outputs, p.name).toHaveLength(outputCount(p.id));
    }
  });

  it("states input ranges that the generated inputs stay inside, and reach when the range is small", () => {
    for (const p of PUZZLE_INFO) {
      const lo = p.inputs.map(() => Infinity);
      const hi = p.inputs.map(() => -Infinity);
      for (let s = 0; s < 300; s++) {
        const seed = `0x${s.toString(16).padStart(64, "0")}` as const;
        for (let trial = 2; trial < 12; trial++) {
          inputs(p.id, seed, trial).forEach((x, i) => {
            lo[i] = Math.min(lo[i]!, x);
            hi[i] = Math.max(hi[i]!, x);
          });
        }
      }
      p.inputs.forEach((slot, i) => {
        expect(lo[i], `${p.name} ${slot.label} min`).toBeGreaterThanOrEqual(slot.lo);
        expect(hi[i], `${p.name} ${slot.label} max`).toBeLessThanOrEqual(slot.hi);
        if (slot.hi - slot.lo <= 20) {
          expect([lo[i], hi[i]], `${p.name} ${slot.label} reaches both ends`).toEqual([slot.lo, slot.hi]);
        }
      });
    }
  });

  it("describes what a solution has to do, and every fixed edge case", () => {
    for (const p of PUZZLE_INFO) {
      expect(p.summary.length, p.name).toBeGreaterThan(20);
      expect(p.rule.length, p.name).toBeGreaterThan(10);
      // one line per fixed trial, in trial order: 0, 1, then 10 and up
      expect(p.edgeCases, p.name).toHaveLength(fixedTrials(p.id).length);
      for (const text of p.edgeCases) expect(text.length, p.name).toBeGreaterThan(5);
    }
  });

  it("GRID_PATH: each further case names the path that is cheapest in it", () => {
    const paths = ["RRDD", "RDRD", "RDDR", "DRRD", "DRDR", "DDRR"];
    const edgesOf = (moves: string) => {
      let row = 0;
      let col = 0;
      return [...moves].map((m) => (m === "R" ? 2 * row + col++ : 6 + 3 * row++ + col));
    };
    paths.forEach((moves, k) => {
      const x = inputs(GRID_PATH, "0x01", 10 + k);
      const costs = paths.map((p) => edgesOf(p).reduce((sum, e) => sum + x[e]!, 0));
      const cheapest = paths[costs.indexOf(Math.min(...costs))]!;
      const words = [...cheapest].map((m) => (m === "R" ? "right" : "down")).join(", ");
      expect(PUZZLE_INFO[GRID_PATH]!.edgeCases[2 + k], moves).toContain(words);
    });
  });

  it("KNAPSACK3: each further case names the item or pair that is best in it", () => {
    const wanted = ["item 0", "item 1", "item 2", "items 0 and 1", "items 0 and 2", "items 1 and 2"];
    wanted.forEach((words, k) => {
      const x = inputs(4, "0x01", 10 + k);
      let best = -1;
      let bestMask = 0;
      for (let mask = 1; mask < 8; mask++) {
        let weight = 0;
        let value = 0;
        for (let i = 0; i < 3; i++) {
          if (mask & (1 << i)) {
            weight += x[2 * i]!;
            value += x[2 * i + 1]!;
          }
        }
        if (weight <= x[6]! && value > best) [best, bestMask] = [value, mask];
      }
      const named = [0, 1, 2].filter((i) => bestMask & (1 << i));
      expect(words, `trial ${10 + k}`).toBe(named.length === 1 ? `item ${named[0]}` : `items ${named.join(" and ")}`);
      expect(PUZZLE_INFO[4]!.edgeCases[2 + k], words).toContain(words);
    });
  });
});

describe("GRID_PATH edge order (PLAN.md §4)", () => {
  it("numbers the 12 edges: 0..5 horizontal row by row, 6..11 vertical row by row", () => {
    expect(GRID_EDGES).toHaveLength(12);
    GRID_EDGES.forEach((e, i) => {
      expect(e.index).toBe(i);
      if (i < 6) {
        const r = Math.floor(i / 2);
        const c = i % 2;
        expect([e.from, e.to], `edge ${i}`).toEqual([[r, c], [r, c + 1]]);
      } else {
        const j = i - 6;
        const r = Math.floor(j / 3);
        const c = j % 3;
        expect([e.from, e.to], `edge ${i}`).toEqual([[r, c], [r + 1, c]]);
      }
    });
  });

  /** The numbering agrees with the reference solver, not just with the spec's wording. */
  it("makes every right/down path cost exactly its length when its edges (as numbered) are cheap", () => {
    const edgeBetween = (a: [number, number], b: [number, number]) =>
      GRID_EDGES.find((e) => e.from[0] === a[0] && e.from[1] === a[1] && e.to[0] === b[0] && e.to[1] === b[1])!.index;

    // all 6 ways to interleave two rights (R) and two downs (D)
    const paths = ["RRDD", "RDRD", "RDDR", "DRRD", "DRDR", "DDRR"];
    for (const path of paths) {
      let at: [number, number] = [0, 0];
      const weights = Array<number>(12).fill(15);
      for (const move of path) {
        const next: [number, number] = move === "R" ? [at[0], at[1] + 1] : [at[0] + 1, at[1]];
        weights[edgeBetween(at, next)] = 1;
        at = next;
      }
      expect(reference(GRID_PATH, weights), path).toEqual([4]);
    }
  });

  it("draws a labelled diagram with every edge number once", () => {
    const svg = gridDiagramSvg();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    for (let i = 0; i < 12; i++) {
      const labels = svg.match(new RegExp(`>${i}</text>`, "g")) ?? [];
      expect(labels, `label ${i}`).toHaveLength(1);
    }
    expect(svg).not.toContain("<script");
  });
});

describe("the page's tint for each puzzle", () => {
  it("is the hue Renderer.sol paints that puzzle with, so the interface and the creature share a palette", () => {
    const source = readFileSync(new URL("../../../contracts/src/Renderer.sol", import.meta.url), "utf8");
    const palette = /function _palette[\s\S]*?\n    }\n/.exec(source)![0];
    const baseHues = [...palette.matchAll(/return \((\d+), \d+, \d+, \d+\);/g)].map((m) => Number(m[1]));
    expect(baseHues).toHaveLength(PUZZLE_COUNT);
    expect([...PUZZLE_HUES]).toEqual(baseHues);
  });
});
