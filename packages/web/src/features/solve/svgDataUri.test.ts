import { describe, expect, it } from "vitest";

import { svgDataUri } from "@/features/solve/svgDataUri";

const decode = (uri: string) => {
  const binary = atob(uri.slice("data:image/svg+xml;base64,".length));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

describe("svgDataUri", () => {
  it("is an image data address, which a browser draws without running anything in it", () => {
    expect(svgDataUri("<svg/>")).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("round-trips the markup exactly", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>a & b < c</text></svg>';
    expect(decode(svgDataUri(svg))).toBe(svg);
  });

  it("keeps characters outside ASCII, which btoa alone would refuse", () => {
    const svg = "<svg><text>− × ÷ ✓ 日本</text></svg>";
    expect(decode(svgDataUri(svg))).toBe(svg);
  });
});
