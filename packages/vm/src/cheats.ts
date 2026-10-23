// Plausible WRONG programs. Each is a correct solution with one piece of the work left out, which is how
// someone trying to mint a smaller token (or any token) without solving the puzzle would cut a corner: ignore
// a voter, miss a path, forget a subset, drop a comparator. They are valid programs with no dead nodes, so
// the contract accepts them as programs and only the trials can reject them.
//
// With no omission each builder makes a correct solution (the tests check it), so a cheat is exactly one
// omission away from a program that is allowed to mint. The cheats go to fixtures/cheats.json for Foundry.

export interface Cheat {
  name: string;
  puzzleId: number;
  source: string;
}

const QUORUM7 = 0;
const SORT8 = 2;
const GRID_PATH = 3;
const KNAPSACK3 = 4;

// ------------------------------------------------------------------ QUORUM7

/** `skip` leaves one voter out of the sum; `compare` replaces `sum >= t`. */
export function quorum7Source(opts: { skip?: number; compare?: "atLeast" | "greaterThan" | "oneBelow" } = {}): string {
  const { skip, compare = "atLeast" } = opts;
  const lines = ["puzzle QUORUM7"];
  const votes: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (i === skip) continue;
    lines.push(`v${i} = IN ${i}`);
    votes.push(`v${i}`);
  }
  lines.push("t = IN 7");

  let sum = votes[0]!;
  votes.slice(1).forEach((vote, k) => {
    lines.push(`s${k + 1} = ADD ${sum} ${vote}`);
    sum = `s${k + 1}`;
  });

  if (compare === "atLeast") lines.push(`lt = LT ${sum} t`, "zero = CONST 0", "ok = EQ lt zero");
  else if (compare === "greaterThan") lines.push(`ok = LT t ${sum}`);
  else lines.push("one = CONST 1", `up = ADD ${sum} one`, "lt = LT up t", "zero = CONST 0", "ok = EQ lt zero"); // sum + 1 >= t
  lines.push("out ok");
  return lines.join("\n");
}

// ---------------------------------------------------------------- GRID_PATH

/** The six monotone paths from the top-left to the bottom-right node; R is right, D is down. */
export const GRID_PATHS = ["RRDD", "RDRD", "RDDR", "DRRD", "DRDR", "DDRR"] as const;

/** Input numbers of the four edges along a path, in the order they are travelled (§4 edge order). */
export function gridEdges(moves: string): number[] {
  let row = 0;
  let col = 0;
  const edges: number[] = [];
  for (const move of moves) {
    if (move === "R") {
      edges.push(2 * row + col);
      col++;
    } else {
      edges.push(6 + 3 * row + col);
      row++;
    }
  }
  return edges;
}

/** The cheapest of the paths, summed edge by edge; `skip` is the index in GRID_PATHS of one path to miss. */
export function gridPathSource(opts: { skip?: number } = {}): string {
  const kept = GRID_PATHS.map((moves, index) => ({ moves, index })).filter(({ index }) => index !== opts.skip);
  const used = [...new Set(kept.flatMap(({ moves }) => gridEdges(moves)))].sort((a, b) => a - b);

  const lines = ["puzzle GRID_PATH", ...used.map((e) => `e${e} = IN ${e}`)];
  const costs = kept.map(({ moves, index }) => {
    const [a, b, c, d] = gridEdges(moves) as [number, number, number, number];
    lines.push(`p${index}a = ADD e${a} e${b}`, `p${index}b = ADD p${index}a e${c}`, `p${index}c = ADD p${index}b e${d}`);
    return `p${index}c`;
  });
  let best = costs[0]!;
  costs.slice(1).forEach((cost, k) => {
    lines.push(`m${k + 1} = MIN ${best} ${cost}`);
    best = `m${k + 1}`;
  });
  lines.push(`out ${best}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- KNAPSACK3

/** The non-empty subsets as bit masks over the three items: three singles, three pairs, then all of them. */
export const KNAPSACK_SUBSETS = [1, 2, 4, 3, 5, 6, 7] as const;

export const subsetLabel = (mask: number): string => [0, 1, 2].filter((i) => mask & (1 << i)).join("");

/** `skipSubset` is a mask left out of the search; `exclusiveCap` accepts a set only when it weighs less than cap. */
export function knapsack3Source(opts: { skipSubset?: number; exclusiveCap?: boolean } = {}): string {
  const lines = ["puzzle KNAPSACK3"];
  for (let i = 0; i < 3; i++) lines.push(`w${i} = IN ${2 * i}`, `v${i} = IN ${2 * i + 1}`);
  lines.push("cap = IN 6", "zero = CONST 0");
  if (opts.exclusiveCap) lines.push("one = CONST 1", "capm = SUB cap one"); // w >= cap  <=>  cap - 1 < w
  const limit = opts.exclusiveCap ? "capm" : "cap";

  const values: string[] = [];
  for (const mask of KNAPSACK_SUBSETS) {
    if (mask === opts.skipSubset) continue;
    const items = [0, 1, 2].filter((i) => mask & (1 << i));
    let weight = `w${items[0]}`;
    let value = `v${items[0]}`;
    items.slice(1).forEach((item, k) => {
      lines.push(`w${mask}_${k} = ADD ${weight} w${item}`, `v${mask}_${k} = ADD ${value} v${item}`);
      weight = `w${mask}_${k}`;
      value = `v${mask}_${k}`;
    });
    lines.push(`over${mask} = LT ${limit} ${weight}`, `val${mask} = SEL over${mask} zero ${value}`);
    values.push(`val${mask}`);
  }
  let best = values[0]!;
  values.slice(1).forEach((value, k) => {
    lines.push(`best${k + 1} = MAX ${best} ${value}`);
    best = `best${k + 1}`;
  });
  lines.push(`out ${best}`);
  return lines.join("\n");
}

// -------------------------------------------------------------------- SORT8

/** Batcher's odd-even merge sort for eight wires: 19 compare-and-swap steps, `(low wire, high wire)`. */
export const SORT8_NETWORK: readonly (readonly [number, number])[] = [
  [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7], [0, 1], [2, 3],
  [4, 5], [6, 7], [2, 4], [3, 5], [1, 4], [3, 6], [1, 2], [3, 4], [5, 6],
];

/** `skip` is the index in SORT8_NETWORK of one comparator to leave out. */
export function sort8Source(opts: { skip?: number } = {}): string {
  const lines = ["puzzle SORT8"];
  const wire = Array.from({ length: 8 }, (_, i) => `x${i}`);
  wire.forEach((name, i) => lines.push(`${name} = IN ${i}`));
  SORT8_NETWORK.forEach(([i, j], k) => {
    if (k === opts.skip) return;
    lines.push(`lo${k} = MIN ${wire[i]} ${wire[j]}`, `hi${k} = MAX ${wire[i]} ${wire[j]}`);
    wire[i] = `lo${k}`;
    wire[j] = `hi${k}`;
  });
  lines.push(`out ${wire.join(" ")}`);
  return lines.join("\n");
}

// --------------------------------------------------------------------- all

export function generateCheats(): Cheat[] {
  const cheats: Cheat[] = [];
  for (let voter = 0; voter < 7; voter++) {
    cheats.push({ name: `QUORUM7_without_v${voter}`, puzzleId: QUORUM7, source: quorum7Source({ skip: voter }) });
  }
  cheats.push(
    { name: "QUORUM7_strictly_greater", puzzleId: QUORUM7, source: quorum7Source({ compare: "greaterThan" }) },
    { name: "QUORUM7_one_below_threshold", puzzleId: QUORUM7, source: quorum7Source({ compare: "oneBelow" }) },
  );
  GRID_PATHS.forEach((moves, index) => {
    cheats.push({ name: `GRID_PATH_without_${moves}`, puzzleId: GRID_PATH, source: gridPathSource({ skip: index }) });
  });
  for (const mask of KNAPSACK_SUBSETS) {
    cheats.push({ name: `KNAPSACK3_without_subset_${subsetLabel(mask)}`, puzzleId: KNAPSACK3, source: knapsack3Source({ skipSubset: mask }) });
  }
  cheats.push({ name: "KNAPSACK3_exclusive_capacity", puzzleId: KNAPSACK3, source: knapsack3Source({ exclusiveCap: true }) });
  SORT8_NETWORK.forEach((_, k) => {
    cheats.push({ name: `SORT8_without_comparator_${k}`, puzzleId: SORT8, source: sort8Source({ skip: k }) });
  });
  return cheats;
}
