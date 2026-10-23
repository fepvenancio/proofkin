import { describe, expect, it } from "vitest";
import { describeTrial, formatDuration, formatEth, labelledInputs, shortAddress, slotsLeft } from "../src/format.ts";

describe("shortAddress", () => {
  it("keeps the start and end, which is how people recognise an address", () => {
    expect(shortAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8")).toBe("0x7099…79C8");
  });
  it("leaves anything too short alone", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
  });
});

describe("formatDuration", () => {
  it("counts seconds up to a minute and a half, then rounds to minutes", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(89)).toBe("89 s");
    expect(formatDuration(90)).toBe("about 2 min");
    expect(formatDuration(494)).toBe("about 8 min");
  });
});

describe("formatEth", () => {
  it("drops trailing zeros and names the unit", () => {
    expect(formatEth(10_000_000_000_000_000n)).toBe("0.01 ETH");
    expect(formatEth(1_500_000_000_000_000_000n)).toBe("1.5 ETH");
    expect(formatEth(0n)).toBe("0 ETH");
  });
});

describe("slotsLeft", () => {
  it("is what remains of a puzzle's 50 slots, never negative", () => {
    expect(slotsLeft(0)).toBe(50);
    expect(slotsLeft(17)).toBe(33);
    expect(slotsLeft(50)).toBe(0);
    expect(slotsLeft(51)).toBe(0);
  });
});

describe("labelledInputs", () => {
  it("pairs each input with the name the puzzle gives it", () => {
    expect(labelledInputs(4, [3, 4, 4, 5, 5, 6, 9])).toEqual([
      { label: "w0", value: 3 },
      { label: "v0", value: 4 },
      { label: "w1", value: 4 },
      { label: "v1", value: 5 },
      { label: "w2", value: 5 },
      { label: "v2", value: 6 },
      { label: "cap", value: 9 },
    ]);
  });
});

describe("describeTrial", () => {
  it("names the fixed edge cases after what they are", () => {
    expect(describeTrial(0, 0)).toBe("the first edge case: all seven votes 0, with t = 1");
    expect(describeTrial(0, 1)).toBe("the second edge case: all seven votes 1, with t = 7");
  });
  it("finds a puzzle's further fixed cases at trial 10 and up", () => {
    expect(describeTrial(3, 10)).toMatch(/^the third edge case: .*right, right, down, down/);
    expect(describeTrial(3, 15)).toMatch(/^the eighth edge case: .*down, down, right, right/);
    expect(describeTrial(2, 11)).toMatch(/^the fourth edge case: /);
    expect(describeTrial(4, 12)).toMatch(/^the fifth edge case: .*item 2/);
  });
  it("numbers the random cases from 1, skipping the trials that are fixed", () => {
    expect(describeTrial(0, 2)).toBe("random case 1");
    expect(describeTrial(0, 9)).toBe("random case 8");
    expect(describeTrial(0, 10)).toBe("random case 9"); // QUORUM7 has nothing fixed past trial 1
    expect(describeTrial(0, 101)).toBe("random case 100");
    expect(describeTrial(3, 9)).toBe("random case 8");
    expect(describeTrial(3, 16)).toBe("random case 9"); // GRID_PATH's trials 10..15 are fixed
    expect(describeTrial(3, 107)).toBe("random case 100");
  });
});
