import { readFileSync } from "node:fs";
import { assemble, inputs, reference, run } from "@proofkin/vm";
import { describe, expect, it } from "vitest";
import { LOCAL_RANDOM_TRIALS, randomSeed, runLocalTest } from "../src/localTest.ts";

const solution = (name: string) =>
  assemble(readFileSync(new URL(`../../../fixtures/solutions/${name}.pk`, import.meta.url), "utf8"));
const source = (name: string) => readFileSync(new URL(`../../../fixtures/solutions/${name}.pk`, import.meta.url), "utf8");

const SEED = "0x00000000000000000000000000000000000000000000000000000000000000aa" as const;

describe("runLocalTest", () => {
  it("passes every fixture solution on the 2 fixed and 100 random cases", () => {
    expect(LOCAL_RANDOM_TRIALS).toBe(100);
    for (const name of ["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"]) {
      expect(runLocalTest(solution(name), { seed: SEED }), name).toEqual({ status: "pass", seed: SEED, cases: 102 });
    }
  });

  it("reports the first failing case, in trial order, with what was expected and what came out", () => {
    // QUORUM7 with `sum < t` turned into `t < sum`: wrong on the very first edge case
    const broken = assemble(source("QUORUM7").replace("LT s6 t", "LT t s6"));
    const r = runLocalTest(broken, { seed: SEED });
    expect(r).toMatchObject({
      status: "fail",
      failure: { trial: 0, kind: "wrong", inputs: [0, 0, 0, 0, 0, 0, 0, 7], expected: [0], got: [1] },
    });
  });

  it("catches a program that passes both edge cases and only fails a random one", () => {
    // GRID_PATH with its first MIN turned into MAX: identical results while every edge weighs the same
    const text = source("GRID_PATH").replace("= MIN", "= MAX");
    const r = runLocalTest(assemble(text), { seed: SEED });
    if (r.status !== "fail") throw new Error("expected a failure");
    expect(r.failure.trial).toBeGreaterThanOrEqual(2);
    expect(r.failure.kind).toBe("wrong");

    // it really is the first failing trial: everything before it agrees with the reference
    const program = assemble(text);
    for (let trial = 0; trial < r.failure.trial; trial++) {
      const x = inputs(3, SEED, trial);
      expect(run(program, x).outputs, `trial ${trial}`).toEqual(reference(3, x));
    }
    // and the report's own numbers are consistent
    expect(r.failure.inputs).toEqual(inputs(3, SEED, r.failure.trial));
    expect(r.failure.expected).toEqual(reference(3, r.failure.inputs));
    expect(r.failure.got).not.toEqual(r.failure.expected);
  });

  it("reports an arithmetic failure as its own kind", () => {
    // a vote (0 or 1) minus 255 underflows
    const program = assemble("puzzle QUORUM7\nv = IN 0\nk = CONST 255\nd = SUB v k\nout d");
    expect(runLocalTest(program, { seed: SEED })).toMatchObject({
      status: "fail",
      failure: { trial: 0, kind: "arithmetic", got: null },
    });
  });

  it("is deterministic for a seed and different seeds draw different random cases", () => {
    const p = solution("SORT8");
    expect(runLocalTest(p, { seed: SEED })).toEqual(runLocalTest(p, { seed: SEED }));

    const broken = assemble(source("GRID_PATH").replace("= MIN", "= MAX"));
    const trials = new Set(
      [1, 2, 3, 4, 5, 6].map((n) => {
        const r = runLocalTest(broken, { seed: `0x${n.toString(16).padStart(64, "0")}` });
        return r.status === "fail" ? JSON.stringify(r.failure.inputs) : "pass";
      }),
    );
    expect(trials.size).toBeGreaterThan(1);
  });

  it("uses a fresh random seed when none is given, and reports it so a failure can be reproduced", () => {
    const r = runLocalTest(solution("MEDIAN5"));
    expect(r.status).toBe("pass");
    if (r.status === "pass") expect(r.seed).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("randomSeed", () => {
  it("is 32 random bytes as hex", () => {
    const a = randomSeed();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(randomSeed()).not.toBe(a);
  });

  it("takes its randomness from the source it is given", () => {
    const fixed = (buf: Uint8Array) => buf.fill(0xab);
    expect(randomSeed(fixed)).toBe(`0x${"ab".repeat(32)}`);
  });
});
