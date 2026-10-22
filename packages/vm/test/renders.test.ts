// Checks the SVG snapshots written by `Renderer.render` (contracts/test/RendererSnapshots.t.sol)
// against a floating-point recomputation of PLAN.md §6.1 from the TypeScript VM. Nothing here shares
// code with Renderer.sol, so an error in its integer layout, sine table or glyph geometry shows up.
import { readFileSync } from "node:fs";
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import { hexToBytes } from "viem";
import { describe, expect, it } from "vitest";
import { inputs, PUZZLE_NAMES } from "../src/puzzles.ts";
import { Op, run, validate } from "../src/vm.ts";

const fixtures = new URL("../../../fixtures/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, fixtures), "utf8");

// One seed, defined once, in the Solidity snapshot test.
const SEED = /SEED = (0x[0-9a-f]{64});/.exec(
  readFileSync(new URL("../../../contracts/test/RendererSnapshots.t.sol", import.meta.url), "utf8"),
)![1] as `0x${string}`;
const SEED_BYTES = hexToBytes(SEED);

const FAMILY_CLASS = ["i", "c", "a", "m", "l", "s"] as const; // dot, square, circle, diamond, ring, triangle

function familyOf(op: number): number {
  if (op === Op.IN) return 0;
  if (op === Op.CONST) return 1;
  if (op <= Op.DIV) return 2;
  if (op <= Op.EQ) return 3;
  if (op <= Op.OR) return 4;
  return 5;
}

function operandsOf(p: Uint8Array, i: number): number[] {
  const at = 4 + 4 * i;
  const op = p[at]!;
  if (op === Op.IN || op === Op.CONST) return [];
  const ops = op === Op.SEL ? [p[at + 1]!, p[at + 2]!, p[at + 3]!] : [p[at + 1]!, p[at + 2]!];
  return ops.filter((x, k) => ops.indexOf(x) === k); // a node's repeated operand is drawn once
}

function depthsOf(p: Uint8Array): number[] {
  const d: number[] = [];
  for (let i = 0; i < p[2]!; i++) {
    const ops = operandsOf(p, i);
    d.push(ops.length === 0 ? 0 : 1 + Math.max(...ops.map((x) => d[x]!)));
  }
  return d;
}

const glyphSize = (value: number) => Math.min(16, 4 + (value + 1).toString(2).length - 1);

interface Glyph {
  cls: string;
  x: number;
  y: number;
  /** The size parameter the glyph was drawn with, as recovered from its geometry. */
  size: number;
}

function parseSvg(svg: string): XmlElement {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (level, msg) => errors.push(`${level}: ${msg}`) }).parseFromString(
    svg,
    "image/svg+xml",
  );
  expect(errors, "XML well-formedness").toEqual([]);
  return doc.documentElement!;
}

const children = (el: XmlElement): XmlElement[] =>
  Array.from(el.childNodes).filter((n): n is XmlElement => n.nodeType === 1);

function group(root: XmlElement, id: string): XmlElement {
  const g = children(root).find((c) => c.tagName === "g" && c.getAttribute("id") === id);
  if (!g) throw new Error(`no <g id="${id}">`);
  return g;
}

const num = (el: XmlElement, attr: string) => Number(el.getAttribute(attr));

function glyphOf(el: XmlElement): Glyph {
  const cls = el.getAttribute("class")!;
  if (el.tagName === "circle") return { cls, x: num(el, "cx"), y: num(el, "cy"), size: num(el, "r") };
  if (el.tagName === "rect") {
    const w = num(el, "width");
    expect(num(el, "height"), "squares are square").toBe(w);
    return { cls, x: num(el, "x") + w / 2, y: num(el, "y") + w / 2, size: w / 2 };
  }
  const d = el.getAttribute("d")!;
  if (cls === "m") {
    const m = /^M(\d+) (\d+)l(\d+) (\d+)-(\d+) (\d+)-(\d+)-(\d+)z$/.exec(d);
    if (!m) throw new Error(`unexpected diamond path ${d}`);
    const [x, y, ...rest] = m.slice(1).map(Number) as [number, number, ...number[]];
    expect(new Set(rest).size, "all diamond offsets equal").toBe(1);
    return { cls, x, y: y + rest[0]!, size: rest[0]! };
  }
  const m = /^M(\d+) (\d+)l(\d+) (\d+)h-(\d+)z$/.exec(d);
  if (!m) throw new Error(`unexpected triangle path ${d}`);
  const [x, y, s, twoS, base] = m.slice(1).map(Number) as [number, number, number, number, number];
  expect([twoS, base], "triangle base and height are 2s").toEqual([2 * s, 2 * s]);
  return { cls, x, y: y + s, size: s };
}

/** Expected glyph geometry parameter for a family at a given size s (see Renderer._glyph). */
function expectedParam(family: number, s: number): number {
  if (family === 0) return (s + 1) >> 1; // dot radius
  if (family === 1) return Math.floor((3 * s) / 4); // square half-side
  return s; // circle radius, ring radius, diamond/triangle half-height
}

describe.each(PUZZLE_NAMES)("snapshot %s", (name) => {
  const svg = read(`renders/${name}.svg`);
  const program = hexToBytes(JSON.parse(read("solutions.json"))[name] as `0x${string}`);
  const puzzleId = program[1]!;
  const n = program[2]!;
  const depth = depthsOf(program);
  const layers = Math.max(...depth) + 1;
  const values = run(program, inputs(puzzleId, SEED, 2)).values;
  const root = parseSvg(svg);

  it("is a valid program and a well-formed, small, inert 600x600 SVG", () => {
    expect(validate(program)).toEqual({ ok: true });
    expect(Buffer.byteLength(svg)).toBeLessThan(40_000);
    expect(root.tagName).toBe("svg");
    expect(root.getAttribute("viewBox")).toBe("0 0 600 600");

    const stack = [root];
    while (stack.length > 0) {
      const el = stack.pop()!;
      expect(["script", "foreignObject", "image", "use", "a"], el.tagName).not.toContain(el.tagName);
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.startsWith("on") || attr.name.includes("href"), `${el.tagName}@${attr.name}`).toBe(false);
      }
      stack.push(...children(el));
    }
  });

  it("draws one orbit ring per layer, radius 40 + d * (240 / layers), turning with period 20 + 7d s", () => {
    const rings = children(group(root, "rings"));
    expect(rings).toHaveLength(layers);
    rings.forEach((ring, d) => {
      expect(ring.getAttribute("class")).toBe("o");
      expect(num(ring, "r")).toBe(40 + d * Math.floor(240 / layers));
      const [anim] = children(ring);
      expect(anim!.tagName).toBe("animateTransform");
      expect(anim!.getAttribute("type")).toBe("rotate");
      expect(anim!.getAttribute("repeatCount")).toBe("indefinite");
      expect(anim!.getAttribute("dur")).toBe(`${20 + 7 * d}s`);
      expect([anim!.getAttribute("from"), anim!.getAttribute("to")]).toEqual(
        d % 2 === 0 ? ["0", "360"] : ["360", "0"],
      );
    });
  });

  const glyphs = children(group(root, "nodes")).map(glyphOf);

  it("places one glyph per node on its layer's ring, spread evenly from the seed's offset", () => {
    expect(glyphs).toHaveLength(n);
    for (let i = 0; i < n; i++) {
      const d = depth[i]!;
      const sameLayer = depth.flatMap((dd, j) => (dd === d ? [j] : []));
      const k = sameLayer.indexOf(i);
      const turns = (SEED_BYTES[d % 32]! / 256 + k / sameLayer.length) % 1;
      const r = 40 + d * Math.floor(240 / layers);
      const wantX = 300 + r * Math.cos(2 * Math.PI * turns);
      const wantY = 300 + r * Math.sin(2 * Math.PI * turns);
      expect(Math.abs(glyphs[i]!.x - wantX), `node ${i} x: ${glyphs[i]!.x} vs ${wantX.toFixed(2)}`).toBeLessThan(1.5);
      expect(Math.abs(glyphs[i]!.y - wantY), `node ${i} y: ${glyphs[i]!.y} vs ${wantY.toFixed(2)}`).toBeLessThan(1.5);
    }
  });

  it("shapes each glyph by op family and sizes it by 4 + log2(value + 1), capped at 16", () => {
    for (let i = 0; i < n; i++) {
      const family = familyOf(program[4 + 4 * i]!);
      expect(glyphs[i]!.cls, `node ${i} class`).toBe(FAMILY_CLASS[family]);
      expect(glyphs[i]!.size, `node ${i} size (value ${values[i]})`).toBe(expectedParam(family, glyphSize(values[i]!)));
    }
  });

  it("draws every distinct operand edge, operand to node, between the glyphs' drawn positions", () => {
    const paths = children(group(root, "edges"));
    const wanted = Array.from({ length: n }, (_, i) => operandsOf(program, i).map((from) => [from, i] as const)).flat();
    expect(paths).toHaveLength(wanted.length);

    paths.forEach((path, e) => {
      const [from, to] = wanted[e]!;
      const m = /^M(\d+) (\d+)Q(\d+) (\d+) (\d+) (\d+)$/.exec(path.getAttribute("d")!);
      if (!m) throw new Error(`unexpected edge path ${path.getAttribute("d")}`);
      const [x1, y1, cx, cy, x2, y2] = m.slice(1).map(Number) as [number, number, number, number, number, number];
      expect([x1, y1], `edge ${from}->${to} start`).toEqual([glyphs[from]!.x, glyphs[from]!.y]);
      expect([x2, y2], `edge ${from}->${to} end`).toEqual([glyphs[to]!.x, glyphs[to]!.y]);
      // control point: chord midpoint pulled 30% towards the centre
      expect(Math.abs(cx - (0.7 * (x1 + x2) / 2 + 0.3 * 300)), "control x").toBeLessThanOrEqual(0.51);
      expect(Math.abs(cy - (0.7 * (y1 + y2) / 2 + 0.3 * 300)), "control y").toBeLessThanOrEqual(0.51);
    });
  });

  it("puts one pulsing halo on each distinct output node", () => {
    const outputs = [...new Set(Array.from(program.subarray(4 + 4 * n)))].sort((a, b) => a - b);
    const halos = children(group(root, "halos"));
    expect(halos).toHaveLength(outputs.length);
    halos.forEach((halo, h) => {
      const i = outputs[h]!;
      const r = glyphSize(values[i]!) + 4;
      expect(halo.getAttribute("class")).toBe("h");
      expect([num(halo, "cx"), num(halo, "cy"), num(halo, "r")]).toEqual([glyphs[i]!.x, glyphs[i]!.y, r]);
      const [anim] = children(halo);
      expect(anim!.getAttribute("attributeName")).toBe("r");
      expect(anim!.getAttribute("values")).toBe(`${r};${r + 4};${r}`);
    });
  });

  it("styles every class it uses", () => {
    const css = root.getElementsByTagName("style").item(0)!.textContent!;
    const used = new Set<string>();
    const stack = [root];
    while (stack.length > 0) {
      const el = stack.pop()!;
      if (el.getAttribute("class")) used.add(el.getAttribute("class")!);
      stack.push(...children(el));
    }
    for (const cls of used) expect(css, `class ${cls}`).toContain(`.${cls}{`);
  });
});
