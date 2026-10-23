// Turns the editor's text into a program, or into an explanation a player can act on.
import { assemble, inputCount, Op, outputCount, PUZZLE_NAMES, validate } from "@proofkin/vm";
import { bytesToHex, type Hex } from "viem";
import { PUZZLE_INFO } from "./puzzleInfo.ts";

export type Analysis =
  | { ok: true; program: Uint8Array; hex: Hex; puzzleId: number; nodeCount: number; depth: number }
  | { ok: false; stage: "assemble" | "validate"; message: string; line?: number };

/**
 * A starting point for a puzzle: a valid program that is plainly wrong (it passes one input straight to the
 * output). The preview and the local test work from the first keystroke, and the first failing case shows
 * the player what the puzzle actually asks.
 */
export function skeletonFor(puzzleId: number): string {
  const info = PUZZLE_INFO[puzzleId]!;
  const names = info.inputs.map((slot) => slot.label.replace(/\W+/g, "_"));
  const slots = info.outputs.length;
  return [
    `puzzle ${info.name}`,
    `# Inputs: ${names.map((name, i) => `${i} ${name}`).join(", ")}`,
    "# Declare the inputs you use as  name = IN slot, then build the answer one node per line, for example  sum = ADD a b",
    `# Every node has to feed an output. This puzzle's out line takes ${slots} slot${slots === 1 ? "" : "s"}.`,
    `${names[0]} = IN 0`,
    `out ${Array(slots).fill(names[0]).join(" ")}`,
    "",
  ].join("\n");
}

/** Names of the nodes in declaration order, which is the order the assembler numbers them. */
function nodeNames(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split("\n")) {
    const tokens = raw.split("#")[0]!.trim().split(/\s+/).filter(Boolean);
    if (tokens.length >= 3 && tokens[1] === "=" && tokens[0] !== "out" && tokens[0] !== "puzzle") names.push(tokens[0]!);
  }
  return names;
}

function programDepth(program: Uint8Array): number {
  const n = program[2]!;
  const depth: number[] = [];
  for (let i = 0; i < n; i++) {
    const at = 4 + 4 * i;
    const op = program[at]!;
    if (op === Op.IN || op === Op.CONST) {
      depth.push(0);
      continue;
    }
    const operands = op === Op.SEL ? [program[at + 1]!, program[at + 2]!, program[at + 3]!] : [program[at + 1]!, program[at + 2]!];
    depth.push(1 + Math.max(...operands.map((x) => depth[x]!)));
  }
  const outputsAt = 4 + 4 * n;
  return Math.max(...Array.from(program.subarray(outputsAt), (o) => depth[o]!));
}

export function analyze(text: string): Analysis {
  let program: Uint8Array;
  try {
    program = assemble(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const m = /^line (\d+): (.*)$/s.exec(message);
    return m ? { ok: false, stage: "assemble", line: Number(m[1]), message: m[2]! } : { ok: false, stage: "assemble", message };
  }

  const v = validate(program);
  if (!v.ok) {
    const names = nodeNames(text);
    const nodeName = (i: number | undefined) => (i === undefined ? "?" : (names[i] ?? `#${i}`));
    const puzzleId = program[1]!;
    const puzzle = PUZZLE_NAMES[puzzleId] ?? `puzzle ${puzzleId}`;
    const message = (() => {
      switch (v.error) {
        case "DeadNode":
          return `Node "${nodeName(v.index)}" is never used: every node has to feed an output, directly or through other nodes.`;
        case "BadOutCount": {
          const want = outputCount(puzzleId);
          return `${puzzle} needs ${want} output slot${want === 1 ? "" : "s"} on the out line, not ${program[3]}.`;
        }
        case "BadInputIndex":
          return `Node "${nodeName(v.index)}" reads input ${program[4 + 4 * v.index! + 3]}, but ${puzzle} has inputs 0 to ${inputCount(puzzleId) - 1}.`;
        case "BadNodeCount":
          return `A program has at most 64 nodes and at least 1; this one has ${program[2]}.`;
        case "OperandNotEarlier":
          return `Node "${nodeName(v.index)}" uses a node that is declared after it.`;
        default:
          return `The program is not valid (${v.error}${v.index === undefined ? "" : ` at ${nodeName(v.index)}`}).`;
      }
    })();
    return { ok: false, stage: "validate", message };
  }

  return { ok: true, program, hex: bytesToHex(program), puzzleId: program[1]!, nodeCount: program[2]!, depth: programDepth(program) };
}
