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
  it("names the two fixed edge cases after what they are", () => {
    expect(describeTrial(0, 0)).toBe("the first edge case: all seven votes 0, with t = 7");
    expect(describeTrial(0, 1)).toBe("the second edge case: all seven votes 1, with t = 1");
  });
  it("numbers the random cases from 1", () => {
    expect(describeTrial(0, 2)).toBe("random case 1");
    expect(describeTrial(0, 101)).toBe("random case 100");
  });
});
