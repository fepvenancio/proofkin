import { describe, expect, it } from "vitest";
import { assemble, disassemble } from "../src/asm.ts";
import { validate } from "../src/vm.ts";

const bytes = (...xs: number[]) => Uint8Array.from(xs);

describe("assemble", () => {
  it("encodes header, nodes and outputs", () => {
    const text = `
      puzzle QUORUM7
      x = IN 3
      out x
    `;
    // version, puzzleId, nodeCount, outCount | IN c=3 | output node 0
    expect(assemble(text)).toEqual(bytes(1, 0, 1, 1, 0, 0, 0, 3, 0));
  });

  it("maps every puzzle name to its id", () => {
    const ids = ["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"];
    ids.forEach((name, id) => {
      const outs = [1, 1, 8, 1, 1, 4][id]!;
      const text = `puzzle ${name}\nx = IN 0\nout ${Array(outs).fill("x").join(" ")}`;
      expect(assemble(text)[1]).toBe(id);
    });
  });

  it("splits CONST n into a = n >> 8 and b = n & 0xff", () => {
    expect(assemble("puzzle QUORUM7\nk = CONST 300\nout k").subarray(4, 8)).toEqual(bytes(1, 1, 44, 0));
    expect(assemble("puzzle QUORUM7\nk = CONST 0\nout k").subarray(4, 8)).toEqual(bytes(1, 0, 0, 0));
    expect(assemble("puzzle QUORUM7\nk = CONST 65535\nout k").subarray(4, 8)).toEqual(
      bytes(1, 255, 255, 0),
    );
  });

  it("resolves names to node indices in declaration order, for 2- and 3-operand ops", () => {
    const text = `
      puzzle QUORUM7
      x0 = IN 0
      x1 = IN 1
      x2 = IN 2
      lo = MIN x0 x1
      pick = SEL x2 lo x0
      out pick
    `;
    const p = assemble(text);
    expect(p.subarray(4 + 4 * 3, 4 + 4 * 4)).toEqual(bytes(6, 0, 1, 0)); // MIN 0 1
    expect(p.subarray(4 + 4 * 4, 4 + 4 * 5)).toEqual(bytes(12, 2, 3, 0)); // SEL 2 3 0
    expect(p[p.length - 1]).toBe(4);
  });

  it("accepts every opcode mnemonic", () => {
    const text = `
      puzzle QUORUM7
      a = IN 0
      b = CONST 5
      n2 = ADD a b
      n3 = SUB n2 a
      n4 = MUL n3 b
      n5 = DIV n4 b
      n6 = MIN n5 a
      n7 = MAX n6 b
      n8 = LT n7 a
      n9 = EQ n8 a
      n10 = AND n9 b
      n11 = OR n10 a
      n12 = SEL n11 n10 a
      out n12
    `;
    expect(validate(assemble(text))).toEqual({ ok: true });
  });

  it("ignores comments, blank lines and extra whitespace", () => {
    const text = "# header\n\n  puzzle   QUORUM7   # trailing\n\tx\t=\tIN   0\nout x # done\n\n";
    expect(assemble(text)).toEqual(bytes(1, 0, 1, 1, 0, 0, 0, 0, 0));
  });

  it("does not check puzzle-level validity: an out list of the wrong length still assembles", () => {
    const p = assemble("puzzle QUORUM7\nx = IN 0\nout x x");
    expect(p[3]).toBe(2);
    expect(validate(p)).toEqual({ ok: false, error: "BadOutCount" });
  });

  describe("errors name the offending line", () => {
    const bad: [string, string, RegExp][] = [
      ["missing puzzle line", "x = IN 0\nout x", /line 1.*puzzle/i],
      ["unknown puzzle", "puzzle NOPE\nx = IN 0\nout x", /line 1.*unknown puzzle/i],
      ["duplicate puzzle line", "puzzle SORT8\npuzzle SORT8", /line 2/],
      ["unknown opcode", "puzzle QUORUM7\nx = FOO 1\nout x", /line 2.*unknown op/i],
      ["lowercase opcode", "puzzle QUORUM7\nx = in 0\nout x", /line 2.*unknown op/i],
      ["too few operands", "puzzle QUORUM7\nx = IN 0\ny = ADD x\nout y", /line 3.*2 operand/i],
      ["too many operands", "puzzle QUORUM7\nx = IN 0\ny = ADD x x x\nout y", /line 3.*2 operand/i],
      ["SEL with two operands", "puzzle QUORUM7\nx = IN 0\ny = SEL x x\nout y", /line 3.*3 operand/i],
      ["undefined name", "puzzle QUORUM7\nx = IN 0\ny = ADD x z\nout y", /line 3.*unknown name 'z'/i],
      ["forward reference", "puzzle QUORUM7\ny = ADD x x\nx = IN 0\nout y", /line 2.*unknown name 'x'/i],
      ["duplicate name", "puzzle QUORUM7\nx = IN 0\nx = IN 1\nout x", /line 3.*already defined/i],
      ["reserved name 'out'", "puzzle QUORUM7\nout = IN 0\nout out", /line 2.*reserved/i],
      ["reserved name 'puzzle'", "puzzle QUORUM7\npuzzle = IN 0\nout puzzle", /line 2.*reserved/i],
      ["CONST above 65535", "puzzle QUORUM7\nk = CONST 65536\nout k", /line 2.*0\.\.65535/],
      ["CONST negative", "puzzle QUORUM7\nk = CONST -1\nout k", /line 2.*0\.\.65535/],
      ["CONST not a number", "puzzle QUORUM7\nk = CONST ten\nout k", /line 2.*0\.\.65535/],
      ["IN index above 255", "puzzle QUORUM7\nx = IN 256\nout x", /line 2.*0\.\.255/],
      ["IN with a name instead of a number", "puzzle QUORUM7\nx = IN y\nout x", /line 2.*0\.\.255/],
      ["no out line", "puzzle QUORUM7\nx = IN 0", /out/i],
      ["statement after out", "puzzle QUORUM7\nx = IN 0\nout x\ny = IN 1", /line 4.*after 'out'/i],
      ["out naming an unknown node", "puzzle QUORUM7\nx = IN 0\nout y", /line 3.*unknown name 'y'/i],
      ["missing '='", "puzzle QUORUM7\nx IN 0\nout x", /line 2/],
      ["bad identifier", "puzzle QUORUM7\n1x = IN 0\nout 1x", /line 2.*name/i],
    ];
    it.each(bad)("%s", (_label, text, pattern) => {
      expect(() => assemble(text)).toThrow(pattern);
    });

    it("rejects more nodes than a uint8 count can hold", () => {
      const lines = ["puzzle QUORUM7", ...Array.from({ length: 256 }, (_, i) => `n${i} = IN 0`), "out n0"];
      expect(() => assemble(lines.join("\n"))).toThrow(/255/);
    });

    it("rejects more output slots than a uint8 count can hold", () => {
      const text = `puzzle QUORUM7\nx = IN 0\nout ${Array(256).fill("x").join(" ")}`;
      expect(() => assemble(text)).toThrow(/255/);
    });
  });
});

describe("disassemble", () => {
  it("prints the minimal program", () => {
    expect(disassemble(bytes(1, 0, 1, 1, 0, 0, 0, 3, 0))).toBe("puzzle QUORUM7\nn0 = IN 3\nout n0\n");
  });

  it("prints CONST as a single number and SEL with three operands", () => {
    const text = disassemble(assemble("puzzle QUORUM7\na = CONST 300\nb = CONST 1\nc = SEL a b a\nout c"));
    expect(text).toBe("puzzle QUORUM7\nn0 = CONST 300\nn1 = CONST 1\nn2 = SEL n0 n1 n0\nout n2\n");
  });

  it("round-trips: assemble(disassemble(p)) is p", () => {
    const p = assemble(`
      puzzle SORT8
      a = IN 0
      b = IN 1
      lo = MIN a b
      hi = MAX a b
      k = CONST 7
      m = ADD lo k
      out lo hi m m lo hi m m
    `);
    expect(assemble(disassemble(p))).toEqual(p);
  });

  it("refuses programs that fail validation, naming the error", () => {
    expect(() => disassemble(bytes(2, 0, 1, 1, 0, 0, 0, 0, 0))).toThrow(/BadVersion/);
    expect(() => disassemble(bytes(1, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0))).toThrow(/DeadNode/);
  });
});
