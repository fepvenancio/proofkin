import { readFileSync } from "node:fs";
// The wrong GRID_PATH program comes from the vm package's own test support, which is not part of its public API.
import { gridPathSource } from "../../vm/src/cheats.ts";
import { assemble, fixedTrials, inputs, reference, run, trialCount } from "@proofkin/vm";
import { describe, expect, it } from "vitest";
import { LOCAL_RANDOM_TRIALS, randomSeed, runLocalTest } from "../src/localTest.ts";

const solution = (name: string) =>
  assemble(readFileSync(new URL(`../../../fixtures/solutions/${name}.pk`, import.meta.url), "utf8"));
const source = (name: string) => readFileSync(new URL(`../../../fixtures/solutions/${name}.pk`, import.meta.url), "utf8");

const SEED = "0x00000000000000000000000000000000000000000000000000000000000000aa" as const;

describe("runLocalTest", () => {
  it("passes every fixture solution on all of the puzzle's fixed cases and 100 random ones", () => {
    expect(LOCAL_RANDOM_TRIALS).toBe(100);
    const names = ["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"];
    names.forEach((name, id) => {
      const cases = fixedTrials(id).length + 100;
      expect(runLocalTest(solution(name), { seed: SEED }), name).toEqual({ status: "pass", seed: SEED, cases });
    });
    expect(names.map((_, id) => fixedTrials(id).length + 100)).toEqual([102, 102, 104, 108, 108, 102]);
  });

  it("reports the first failing case, in trial order, with what was expected and what came out", () => {
    // QUORUM7 with `sum < t` turned into `t < sum`: wrong on the very first edge case
    const broken = assemble(source("QUORUM7").replace("LT s6 t", "LT t s6"));
    const r = runLocalTest(broken, { seed: SEED });
    expect(r).toMatchObject({
      status: "fail",
      failure: { trial: 0, kind: "wrong", inputs: [0, 0, 0, 0, 0, 0, 0, 1], expected: [0], got: [1] },
    });
  });

  it("catches a program that passes the two tie cases and only fails a later one", () => {
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

  it("runs the further fixed cases too, so a program that only they catch cannot pass", () => {
    // GRID_PATH that never considers the path right, right, down, down. It is right on most inputs, so for
    // some seeds it passes all eight random trials and only the further fixed case for that path fails it.
    const program = assemble(gridPathSource({ skip: 0 }));
    const passesTheRandomOnes = (seed: `0x${string}`) =>
      Array.from({ length: 8 }, (_, k) => k + 2).every((t) => {
        const x = inputs(3, seed, t);
        return run(program, x).outputs.join() === reference(3, x).join();
      });
    const seed = Array.from({ length: 300 }, (_, n) => `0x${(n + 1).toString(16).padStart(64, "0")}` as const).find(passesTheRandomOnes);
    if (seed === undefined) throw new Error("no seed lets the wrong program through the random trials");

    const r = runLocalTest(program, { seed });
    if (r.status !== "fail") throw new Error("expected a failure");
    expect(r.failure.trial).toBe(10); // the case in which right, right, down, down is the one cheapest path
    expect(r.failure.expected).toEqual([10]);
    expect(trialCount(3)).toBeGreaterThan(r.failure.trial);
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
