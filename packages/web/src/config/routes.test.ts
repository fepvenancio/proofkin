import { PUZZLE_INFO } from "@proofkin/core";
import { describe, expect, it } from "vitest";

import {
  currentSection,
  PAGE_SIZE,
  pageCount,
  pageOf,
  paths,
  parseGalleryQuery,
  parseTokenId,
  puzzleFromSlug,
  puzzleSlug,
} from "@/config/routes";

describe("puzzle slugs", () => {
  it("are the puzzle's name in lower case, with a hyphen for an underscore", () => {
    expect(PUZZLE_INFO.map((p) => puzzleSlug(p.id))).toEqual([
      "quorum7",
      "median5",
      "sort8",
      "grid-path",
      "knapsack3",
      "fair-split4",
    ]);
  });

  it("find the puzzle again", () => {
    for (const p of PUZZLE_INFO) expect(puzzleFromSlug(puzzleSlug(p.id))).toBe(p.id);
  });

  it("refuse anything that is not exactly a slug, so one puzzle has one address", () => {
    for (const bad of ["SORT8", "sort-8", "grid_path", "", " sort8", "sort8/", "7", "__proto__", "constructor"]) {
      expect(puzzleFromSlug(bad)).toBeUndefined();
    }
  });
});

describe("parseTokenId", () => {
  it("accepts a whole number from 1 up to what has been minted", () => {
    expect(parseTokenId("1", 5)).toBe(1);
    expect(parseTokenId("5", 5)).toBe(5);
  });

  it("refuses an id nobody has minted, zero included (ids start at 1)", () => {
    expect(parseTokenId("6", 5)).toBeUndefined();
    expect(parseTokenId("0", 5)).toBeUndefined();
    expect(parseTokenId("1", 0)).toBeUndefined();
  });

  it("refuses anything but the plain spelling, so a token has one address", () => {
    for (const bad of ["03", "3.0", "-1", "+3", " 3", "3 ", "0x3", "1e1", "abc", "", "99999999999999999999"]) {
      expect(parseTokenId(bad, 100)).toBeUndefined();
    }
  });

  it("does not need the supply, which may be a minute old: the most the collection can hold is the bound", () => {
    expect(parseTokenId("250")).toBe(250);
    expect(parseTokenId("300")).toBe(300);
    expect(parseTokenId("0")).toBeUndefined();
  });

  it("refuses an id the collection can never hold: 6 puzzles of 50 slots make 300", () => {
    expect(parseTokenId("301")).toBeUndefined();
    expect(parseTokenId("9999")).toBeUndefined();
  });
});

describe("parseGalleryQuery", () => {
  it("shows everything, from the first page, when asked for nothing", () => {
    expect(parseGalleryQuery({})).toEqual({ page: 1 });
  });

  it("reads a puzzle by its slug and a page by its number", () => {
    expect(parseGalleryQuery({ puzzle: "sort8", page: "3" })).toEqual({ puzzle: 2, page: 3 });
  });

  it("ignores a puzzle it does not know, rather than showing an empty gallery", () => {
    expect(parseGalleryQuery({ puzzle: "chess" })).toEqual({ page: 1 });
    expect(parseGalleryQuery({ puzzle: "2" })).toEqual({ page: 1 });
  });

  it("falls back to the first page for anything that is not a page number", () => {
    for (const bad of ["0", "-2", "abc", "2.5", "", "07", "99999999999999999999"]) {
      expect(parseGalleryQuery({ page: bad })).toEqual({ page: 1 });
    }
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseGalleryQuery({ puzzle: ["median5", "sort8"], page: ["2", "9"] })).toEqual({ puzzle: 1, page: 2 });
  });
});

describe("paging", () => {
  it("has one page even when there is nothing to show", () => {
    expect(pageCount(0)).toBe(1);
  });

  it("rounds up, and a full page is not followed by an empty one", () => {
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
    expect(pageCount(300)).toBe(13);
  });

  it("takes a page of a list, in order", () => {
    const list = Array.from({ length: 50 }, (_, i) => i);
    expect(pageOf(list, 1)).toEqual(list.slice(0, 24));
    expect(pageOf(list, 3)).toEqual([48, 49]);
    expect(pageOf(list, 4)).toEqual([]);
  });
});

describe("paths", () => {
  it("builds each page's address", () => {
    expect(paths.home).toBe("/");
    expect(paths.token(7)).toBe("/token/7");
    expect(paths.art(7)).toBe("/token/7/art");
    expect(paths.puzzle(3)).toBe("/puzzles/grid-path");
    expect(paths.solve(3)).toBe("/puzzles/grid-path/solve");
  });

  it("leaves the default out of the gallery address", () => {
    expect(paths.gallery({ page: 1 })).toBe("/gallery");
    expect(paths.gallery({ puzzle: 2, page: 1 })).toBe("/gallery?puzzle=sort8");
    expect(paths.gallery({ page: 4 })).toBe("/gallery?page=4");
    expect(paths.gallery({ puzzle: 5, page: 2 })).toBe("/gallery?puzzle=fair-split4&page=2");
  });

  it("round-trips through parseGalleryQuery", () => {
    for (const query of [{ page: 1 }, { puzzle: 0, page: 5 }, { puzzle: 5, page: 1 }]) {
      const url = new URL(paths.gallery(query), "https://example.test");
      expect(parseGalleryQuery(Object.fromEntries(url.searchParams))).toEqual(query);
    }
  });
});

describe("currentSection", () => {
  it("puts the home page and the puzzle pages under Puzzles", () => {
    expect(currentSection("/")).toBe("puzzles");
    expect(currentSection("/puzzles/sort8")).toBe("puzzles");
    expect(currentSection("/puzzles/sort8/solve")).toBe("puzzles");
  });

  it("puts the gallery and the token pages under Gallery", () => {
    expect(currentSection("/gallery")).toBe("gallery");
    expect(currentSection("/token/3")).toBe("gallery");
  });

  it("does not mistake a path that merely starts the same way", () => {
    expect(currentSection("/galleryx")).toBeUndefined();
    expect(currentSection("/tokens")).toBeUndefined();
    expect(currentSection("/puzzlesque")).toBeUndefined();
    expect(currentSection("/elsewhere")).toBeUndefined();
  });
});
