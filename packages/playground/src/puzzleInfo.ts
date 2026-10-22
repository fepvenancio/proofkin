// What the playground tells a player about each puzzle (PLAN.md §4). The ranges and slot counts are
// checked against the VM's own generator in test/puzzleInfo.test.ts.

export interface InputSlot {
  label: string;
  /** Inclusive range the contract draws random inputs from. */
  lo: number;
  hi: number;
}

export interface PuzzleInfo {
  id: number;
  name: string;
  summary: string;
  inputs: InputSlot[];
  outputs: string[];
  /** The reference answer, in words. */
  rule: string;
  /** What trials 0 and 1 feed every program, whatever the seed. */
  edgeCases: [string, string];
}

const slots = (prefix: string, n: number, lo: number, hi: number): InputSlot[] =>
  Array.from({ length: n }, (_, i) => ({ label: `${prefix}${i}`, lo, hi }));

export const PUZZLE_INFO: readonly PuzzleInfo[] = [
  {
    id: 0,
    name: "QUORUM7",
    summary: "Seven yes/no votes and a threshold: has the quorum been reached?",
    inputs: [...slots("vote", 7, 0, 1), { label: "t", lo: 1, hi: 7 }],
    outputs: ["quorum reached (1) or not (0)"],
    rule: "1 if the votes add up to at least t, otherwise 0.",
    edgeCases: ["all seven votes 0, with t = 7", "all seven votes 1, with t = 1"],
  },
  {
    id: 1,
    name: "MEDIAN5",
    summary: "Five numbers in: the middle one out.",
    inputs: slots("x", 5, 0, 255),
    outputs: ["the median"],
    rule: "The third smallest of the five values.",
    edgeCases: ["all five values equal (128)", "strictly descending: 200, 150, 100, 50, 0"],
  },
  {
    id: 2,
    name: "SORT8",
    summary: "Eight numbers in: the same eight, smallest first.",
    inputs: slots("x", 8, 0, 255),
    outputs: Array.from({ length: 8 }, (_, i) => `${i === 0 ? "smallest" : i === 7 ? "largest" : `#${i + 1} smallest`}`),
    rule: "The eight values in ascending order, one per output slot.",
    edgeCases: ["all eight values equal (128)", "strictly descending: 224, 192, … 32, 0"],
  },
  {
    id: 3,
    name: "GRID_PATH",
    summary: "A 3×3 grid of nodes with a cost on each of its 12 edges: the cheapest way across, moving only right or down.",
    inputs: Array.from({ length: 12 }, (_, i) => ({ label: `edge ${i}`, lo: 0, hi: 15 })),
    outputs: ["cost of the cheapest path from top-left to bottom-right"],
    rule: "The minimum, over all right/down paths from the top-left node to the bottom-right node, of the sum of the edge costs on the path.",
    edgeCases: ["every edge costs 0", "every edge costs 15"],
  },
  {
    id: 4,
    name: "KNAPSACK3",
    summary: "Three items, each with a weight and a value, and a bag that only holds so much: the most value you can carry.",
    inputs: [
      { label: "w0", lo: 1, hi: 20 },
      { label: "v0", lo: 0, hi: 50 },
      { label: "w1", lo: 1, hi: 20 },
      { label: "v1", lo: 0, hi: 50 },
      { label: "w2", lo: 1, hi: 20 },
      { label: "v2", lo: 0, hi: 50 },
      { label: "cap", lo: 1, hi: 40 },
    ],
    outputs: ["best total value"],
    rule: "The largest total value over all subsets of the three items whose total weight is at most cap (the empty subset is worth 0).",
    edgeCases: ["every weight above the capacity", "every weight 1, capacity 40"],
  },
  {
    id: 5,
    name: "FAIR_SPLIT4",
    summary: "A budget and four requests: if everyone cannot be paid in full, scale every request down by the same factor, rounding down.",
    inputs: [{ label: "B", lo: 1, hi: 4000 }, ...slots("r", 4, 1, 1000)],
    outputs: ["grant 0", "grant 1", "grant 2", "grant 3"],
    rule: "If the four requests add up to at most B, each gets its request. Otherwise request r gets floor(r × B ÷ total).",
    edgeCases: ["the requests add up to exactly B", "every request is 1000 and they exceed B"],
  },
];

/**
 * The base hue (degrees) Renderer.sol paints each puzzle with. The page tints itself with it, so the
 * interface and the creature share a palette; test/puzzleInfo.test.ts checks it against the contract source.
 */
export const PUZZLE_HUES: readonly number[] = [190, 28, 265, 135, 340, 48];

// -------------------------------------------------------------------- GRID_PATH

export interface GridEdge {
  /** The input slot this edge is read from. */
  index: number;
  from: [row: number, col: number];
  to: [row: number, col: number];
}

/**
 * Inputs 0..5 are the horizontal edges, row by row ((r,0)→(r,1) then (r,1)→(r,2) for r = 0,1,2).
 * Inputs 6..11 are the vertical edges, row by row ((0,c)→(1,c) for c = 0,1,2, then (1,c)→(2,c)).
 */
export const GRID_EDGES: readonly GridEdge[] = Array.from({ length: 12 }, (_, index): GridEdge => {
  if (index < 6) {
    const row = Math.floor(index / 2);
    const col = index % 2;
    return { index, from: [row, col], to: [row, col + 1] };
  }
  const row = Math.floor((index - 6) / 3);
  const col = (index - 6) % 3;
  return { index, from: [row, col], to: [row + 1, col] };
});

/** The 3×3 grid with each edge's input number, as inline SVG that takes its colours from the page. */
export function gridDiagramSvg(): string {
  const size = 80;
  const margin = 36;
  const at = ([row, col]: [number, number]) => [margin + col * size, margin + row * size] as const;
  const extent = margin * 2 + 2 * size;

  const edges = GRID_EDGES.map((e) => {
    const [x1, y1] = at(e.from);
    const [x2, y2] = at(e.to);
    const horizontal = e.from[0] === e.to[0];
    // stop the arrow short of the node so the head is visible
    const [ex, ey] = horizontal ? [x2 - 9, y2] : [x2, y2 - 9];
    const [lx, ly] = horizontal ? [(x1 + x2) / 2, y1 - 8] : [x1 + 12, (y1 + y2) / 2 + 4];
    return (
      `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/>` +
      `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="13" fill="currentColor">${e.index}</text>`
    );
  }).join("");

  const nodes = [0, 1, 2]
    .flatMap((r) => [0, 1, 2].map((c) => at([r, c])))
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="currentColor"/>`)
    .join("");

  const [sx, sy] = at([0, 0]);
  const [fx, fy] = at([2, 2]);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" width="${extent}" height="${extent}" role="img" ` +
    `aria-label="GRID_PATH edge numbering">` +
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>` +
    edges +
    nodes +
    `<text x="${sx - 8}" y="${sy - 14}" font-size="11" fill="currentColor" opacity=".7">start</text>` +
    `<text x="${fx + 8}" y="${fy + 22}" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">end</text>` +
    `</svg>`
  );
}
