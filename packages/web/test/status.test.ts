// @vitest-environment node
import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

const app = (path: string) => new URL(`../src/app/${path}`, import.meta.url);

/**
 * Every route that can answer "not found", and the two folders above them: a loading file in the app root or in the
 * site's group would wrap them all.
 */
const ROUTES = ["", "(site)", "(site)/gallery", "(site)/puzzles/[slug]", "(site)/token/[id]"];

describe("a missing token, puzzle or page is a 404", () => {
  // A `loading` file makes Next.js send the page's shell before the page has read anything, with status 200, so a
  // later `notFound()` becomes a 200 with a "noindex" tag: a soft 404, even for a crawler. The data is cached for a
  // minute, so there is little to show while waiting, and the right status is worth more than a skeleton.
  it.each(ROUTES)("has no loading file at /%s", (route) => {
    for (const extension of ["tsx", "ts", "jsx", "js"]) {
      expect(existsSync(app(`${route ? `${route}/` : ""}loading.${extension}`))).toBe(false);
    }
  });
});
