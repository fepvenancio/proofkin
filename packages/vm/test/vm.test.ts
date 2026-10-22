import { describe, expect, it } from "vitest";
import { Op, run, validate } from "../src/vm.ts";

const QUORUM7 = 0; // 8 inputs, 1 output
const SORT8 = 2; // 8 inputs, 8 outputs
const MAX32 = 0xffffffff;

const node = (op: number, a = 0, b = 0, c = 0): number[] => [op, a, b, c];

interface Header {
  version?: number;
  puzzleId?: number;
  nodeCount?: number;
  outCount?: number;
}

/** Raw program bytes. Header fields default to what the nodes/outputs imply and can be overridden. */
function program(puzzleId: number, nodes: number[][], outputs: number[], h: Header = {}): Uint8Array {
  return Uint8Array.from([
    h.version ?? 1,
    h.puzzleId ?? puzzleId,
    h.nodeCount ?? nodes.length,
    h.outCount ?? outputs.length,
    ...nodes.flat(),
    ...outputs,
  ]);
}

/** A QUORUM7 program whose single output is `op(inputs[0], inputs[1])`. */
function binary(op: number): Uint8Array {
  return program(QUORUM7, [node(Op.IN, 0, 0, 0), node(Op.IN, 0, 0, 1), node(op, 0, 1)], [2]);
}

const exec = (op: number, x: number, y: number) => run(binary(op), [x, y, 0, 0, 0, 0, 0, 0]);

describe("validate: accepts", () => {
  it("the smallest program: one IN node used as the output", () => {
    expect(validate(program(QUORUM7, [node(Op.IN)], [0]))).toEqual({ ok: true });
  });

  it("64 nodes (the maximum)", () => {
    const nodes = [node(Op.IN)];
    for (let i = 1; i < 64; i++) nodes.push(node(Op.MAX, i - 1, 0));
    expect(validate(program(QUORUM7, nodes, [63]))).toEqual({ ok: true });
  });

  it("output slots that repeat a node and point at IN/CONST nodes", () => {
    const nodes = [node(Op.IN), node(Op.CONST, 1, 2)];
    expect(validate(program(SORT8, nodes, [0, 0, 1, 1, 0, 1, 0, 1]))).toEqual({ ok: true });
  });

  it("every opcode 0..12 used in one live chain", () => {
    const nodes = [
      node(Op.IN, 0, 0, 0), // 0
      node(Op.CONST, 1, 2), // 1
      node(Op.ADD, 0, 1), // 2
      node(Op.SUB, 2, 0), // 3
      node(Op.MUL, 3, 1), // 4
      node(Op.DIV, 4, 1), // 5
      node(Op.MIN, 5, 0), // 6
      node(Op.MAX, 6, 1), // 7
      node(Op.LT, 7, 0), // 8
      node(Op.EQ, 8, 0), // 9
      node(Op.AND, 9, 1), // 10
      node(Op.OR, 10, 0), // 11
      node(Op.SEL, 11, 10, 0), // 12
    ];
    expect(validate(program(QUORUM7, nodes, [12]))).toEqual({ ok: true });
  });
});

describe("validate: rule 1 (version, puzzleId, length)", () => {
  it("rejects programs too short to hold a header", () => {
    expect(validate(Uint8Array.from([]))).toEqual({ ok: false, error: "BadLength" });
    expect(validate(Uint8Array.from([1, 0, 1]))).toEqual({ ok: false, error: "BadLength" });
  });

  it.each([0, 2, 255])("rejects version %i", (version) => {
    expect(validate(program(QUORUM7, [node(Op.IN)], [0], { version }))).toEqual({
      ok: false,
      error: "BadVersion",
    });
  });

  it.each([6, 7, 255])("rejects puzzleId %i", (puzzleId) => {
    expect(validate(program(QUORUM7, [node(Op.IN)], [0], { puzzleId }))).toEqual({
      ok: false,
      error: "BadPuzzle",
    });
  });

  it("rejects a trailing byte and a truncated body", () => {
    const ok = program(QUORUM7, [node(Op.IN)], [0]);
    expect(validate(Uint8Array.from([...ok, 0]))).toEqual({ ok: false, error: "BadLength" });
    expect(validate(ok.slice(0, ok.length - 1))).toEqual({ ok: false, error: "BadLength" });
  });
});

describe("validate: rule 2 (nodeCount, outCount)", () => {
  it("rejects nodeCount 0 and 65", () => {
    expect(validate(program(QUORUM7, [], [0]))).toEqual({ ok: false, error: "BadNodeCount" });
    const nodes = [node(Op.IN)];
    for (let i = 1; i < 65; i++) nodes.push(node(Op.MAX, i - 1, 0));
    expect(validate(program(QUORUM7, nodes, [64]))).toEqual({ ok: false, error: "BadNodeCount" });
  });

  it("rejects an outCount that differs from the puzzle's", () => {
    expect(validate(program(QUORUM7, [node(Op.IN)], [0, 0]))).toEqual({
      ok: false,
      error: "BadOutCount",
    });
    expect(validate(program(SORT8, [node(Op.IN)], [0]))).toEqual({
      ok: false,
      error: "BadOutCount",
    });
  });
});

describe("validate: rule 3 (opcodes, unused fields)", () => {
  it.each([13, 14, 255])("rejects opcode %i", (op) => {
    expect(validate(program(QUORUM7, [node(Op.IN), node(op)], [1]))).toEqual({
      ok: false,
      error: "BadOpcode",
      index: 1,
    });
  });

  it("rejects non-zero unused fields", () => {
    const cases: [string, number[][]][] = [
      ["IN.a", [node(Op.IN, 1, 0, 0)]],
      ["IN.b", [node(Op.IN, 0, 1, 0)]],
      ["CONST.c", [node(Op.CONST, 1, 1, 1)]],
      ["ADD.c", [node(Op.IN), node(Op.ADD, 0, 0, 1)]],
    ];
    for (const [label, nodes] of cases) {
      const index = nodes.length - 1;
      expect(validate(program(QUORUM7, nodes, [index])), label).toEqual({
        ok: false,
        error: "UnusedFieldNotZero",
        index,
      });
    }
  });

  it("lets CONST carry any a and b, and SEL use all three fields", () => {
    const nodes = [node(Op.CONST, 255, 255), node(Op.CONST, 0, 1), node(Op.SEL, 0, 0, 1)];
    expect(validate(program(QUORUM7, nodes, [2]))).toEqual({ ok: true });
  });
});

describe("validate: rule 4 (operands precede the node)", () => {
  it("rejects an operand equal to or after the node index", () => {
    const cases: [string, number[][]][] = [
      ["ADD a == i", [node(Op.IN), node(Op.ADD, 1, 0)]],
      ["ADD b == i", [node(Op.IN), node(Op.ADD, 0, 1)]],
      ["ADD b > i", [node(Op.IN), node(Op.ADD, 0, 5)]],
      ["SEL c == i", [node(Op.IN), node(Op.SEL, 0, 0, 1)]],
      ["any op at node 0", [node(Op.ADD, 0, 0)]],
    ];
    for (const [label, nodes] of cases) {
      const index = nodes.length - 1;
      expect(validate(program(QUORUM7, nodes, [index])), label).toEqual({
        ok: false,
        error: "OperandNotEarlier",
        index,
      });
    }
  });

  it("accepts the same operand twice (ADD x x)", () => {
    expect(validate(program(QUORUM7, [node(Op.IN), node(Op.ADD, 0, 0)], [1]))).toEqual({ ok: true });
  });
});

describe("validate: rule 5 (IN index)", () => {
  it("accepts the last input index and rejects the one after", () => {
    expect(validate(program(QUORUM7, [node(Op.IN, 0, 0, 7)], [0]))).toEqual({ ok: true });
    expect(validate(program(QUORUM7, [node(Op.IN, 0, 0, 8)], [0]))).toEqual({
      ok: false,
      error: "BadInputIndex",
      index: 0,
    });
  });
});

describe("validate: rule 6 (output indices)", () => {
  it("rejects an output slot at or past nodeCount, reporting the slot", () => {
    const nodes = [node(Op.IN), node(Op.IN, 0, 0, 1)];
    expect(validate(program(SORT8, nodes, [0, 1, 0, 1, 0, 2, 0, 1]))).toEqual({
      ok: false,
      error: "BadOutputIndex",
      index: 5,
    });
  });
});

describe("validate: rule 7 (no dead code)", () => {
  it("rejects a node nothing reads", () => {
    expect(validate(program(QUORUM7, [node(Op.IN), node(Op.IN, 0, 0, 1)], [0]))).toEqual({
      ok: false,
      error: "DeadNode",
      index: 1,
    });
  });

  it("reports the lowest dead index when a dead node only feeds another dead node", () => {
    const nodes = [node(Op.IN), node(Op.IN, 0, 0, 1), node(Op.ADD, 1, 1), node(Op.ADD, 0, 0)];
    expect(validate(program(QUORUM7, nodes, [3]))).toEqual({
      ok: false,
      error: "DeadNode",
      index: 1,
    });
  });

  it("counts a node as live when only a SEL's c operand reads it", () => {
    const nodes = [node(Op.CONST, 0, 1), node(Op.CONST, 0, 2), node(Op.CONST, 0, 3), node(Op.SEL, 0, 1, 2)];
    expect(validate(program(QUORUM7, nodes, [3]))).toEqual({ ok: true });
  });
});

describe("validate: which error wins when several rules are broken", () => {
  it("header rules beat node rules", () => {
    expect(validate(program(QUORUM7, [node(13)], [0], { version: 2 }))).toEqual({
      ok: false,
      error: "BadVersion",
    });
    expect(validate(program(QUORUM7, [node(13)], [0], { outCount: 3 }))).toEqual({
      ok: false,
      error: "BadOutCount",
    });
  });

  it("within a node: opcode, then unused fields, then operands, then input index", () => {
    expect(validate(program(QUORUM7, [node(13, 9, 9, 9)], [0]))).toMatchObject({
      error: "BadOpcode",
    });
    expect(validate(program(QUORUM7, [node(Op.ADD, 9, 9, 9)], [0]))).toMatchObject({
      error: "UnusedFieldNotZero",
    });
    expect(validate(program(QUORUM7, [node(Op.ADD, 9, 9)], [0]))).toMatchObject({
      error: "OperandNotEarlier",
    });
    expect(validate(program(QUORUM7, [node(Op.IN, 0, 0, 99)], [0]))).toMatchObject({
      error: "BadInputIndex",
    });
  });

  it("the lowest-numbered failing node is reported", () => {
    const nodes = [node(Op.IN, 0, 0, 99), node(13)];
    expect(validate(program(QUORUM7, nodes, [1]))).toEqual({
      ok: false,
      error: "BadInputIndex",
      index: 0,
    });
  });

  it("node rules beat output rules, and output rules beat dead code", () => {
    expect(validate(program(QUORUM7, [node(Op.IN, 0, 0, 99)], [7]))).toMatchObject({
      error: "BadInputIndex",
    });
    expect(validate(program(QUORUM7, [node(Op.IN), node(Op.IN, 0, 0, 1)], [9]))).toEqual({
      ok: false,
      error: "BadOutputIndex",
      index: 0,
    });
  });
});

describe("run: opcode semantics", () => {
  it("IN reads inputs[c]; CONST is (a << 8) | b; values has every node", () => {
    const nodes = [node(Op.IN, 0, 0, 3), node(Op.CONST, 0x12, 0x34), node(Op.ADD, 0, 1)];
    expect(run(program(QUORUM7, nodes, [2]), [10, 11, 12, 13, 14, 15, 16, 17])).toEqual({
      ok: true,
      outputs: [13 + 0x1234],
      values: [13, 0x1234, 13 + 0x1234],
    });
  });

  it("CONST covers the full 0..65535 range", () => {
    const p = program(QUORUM7, [node(Op.CONST, 255, 255)], [0]);
    expect(run(p, Array(8).fill(0)).outputs).toEqual([65535]);
  });

  it.each([
    ["ADD", Op.ADD, 3, 4, 7],
    ["ADD up to the uint32 max", Op.ADD, MAX32, 0, MAX32],
    ["SUB", Op.SUB, 5, 3, 2],
    ["SUB to zero", Op.SUB, 3, 3, 0],
    ["MUL", Op.MUL, 1000, 1000, 1_000_000],
    ["MUL landing exactly on the uint32 max", Op.MUL, 65535, 65537, MAX32],
    ["MUL by zero", Op.MUL, MAX32, 0, 0],
    ["DIV floors", Op.DIV, 7, 2, 3],
    ["DIV of zero", Op.DIV, 0, 5, 0],
    ["DIV at the uint32 max", Op.DIV, MAX32, 1, MAX32],
    ["MIN (a smaller)", Op.MIN, 3, 9, 3],
    ["MIN (b smaller)", Op.MIN, 9, 3, 3],
    ["MAX (b larger)", Op.MAX, 3, 9, 9],
    ["MAX (a larger)", Op.MAX, 9, 3, 9],
    ["LT true", Op.LT, 1, 2, 1],
    ["LT false", Op.LT, 2, 1, 0],
    ["LT equal is false", Op.LT, 2, 2, 0],
    ["EQ true", Op.EQ, 5, 5, 1],
    ["EQ false", Op.EQ, 5, 6, 0],
    ["AND of two non-zero values (not bitwise)", Op.AND, 2, 3, 1],
    ["AND with a zero", Op.AND, 2, 0, 0],
    ["AND of zeros", Op.AND, 0, 0, 0],
    ["OR of zeros", Op.OR, 0, 0, 0],
    ["OR (b non-zero)", Op.OR, 0, 7, 1],
    ["OR (a non-zero)", Op.OR, 7, 0, 1],
  ])("%s", (_label, op, x, y, expected) => {
    expect(exec(op, x, y)).toMatchObject({ ok: true, outputs: [expected] });
  });

  it.each([
    ["ADD overflow", Op.ADD, MAX32, 1],
    ["ADD of two maxima", Op.ADD, MAX32, MAX32],
    ["SUB underflow", Op.SUB, 3, 5],
    ["MUL overflow at exactly 2^32", Op.MUL, 65536, 65536],
    ["MUL of the max by 2", Op.MUL, MAX32, 2],
    ["DIV by zero", Op.DIV, 5, 0],
    ["DIV 0 by 0", Op.DIV, 0, 0],
  ])("%s fails without throwing", (_label, op, x, y) => {
    expect(exec(op, x, y).ok).toBe(false);
  });

  describe("SEL", () => {
    const sel = program(
      QUORUM7,
      [node(Op.IN, 0, 0, 0), node(Op.IN, 0, 0, 1), node(Op.IN, 0, 0, 2), node(Op.SEL, 0, 1, 2)],
      [3],
    );
    const pad = [0, 0, 0, 0, 0];

    it("takes b when a is non-zero and c when a is zero", () => {
      expect(run(sel, [1, 10, 20, ...pad]).outputs).toEqual([10]);
      expect(run(sel, [0, 10, 20, ...pad]).outputs).toEqual([20]);
      expect(run(sel, [7, 10, 20, ...pad]).outputs).toEqual([10]);
    });

    it("computes both branches, so a failing unselected branch still fails the run", () => {
      const nodes = [
        node(Op.IN, 0, 0, 0), // 0: condition
        node(Op.IN, 0, 0, 1), // 1: x
        node(Op.CONST, 0, 0), // 2: zero
        node(Op.DIV, 1, 2), // 3: x / 0 fails
        node(Op.SEL, 0, 1, 3), // 4: condition picks the safe branch
      ];
      expect(run(program(QUORUM7, nodes, [4]), [1, 5, ...pad, 0]).ok).toBe(false);
    });
  });
});

describe("run: failure and output shape", () => {
  it("halts at the first failing node: outputs empty, that value and all later values 0", () => {
    const nodes = [
      node(Op.IN, 0, 0, 0),
      node(Op.IN, 0, 0, 1),
      node(Op.SUB, 0, 1), // 1 - 5 underflows
      node(Op.ADD, 2, 2),
    ];
    expect(run(program(QUORUM7, nodes, [3]), [1, 5, 0, 0, 0, 0, 0, 0])).toEqual({
      ok: false,
      outputs: [],
      values: [1, 5, 0, 0],
    });
  });

  it("fills output slots in order, repeats included", () => {
    const p = program(SORT8, [node(Op.IN, 0, 0, 0), node(Op.IN, 0, 0, 1)], [1, 0, 1, 0, 1, 0, 1, 0]);
    expect(run(p, [5, 9, 0, 0, 0, 0, 0, 0])).toEqual({
      ok: true,
      outputs: [9, 5, 9, 5, 9, 5, 9, 5],
      values: [5, 9],
    });
  });
});
