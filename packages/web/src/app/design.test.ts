// @vitest-environment node
import { readFileSync } from "node:fs";

import { PUZZLE_HUES } from "@proofkin/core";
import { describe, expect, it } from "vitest";

import { walletTheme } from "@/config/walletTheme";

/** The stylesheet that ships, read as text: the tests judge the values a visitor gets, not a copy of them. */
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function declared(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!match) throw new Error(`globals.css does not declare ${name}`);
  return match[1]!.trim();
}

/* //////////////////////////////////////////////////////////////
                         WCAG CONTRAST
//////////////////////////////////////////////////////////////*/

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)];
}

function luminance([r, g, b]: Rgb): number {
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/* //////////////////////////////////////////////////////////////
                              TESTS
//////////////////////////////////////////////////////////////*/

describe("the palette", () => {
  it("is the one the design plan names", () => {
    expect({
      paper: declared("--color-paper"),
      plate: declared("--color-plate"),
      ink: declared("--color-ink"),
      graphite: declared("--color-graphite"),
      rule: declared("--color-rule"),
      record: declared("--color-record"),
    }).toEqual({
      paper: "#eceef1",
      plate: "#0a0d14",
      ink: "#171b2a",
      graphite: "#586072",
      rule: "#cbd0d8",
      record: "#a87d12",
    });
  });
});

describe("contrast on the paper", () => {
  const paper = hexToRgb(declared("--color-paper"));

  it("reads body text at AAA", () => {
    expect(contrast(hexToRgb(declared("--color-ink")), paper)).toBeGreaterThanOrEqual(7);
  });

  it("reads secondary text at AA", () => {
    expect(contrast(hexToRgb(declared("--color-graphite")), paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("lets a plate stand clear of the page, so the art is the light on it", () => {
    expect(contrast(hexToRgb(declared("--color-plate")), paper)).toBeGreaterThanOrEqual(12);
  });

  it("shows the record ring as a graphical object, at 3:1", () => {
    expect(contrast(hexToRgb(declared("--color-record")), paper)).toBeGreaterThanOrEqual(3);
  });

  it.each(PUZZLE_HUES.map((hue, id) => [id, hue] as const))("reads puzzle %i's hue (%i) as text at AA", (_id, hue) => {
    const ink = hslToRgb(
      hue,
      Number.parseFloat(declared("--puzzle-ink-s")),
      Number.parseFloat(declared("--puzzle-ink-l")),
    );
    expect(contrast(ink, paper)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("a puzzle's mark on the paper", () => {
  const paper = hexToRgb(declared("--color-paper"));

  it.each(PUZZLE_HUES.map((hue, id) => [id, hue] as const))(
    "shows puzzle %i's slot mark (%i) as a graphical object, at 3:1",
    (_id, hue) => {
      const mark = hslToRgb(
        hue,
        Number.parseFloat(declared("--puzzle-mark-s")),
        Number.parseFloat(declared("--puzzle-mark-l")),
      );
      expect(contrast(mark, paper)).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("contrast on a plate", () => {
  const plate = hexToRgb(declared("--color-plate"));

  it.each(PUZZLE_HUES.map((hue, id) => [id, hue] as const))("reads puzzle %i's hue (%i) as text at AA", (_id, hue) => {
    const glow = hslToRgb(
      hue,
      Number.parseFloat(declared("--puzzle-glow-s")),
      Number.parseFloat(declared("--puzzle-glow-l")),
    );
    expect(contrast(glow, plate)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the wallet button", () => {
  it("wears the page's ink on its paper instead of RainbowKit's blue, so the puzzles' hues stay the only colour", () => {
    expect(walletTheme.colors.accentColor.toLowerCase()).toBe(declared("--color-ink"));
    expect(walletTheme.colors.accentColorForeground.toLowerCase()).toBe(declared("--color-paper"));
  });

  it("reads its label at AAA", () => {
    const button = contrast(
      hexToRgb(walletTheme.colors.accentColorForeground),
      hexToRgb(walletTheme.colors.accentColor),
    );
    expect(button).toBeGreaterThanOrEqual(7);
  });
});
