// Off-chain assembler/disassembler for the §3.5 syntax. It only encodes: whether the result is a
// legal program for its puzzle is `validate`'s job.
import { PUZZLE_NAMES } from "./puzzles.ts";
import { Op, OP_NAMES, validate, VERSION } from "./vm.ts";

type OpName = keyof typeof Op;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER = /^\d+$/;
const RESERVED = new Set(["puzzle", "out"]);
const MAX_COUNT = 255; // node and output counts are one byte each

/** Operands after the mnemonic: a literal for IN/CONST, node names for everything else. */
const ARITY: Record<OpName, number> = {
  IN: 1,
  CONST: 1,
  ADD: 2,
  SUB: 2,
  MUL: 2,
  DIV: 2,
  MIN: 2,
  MAX: 2,
  LT: 2,
  EQ: 2,
  AND: 2,
  OR: 2,
  SEL: 3,
};

function literal(token: string, max: number): number | undefined {
  if (!NUMBER.test(token)) return undefined;
  const n = Number(token);
  return n <= max ? n : undefined;
}

export function assemble(text: string): Uint8Array {
  let puzzleId: number | undefined;
  let outputs: number[] | undefined;
  const nodes: number[][] = [];
  const names = new Map<string, number>();

  text.split("\n").forEach((raw, idx) => {
    const lineNo = idx + 1;
    const err = (msg: string): never => {
      throw new Error(`line ${lineNo}: ${msg}`);
    };
    const tokens = raw.split("#")[0]!.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;

    const resolve = (name: string): number => {
      const index = names.get(name);
      return index === undefined ? err(`unknown name '${name}'`) : index;
    };

    if (outputs !== undefined) err("statements are not allowed after 'out'");
    const head = tokens[0]!;

    if (RESERVED.has(head) && tokens[1] === "=") err(`'${head}' is a reserved name`);

    if (head === "puzzle") {
      if (puzzleId !== undefined) err("duplicate 'puzzle' line");
      if (tokens.length !== 2) err("expected 'puzzle <NAME>'");
      const id = PUZZLE_NAMES.indexOf(tokens[1]!);
      if (id === -1) err(`unknown puzzle '${tokens[1]}'`);
      puzzleId = id;
      return;
    }

    if (puzzleId === undefined) err("first statement must be 'puzzle <NAME>'");

    if (head === "out") {
      const slots = tokens.slice(1).map(resolve);
      if (slots.length > MAX_COUNT) err(`at most ${MAX_COUNT} outputs`);
      outputs = slots;
      return;
    }

    if (tokens.length < 3 || tokens[1] !== "=") err("expected '<name> = <OP> <operands>'");
    if (!IDENT.test(head)) err(`invalid name '${head}'`);
    if (names.has(head)) err(`name '${head}' already defined`);

    const mnemonic = tokens[2]!;
    if (!Object.hasOwn(Op, mnemonic)) err(`unknown op '${mnemonic}'`);
    const op = mnemonic as OpName;
    const args = tokens.slice(3);
    if (args.length !== ARITY[op]) {
      err(`${op} takes ${ARITY[op]} operand${ARITY[op] === 1 ? "" : "s"}, got ${args.length}`);
    }
    if (nodes.length === MAX_COUNT) err(`at most ${MAX_COUNT} nodes`);

    if (op === "IN") {
      const c = literal(args[0]!, 255);
      if (c === undefined) err("IN takes an input index 0..255");
      nodes.push([Op.IN, 0, 0, c!]);
    } else if (op === "CONST") {
      const n = literal(args[0]!, 0xffff);
      if (n === undefined) err("CONST takes a number 0..65535");
      nodes.push([Op.CONST, n! >> 8, n! & 0xff, 0]);
    } else {
      const [a, b, c] = args.map(resolve);
      nodes.push([Op[op], a!, b!, c ?? 0]);
    }
    names.set(head, nodes.length - 1);
  });

  if (puzzleId === undefined) throw new Error("line 1: first statement must be 'puzzle <NAME>'");
  if (outputs === undefined) throw new Error("missing 'out' line");
  return Uint8Array.from([VERSION, puzzleId, nodes.length, outputs.length, ...nodes.flat(), ...outputs]);
}

/** Text for a program that passes `validate`; nodes are named n0, n1, ... */
export function disassemble(program: Uint8Array): string {
  const v = validate(program);
  if (!v.ok) {
    throw new Error(`cannot disassemble: ${v.error}${v.index === undefined ? "" : ` at ${v.index}`}`);
  }
  const n = program[2]!;
  const lines = [`puzzle ${PUZZLE_NAMES[program[1]!]}`];
  for (let i = 0; i < n; i++) {
    const at = 4 + 4 * i;
    const [op, a, b, c] = [program[at]!, program[at + 1]!, program[at + 2]!, program[at + 3]!];
    const name = OP_NAMES[op]!;
    let operands: string;
    if (op === Op.IN) operands = String(c);
    else if (op === Op.CONST) operands = String((a << 8) | b);
    else if (op === Op.SEL) operands = `n${a} n${b} n${c}`;
    else operands = `n${a} n${b}`;
    lines.push(`n${i} = ${name} ${operands}`);
  }
  const slots = Array.from(program.subarray(4 + 4 * n), (x) => `n${x}`);
  lines.push(`out ${slots.join(" ")}`);
  return `${lines.join("\n")}\n`;
}
