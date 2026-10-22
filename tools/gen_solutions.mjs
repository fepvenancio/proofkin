// Writes fixtures/solutions/*.pk, the hand-checked solution for each puzzle (PLAN.md §4.2).
//
//   node tools/gen_solutions.mjs
//
// The .pk files are the source of truth; this script is how they were produced, so that the 38 MIN/MAX
// lines of the sorting network are not typed by hand. It refuses to write a SORT8 network that does
// not sort every 0/1 input (the 0-1 principle), and `pnpm gen:fixtures` then assembles the .pk files
// into fixtures/solutions.json.
import { mkdirSync, writeFileSync } from "node:fs";

const out = new URL("../fixtures/solutions/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const save = (name, lines) => writeFileSync(`${out}${name}.pk`, lines.join("\n") + "\n");

// ---- SORT8: Batcher odd-even merge sort, 19 comparators ----
const layers = [
  [[0, 1], [2, 3], [4, 5], [6, 7]],
  [[0, 2], [1, 3], [4, 6], [5, 7]],
  [[1, 2], [5, 6]],
  [[0, 4], [1, 5], [2, 6], [3, 7]],
  [[2, 4], [3, 5]],
  [[1, 2], [3, 4], [5, 6]],
];
const comps = layers.flat();
if (comps.length !== 19) throw new Error("expected 19 comparators");
// 0-1 principle: a network sorts every input iff it sorts every 0/1 input.
for (let m = 0; m < 256; m++) {
  const w = Array.from({ length: 8 }, (_, i) => (m >> i) & 1);
  for (const [i, j] of comps) if (w[i] > w[j]) [w[i], w[j]] = [w[j], w[i]];
  for (let i = 1; i < 8; i++) if (w[i - 1] > w[i]) throw new Error(`network fails on ${m}`);
}
{
  const L = [
    "# SORT8: Batcher odd-even merge sort, 19 compare-exchange steps.",
    "# Each step turns two wires into (min, max): 8 IN + 19*2 = 46 nodes.",
    "puzzle SORT8",
  ];
  for (let i = 0; i < 8; i++) L.push(`x${i} = IN ${i}`);
  const wire = Array.from({ length: 8 }, (_, i) => `x${i}`);
  comps.forEach(([i, j], k) => {
    L.push(`lo${k + 1} = MIN ${wire[i]} ${wire[j]}`, `hi${k + 1} = MAX ${wire[i]} ${wire[j]}`);
    wire[i] = `lo${k + 1}`;
    wire[j] = `hi${k + 1}`;
  });
  L.push(`out ${wire.join(" ")}`);
  save("SORT8", L);
}

// ---- MEDIAN5 ----
save("MEDIAN5", [
  "# MEDIAN5: order two pairs, drop the smaller low and the larger high (neither can be the",
  "# median), then take the median of the three survivors a, b, x4.",
  "puzzle MEDIAN5",
  ...[0, 1, 2, 3, 4].map((i) => `x${i} = IN ${i}`),
  "lo1 = MIN x0 x1",
  "hi1 = MAX x0 x1",
  "lo2 = MIN x2 x3",
  "hi2 = MAX x2 x3",
  "a = MAX lo1 lo2",
  "b = MIN hi1 hi2",
  "lo = MIN a b",
  "hi = MAX a b",
  "t = MIN hi x4",
  "m = MAX lo t",
  "out m",
]);

// ---- QUORUM7 ----
save("QUORUM7", [
  "# QUORUM7: sum the seven votes, then answer NOT(sum < t).",
  "puzzle QUORUM7",
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => `v${i} = IN ${i}`),
  "t = IN 7",
  "s1 = ADD v0 v1",
  ...[2, 3, 4, 5, 6].map((i) => `s${i} = ADD s${i - 1} v${i}`),
  "lt = LT s6 t",
  "zero = CONST 0",
  "ok = EQ lt zero",
  "out ok",
]);

// ---- GRID_PATH ----
save("GRID_PATH", [
  "# GRID_PATH: dynamic programming over the 3x3 grid. dRC = cheapest cost from the top-left node",
  "# to node (R,C); each node takes the cheaper of arriving from the left or from above.",
  "# Inputs 0..5 are the horizontal edges row by row, inputs 6..11 the vertical edges row by row.",
  "puzzle GRID_PATH",
  "h00 = IN 0   # (0,0)->(0,1)",
  "h01 = IN 1   # (0,1)->(0,2)",
  "h10 = IN 2   # (1,0)->(1,1)",
  "h11 = IN 3   # (1,1)->(1,2)",
  "h20 = IN 4   # (2,0)->(2,1)",
  "h21 = IN 5   # (2,1)->(2,2)",
  "v00 = IN 6   # (0,0)->(1,0)",
  "v01 = IN 7   # (0,1)->(1,1)",
  "v02 = IN 8   # (0,2)->(1,2)",
  "v10 = IN 9   # (1,0)->(2,0)",
  "v11 = IN 10  # (1,1)->(2,1)",
  "v12 = IN 11  # (1,2)->(2,2)",
  "# d01 = h00 and d10 = v00 need no node of their own",
  "d02 = ADD h00 h01",
  "d20 = ADD v00 v10",
  "d11a = ADD h00 v01   # via (0,1)",
  "d11b = ADD v00 h10   # via (1,0)",
  "d11 = MIN d11a d11b",
  "d12a = ADD d02 v02",
  "d12b = ADD d11 h11",
  "d12 = MIN d12a d12b",
  "d21a = ADD d20 h20",
  "d21b = ADD d11 v11",
  "d21 = MIN d21a d21b",
  "d22a = ADD d12 v12",
  "d22b = ADD d21 h21",
  "d22 = MIN d22a d22b",
  "out d22",
]);

// ---- KNAPSACK3 ----
{
  const L = [
    "# KNAPSACK3: for each of the 7 non-empty subsets, sum weight and value, zero the value if",
    "# the weight exceeds cap, then take the MAX over all of them (the empty subset is worth 0).",
    "puzzle KNAPSACK3",
    "w0 = IN 0",
    "v0 = IN 1",
    "w1 = IN 2",
    "v1 = IN 3",
    "w2 = IN 4",
    "v2 = IN 5",
    "cap = IN 6",
    "zero = CONST 0",
    "w01 = ADD w0 w1",
    "v01 = ADD v0 v1",
    "w02 = ADD w0 w2",
    "v02 = ADD v0 v2",
    "w12 = ADD w1 w2",
    "v12 = ADD v1 v2",
    "w012 = ADD w01 w2",
    "v012 = ADD v01 v2",
  ];
  const subsets = ["0", "1", "2", "01", "02", "12", "012"];
  for (const s of subsets) L.push(`over${s} = LT cap w${s}`, `val${s} = SEL over${s} zero v${s}`);
  L.push("best1 = MAX val0 val1");
  subsets.slice(2).forEach((s, i) => L.push(`best${i + 2} = MAX best${i + 1} val${s}`));
  L.push("out best6");
  save("KNAPSACK3", L);
}

// ---- FAIR_SPLIT4 ----
save("FAIR_SPLIT4", [
  "# FAIR_SPLIT4: if the requests exceed the budget, each gets floor(r * B / total); otherwise each",
  "# gets its request. Both branches are computed; DIV is safe because every request is >= 1.",
  "puzzle FAIR_SPLIT4",
  "b = IN 0",
  "r0 = IN 1",
  "r1 = IN 2",
  "r2 = IN 3",
  "r3 = IN 4",
  "s01 = ADD r0 r1",
  "s012 = ADD s01 r2",
  "total = ADD s012 r3",
  "over = LT b total",
  ...[0, 1, 2, 3].flatMap((i) => [`p${i} = MUL r${i} b`, `d${i} = DIV p${i} total`, `o${i} = SEL over d${i} r${i}`]),
  "out o0 o1 o2 o3",
]);
console.log("wrote fixtures/solutions/*.pk");
