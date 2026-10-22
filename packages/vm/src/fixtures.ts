// Generates the cross-implementation test vectors in fixtures/. Node-only (reads solution files).
// Everything is deterministic: same code, same files.
import { readFileSync } from "node:fs";
import { bytesToHex, type Hex } from "viem";
import { assemble } from "./asm.ts";
import { inputCount, inputs, outputCount, PUZZLE_COUNT, PUZZLE_NAMES, reference } from "./puzzles.ts";
import { makeRng, type Rng } from "./rng.ts";
import { type ErrorName, MAX_NODES, Op, run, validate } from "./vm.ts";

export const PROGRAM_COUNT = 2000;
export const INVALID_COUNT = 500;
const SEEDS_PER_PUZZLE = 24;
const TRIALS_PER_SEED = 12; // trials 0..11
const RNG_SEED = 0x50524b4e;

/** Keys are alphabetical: Foundry maps JSON objects onto Solidity structs in that order. */
export interface ValidRow {
  inputs: number[];
  ok: boolean;
  outputs: number[];
  program: number[];
  puzzleId: number;
  values: number[];
}
export interface InvalidRow {
  /** Node (or output slot) the error names; 0 for header errors. */
  index: number;
  program: number[];
  rule: ErrorName;
}
export interface VectorRow {
  expected: number[];
  inputs: number[];
  puzzleId: number;
  seed: Hex;
  trial: number;
}
export interface DiffFixtures {
  invalid: InvalidRow[];
  valid: ValidRow[];
  vectors: VectorRow[];
}

// ---------------------------------------------------------------- valid programs

const OP_COUNT = Op.SEL + 1;
/** Weight per opcode: biased towards ops that rarely fail, or uniform (lots of failures). */
const CALM_WEIGHTS = [3, 2, 2, 1, 1, 1, 3, 3, 3, 2, 2, 2, 3];
const WILD_WEIGHTS = Array<number>(OP_COUNT).fill(1);
const EXTREME_VALUES = [0, 1, 2, 255, 256, 65535, 65536, 0xfffffffe, 0xffffffff];

const operandCount = (op: number): number =>
  op === Op.IN || op === Op.CONST ? 0 : op === Op.SEL ? 3 : 2;

function encodeNode(op: number, operands: number[], literal: number): number[] {
  if (op === Op.IN) return [op, 0, 0, literal];
  if (op === Op.CONST) return [op, literal >> 8, literal & 0xff, 0];
  const [a = 0, b = 0, c = 0] = operands;
  return [op, a, b, c];
}

function pickSize(rng: Rng): number {
  const r = rng.int(100);
  if (r < 5) return MAX_NODES;
  if (r < 12) return 1 + rng.int(3);
  return 1 + rng.int(MAX_NODES);
}

function pickConst(rng: Rng): number {
  const r = rng.int(10);
  if (r < 5) return rng.int(11);
  if (r < 8) return rng.int(300);
  return rng.int(65536);
}

function weightedPick(rng: Rng, ops: number[], weights: number[]): number {
  let roll = rng.int(ops.reduce((sum, op) => sum + weights[op]!, 0));
  for (const op of ops) {
    roll -= weights[op]!;
    if (roll < 0) return op;
  }
  return ops[ops.length - 1]!;
}

/**
 * A valid program (all §3.3 rules) with no dead code, by construction. `open` tracks nodes nothing
 * reads yet; each must end up as an output, so after node i it may hold at most
 * `outCount + 2 * (nodes still to come)` entries (a SEL retires at most two net). Only ops that can
 * respect that bound are offered, and operands are forced onto open nodes when a random pick would not.
 */
function randomProgram(rng: Rng): Uint8Array {
  for (;;) {
    const program = tryBuildProgram(rng);
    if (program !== undefined) return program;
  }
}

function tryBuildProgram(rng: Rng): Uint8Array | undefined {
  const puzzleId = rng.int(PUZZLE_COUNT);
  const nIn = inputCount(puzzleId);
  const nOut = outputCount(puzzleId);
  const n = pickSize(rng);
  const weights = rng.chance(0.5) ? CALM_WEIGHTS : WILD_WEIGHTS;

  const nodes: number[][] = [];
  let open: number[] = [];
  for (let i = 0; i < n; i++) {
    const limit = nOut + 2 * (n - i - 1);
    const feasible = Array.from({ length: OP_COUNT }, (_, op) => op).filter((op) => {
      if (i === 0 && operandCount(op) > 0) return false;
      const retired = Math.min(operandCount(op), open.length);
      return open.length - retired + 1 <= limit;
    });
    if (feasible.length === 0) return undefined;
    const op = weightedPick(rng, feasible, weights);

    const k = operandCount(op);
    let operands = Array.from({ length: k }, () => (rng.chance(0.75) ? rng.pick(open) : rng.int(i)));
    let nextOpen = open.filter((x) => !operands.includes(x));
    if (nextOpen.length + 1 > limit) {
      const forced = rng.shuffle([...open]).slice(0, k);
      operands = [...forced, ...Array.from({ length: k - forced.length }, () => rng.int(i))];
      nextOpen = open.filter((x) => !operands.includes(x));
      if (nextOpen.length + 1 > limit) return undefined;
    }

    const literal = op === Op.IN ? rng.int(nIn) : op === Op.CONST ? pickConst(rng) : 0;
    nodes.push(encodeNode(op, operands, literal));
    open = [...nextOpen, i];
  }

  const outputs = rng.shuffle([...open, ...Array.from({ length: nOut - open.length }, () => rng.int(n))]);
  return Uint8Array.from([1, puzzleId, n, nOut, ...nodes.flat(), ...outputs]);
}

function randomSeed(rng: Rng): Hex {
  const words = Array.from({ length: 8 }, () => rng.int(2 ** 32).toString(16).padStart(8, "0"));
  return `0x${words.join("")}`;
}

/** One input vector inside the puzzle's ranges (or one of its edge cases), one with uint32 extremes. */
function inputVectors(rng: Rng, puzzleId: number): [number[], number[]] {
  const inRange = rng.chance(0.1)
    ? inputs(puzzleId, randomSeed(rng), rng.int(2))
    : inputs(puzzleId, randomSeed(rng), 2 + rng.int(8));
  const extreme = Array.from({ length: inputCount(puzzleId) }, () =>
    rng.chance(0.5) ? rng.pick(EXTREME_VALUES) : rng.int(20),
  );
  return [inRange, extreme];
}

function validRows(rng: Rng): ValidRow[] {
  const rows: ValidRow[] = [];
  const seen = new Set<string>(); // tiny programs collide often; repeats add no coverage
  while (seen.size < PROGRAM_COUNT) {
    const program = randomProgram(rng);
    if (seen.has(program.join())) continue;
    seen.add(program.join());
    for (const xs of inputVectors(rng, program[1]!)) {
      const result = run(program, xs);
      rows.push({
        inputs: xs,
        ok: result.ok,
        outputs: result.outputs,
        program: Array.from(program),
        puzzleId: program[1]!,
        values: result.values,
      });
    }
  }
  return rows;
}

// -------------------------------------------------------------- invalid programs

type Mutator = (p: Uint8Array, rng: Rng) => Uint8Array | undefined;

const nodeAt = (p: Uint8Array, i: number) => 4 + 4 * i;
const opOf = (p: Uint8Array, i: number): number => p[nodeAt(p, i)]!;
const randomNode = (p: Uint8Array, rng: Rng, accept: (op: number) => boolean): number | undefined => {
  const candidates = Array.from({ length: p[2]! }, (_, i) => i).filter((i) => accept(opOf(p, i)));
  return candidates.length === 0 ? undefined : rng.pick(candidates);
};
const withByte = (p: Uint8Array, at: number, value: number): Uint8Array => {
  const m = Uint8Array.from(p);
  m[at] = value;
  return m;
};

/** One mutator per rule: each aims to break exactly that rule in an otherwise valid program. */
const MUTATORS: Record<ErrorName, Mutator> = {
  BadLength: (p, rng) => {
    const variant = rng.int(3);
    if (variant === 0) return p.slice(0, rng.int(4));
    if (variant === 1) return Uint8Array.from([...p, ...Array.from({ length: 1 + rng.int(3) }, () => rng.int(256))]);
    return p.slice(0, p.length - (1 + rng.int(3)));
  },
  BadVersion: (p, rng) => withByte(p, 0, rng.pick([0, 2, 3, 255, 128])),
  BadPuzzle: (p, rng) => withByte(p, 1, PUZZLE_COUNT + rng.int(256 - PUZZLE_COUNT)),
  BadNodeCount: (p, rng) => withByte(p, 2, rng.chance(0.5) ? 0 : MAX_NODES + 1 + rng.int(255 - MAX_NODES)),
  BadOutCount: (p, rng) => withByte(p, 3, (p[3]! + 1 + rng.int(255)) & 0xff),
  BadOpcode: (p, rng) => withByte(p, nodeAt(p, rng.int(p[2]!)), OP_COUNT + rng.int(256 - OP_COUNT)),
  UnusedFieldNotZero: (p, rng) => {
    const i = randomNode(p, rng, (op) => op !== Op.SEL);
    if (i === undefined) return undefined;
    const op = opOf(p, i);
    const field = op === Op.IN ? 1 + rng.int(2) : 3; // IN leaves a, b unused; everything else leaves c
    return withByte(p, nodeAt(p, i) + field, 1 + rng.int(255));
  },
  OperandNotEarlier: (p, rng) => {
    const i = randomNode(p, rng, (op) => operandCount(op) > 0);
    if (i === undefined) return undefined;
    const field = 1 + rng.int(operandCount(opOf(p, i)));
    return withByte(p, nodeAt(p, i) + field, i + rng.int(256 - i));
  },
  BadInputIndex: (p, rng) => {
    const i = randomNode(p, rng, (op) => op === Op.IN);
    if (i === undefined) return undefined;
    const nIn = inputCount(p[1]!);
    return withByte(p, nodeAt(p, i) + 3, nIn + rng.int(256 - nIn));
  },
  BadOutputIndex: (p, rng) => {
    const n = p[2]!;
    return withByte(p, 4 + 4 * n + rng.int(p[3]!), n + rng.int(256 - n));
  },
  DeadNode: (p, rng) => {
    const n = p[2]!;
    if (rng.chance(0.5) && n < MAX_NODES) {
      // append a leaf that nothing reads
      const leaf = rng.chance(0.5) ? [Op.IN, 0, 0, 0] : [Op.CONST, rng.int(256), rng.int(256), 0];
      const out = [...p.slice(0, 4 + 4 * n), ...leaf, ...p.slice(4 + 4 * n)];
      out[2] = n + 1;
      return Uint8Array.from(out);
    }
    // re-point one operand elsewhere, which may orphan the node it used to read
    const i = randomNode(p, rng, (op) => operandCount(op) > 0);
    if (i === undefined) return undefined;
    const field = 1 + rng.int(operandCount(opOf(p, i)));
    return withByte(p, nodeAt(p, i) + field, rng.int(i));
  },
};

/** 1-3 random byte changes (small values favoured), sometimes with a truncation or extension. */
function corrupt(p: Uint8Array, rng: Rng): Uint8Array {
  let m = Uint8Array.from(p);
  for (let k = 1 + rng.int(3); k > 0; k--) {
    m[rng.int(m.length)] = rng.chance(0.5) ? rng.int(24) : rng.int(256);
  }
  if (rng.chance(0.15)) m = m.slice(0, m.length - 1 - rng.int(3));
  else if (rng.chance(0.15)) m = Uint8Array.from([...m, rng.int(256)]);
  return m;
}

function invalidRow(program: Uint8Array): InvalidRow | undefined {
  const v = validate(program);
  return v.ok ? undefined : { index: v.index ?? 0, program: Array.from(program), rule: v.error };
}

function invalidRows(rng: Rng): InvalidRow[] {
  const rules = Object.keys(MUTATORS) as ErrorName[];
  const perRule = 30;
  const rows: InvalidRow[] = [];

  for (const rule of rules) {
    for (let produced = 0; produced < perRule; ) {
      const mutated = MUTATORS[rule](randomProgram(rng), rng);
      const row = mutated && invalidRow(mutated);
      // keep only mutants that really fail on the rule they were aimed at
      if (row && row.rule === rule) {
        rows.push(row);
        produced++;
      }
    }
  }
  while (rows.length < INVALID_COUNT) {
    const row = invalidRow(corrupt(randomProgram(rng), rng));
    if (row) rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------- vectors

function vectorRows(rng: Rng): VectorRow[] {
  const rows: VectorRow[] = [];
  for (let puzzleId = 0; puzzleId < PUZZLE_COUNT; puzzleId++) {
    for (let s = 0; s < SEEDS_PER_PUZZLE; s++) {
      const seed = randomSeed(rng);
      for (let trial = 0; trial < TRIALS_PER_SEED; trial++) {
        const xs = inputs(puzzleId, seed, trial);
        rows.push({ expected: reference(puzzleId, xs), inputs: xs, puzzleId, seed, trial });
      }
    }
  }
  return rows;
}

// ------------------------------------------------------------------------ public

export function generateDiffFixtures(): DiffFixtures {
  const rng = makeRng(RNG_SEED);
  return { invalid: invalidRows(rng), valid: validRows(rng), vectors: vectorRows(rng) };
}

/** The hand-written solutions in fixtures/solutions/*.pk, assembled, as hex keyed by puzzle name. */
export function generateSolutions(): Record<string, Hex> {
  const dir = new URL("../../../fixtures/solutions/", import.meta.url);
  return Object.fromEntries(
    PUZZLE_NAMES.map((name) => [name, bytesToHex(assemble(readFileSync(new URL(`${name}.pk`, dir), "utf8")))]),
  );
}
