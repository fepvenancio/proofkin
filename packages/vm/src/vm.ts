// TypeScript port of contracts/src/VM.sol. Must stay semantically identical (see fixtures/diff.json).
import { inputCount, outputCount, PUZZLE_COUNT } from "./puzzles.ts";

export const VERSION = 1;
export const MAX_NODES = 64;
export const MAX_VALUE = 0xffffffff; // uint32

export const Op = {
  IN: 0,
  CONST: 1,
  ADD: 2,
  SUB: 3,
  MUL: 4,
  DIV: 5,
  MIN: 6,
  MAX: 7,
  LT: 8,
  EQ: 9,
  AND: 10,
  OR: 11,
  SEL: 12,
} as const;

export const OP_NAMES = Object.keys(Op) as (keyof typeof Op)[];

/** Same identifiers as the custom errors declared in VM.sol. */
export type ErrorName =
  | "BadLength"
  | "BadVersion"
  | "BadPuzzle"
  | "BadNodeCount"
  | "BadOutCount"
  | "BadOpcode"
  | "UnusedFieldNotZero"
  | "OperandNotEarlier"
  | "BadInputIndex"
  | "BadOutputIndex"
  | "DeadNode";

/** `index` is the node (or output slot, for BadOutputIndex); absent for header errors. */
export type Validation = { ok: true } | { ok: false; error: ErrorName; index?: number };

export interface RunResult {
  ok: boolean;
  outputs: number[];
  values: number[];
}

const fail = (error: ErrorName, index?: number): Validation =>
  index === undefined ? { ok: false, error } : { ok: false, error, index };

/** Node-index operands of a node (IN and CONST have none). */
function operandsOf(op: number, a: number, b: number, c: number): number[] {
  if (op === Op.IN || op === Op.CONST) return [];
  return op === Op.SEL ? [a, b, c] : [a, b];
}

/**
 * Checks every §3.3 rule in a fixed order, so the first failure is deterministic:
 * header (length < 4, version, puzzleId, nodeCount, outCount, total length), then each node in
 * index order (opcode, unused fields, operands, IN index), then output indices, then dead code.
 * Rule 8 (uniqueness) is stateful and lives in Proofkin.sol.
 */
export function validate(program: Uint8Array): Validation {
  if (program.length < 4) return fail("BadLength");
  const version = program[0]!;
  const puzzleId = program[1]!;
  const n = program[2]!;
  const outCount = program[3]!;
  if (version !== VERSION) return fail("BadVersion");
  if (puzzleId >= PUZZLE_COUNT) return fail("BadPuzzle");
  if (n < 1 || n > MAX_NODES) return fail("BadNodeCount");
  if (outCount !== outputCount(puzzleId)) return fail("BadOutCount");
  if (program.length !== 4 + 4 * n + outCount) return fail("BadLength");

  const nIn = inputCount(puzzleId);
  for (let i = 0; i < n; i++) {
    const at = 4 + 4 * i;
    const op = program[at]!;
    const a = program[at + 1]!;
    const b = program[at + 2]!;
    const c = program[at + 3]!;
    if (op > Op.SEL) return fail("BadOpcode", i);

    const unusedNonZero =
      op === Op.IN ? a !== 0 || b !== 0 : op === Op.CONST ? c !== 0 : op !== Op.SEL && c !== 0;
    if (unusedNonZero) return fail("UnusedFieldNotZero", i);

    if (operandsOf(op, a, b, c).some((x) => x >= i)) return fail("OperandNotEarlier", i);
    if (op === Op.IN && c >= nIn) return fail("BadInputIndex", i);
  }

  const outputsAt = 4 + 4 * n;
  for (let s = 0; s < outCount; s++) {
    if (program[outputsAt + s]! >= n) return fail("BadOutputIndex", s);
  }

  const live = new Array<boolean>(n).fill(false);
  for (let s = 0; s < outCount; s++) live[program[outputsAt + s]!] = true;
  for (let i = n - 1; i >= 0; i--) {
    if (!live[i]) continue;
    const at = 4 + 4 * i;
    for (const x of operandsOf(program[at]!, program[at + 1]!, program[at + 2]!, program[at + 3]!)) {
      live[x] = true;
    }
  }
  const dead = live.indexOf(false);
  return dead === -1 ? { ok: true } : fail("DeadNode", dead);
}

/**
 * Evaluates a program that has passed `validate`. `inputs` must hold uint32 values and cover the
 * puzzle's input count. Evaluation halts at the first failing node (overflow, underflow, division
 * by zero): `ok` is false, `outputs` is empty, and that node's value and every later one stay 0.
 */
export function run(program: Uint8Array, inputs: readonly number[]): RunResult {
  const n = program[2]!;
  const outCount = program[3]!;
  const values = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    const at = 4 + 4 * i;
    const op = program[at]!;
    const a = program[at + 1]!;
    const b = program[at + 2]!;
    const c = program[at + 3]!;
    let v: number;

    switch (op) {
      case Op.IN: {
        const x = inputs[c];
        if (x === undefined) throw new RangeError(`missing input ${c}`);
        v = x;
        break;
      }
      case Op.CONST:
        v = (a << 8) | b;
        break;
      case Op.ADD:
        v = values[a]! + values[b]!;
        break;
      case Op.SUB:
        if (values[a]! < values[b]!) return { ok: false, outputs: [], values };
        v = values[a]! - values[b]!;
        break;
      case Op.MUL:
        // Operands are < 2^32. The product is exact whenever it is <= MAX_VALUE, and any larger
        // product rounds to >= 2^32 (monotone rounding, 2^32 is representable), so the check holds.
        v = values[a]! * values[b]!;
        break;
      case Op.DIV:
        if (values[b]! === 0) return { ok: false, outputs: [], values };
        v = Math.floor(values[a]! / values[b]!); // exact for numerators < 2^53
        break;
      case Op.MIN:
        v = Math.min(values[a]!, values[b]!);
        break;
      case Op.MAX:
        v = Math.max(values[a]!, values[b]!);
        break;
      case Op.LT:
        v = values[a]! < values[b]! ? 1 : 0;
        break;
      case Op.EQ:
        v = values[a]! === values[b]! ? 1 : 0;
        break;
      case Op.AND:
        v = values[a]! !== 0 && values[b]! !== 0 ? 1 : 0;
        break;
      case Op.OR:
        v = values[a]! !== 0 || values[b]! !== 0 ? 1 : 0;
        break;
      case Op.SEL:
        v = values[a]! !== 0 ? values[b]! : values[c]!;
        break;
      default:
        throw new RangeError(`invalid opcode ${op} at node ${i}`);
    }

    if (v > MAX_VALUE) return { ok: false, outputs: [], values };
    values[i] = v;
  }

  const outputsAt = 4 + 4 * n;
  const outputs = Array.from({ length: outCount }, (_, s) => values[program[outputsAt + s]!]!);
  return { ok: true, outputs, values };
}
