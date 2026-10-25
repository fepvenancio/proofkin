// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/(site)/token/[id]/art/route";
import { getTokenArt } from "@/chain/art";
import { getCollection } from "@/chain/collection";

// `publicEnv` is read once, when `@/config/env` is first imported, so the variables must exist before the imports run.
vi.hoisted(() => {
  const settings = {
    NEXT_PUBLIC_CHAIN: "base",
    NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
});

vi.mock("@/chain/collection", () => ({ getCollection: vi.fn() }));
vi.mock("@/chain/art", () => ({ getTokenArt: vi.fn() }));

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const get = (id: string) =>
  GET(new Request(`https://proofkin.test/token/${id}/art`), { params: Promise.resolve({ id }) });

describe("GET /token/[id]/art", () => {
  it("serves the SVG as an image", async () => {
    vi.mocked(getTokenArt).mockResolvedValueOnce({ kind: "found", value: SVG });

    const response = await get("3");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SVG);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("stops anything in it from running if someone opens the address directly", async () => {
    vi.mocked(getTokenArt).mockResolvedValueOnce({ kind: "found", value: SVG });
    const policy = (await get("3")).headers.get("content-security-policy")!;
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("sandbox");
  });

  it("lets a browser keep it for minutes and a CDN for an hour, since a token's art rarely changes", async () => {
    vi.mocked(getTokenArt).mockResolvedValueOnce({ kind: "found", value: SVG });
    const cache = (await get("3")).headers.get("cache-control")!;
    expect(cache).toContain("public");
    expect(cache).toContain("max-age=300");
    expect(cache).toContain("s-maxage=3600");
  });

  it("asks for the token the address names", async () => {
    vi.mocked(getTokenArt).mockResolvedValueOnce({ kind: "found", value: SVG });
    await get("4");
    expect(vi.mocked(getTokenArt)).toHaveBeenCalledWith(expect.anything(), 4);
  });

  it("is not found for anything that is not a plain token number, or above the 300 the collection can hold, without asking the node", async () => {
    for (const bad of ["0", "03", "abc", "-1", "1.5", "301"]) {
      expect((await get(bad)).status).toBe(404);
    }
    expect(vi.mocked(getCollection)).not.toHaveBeenCalled();
    expect(vi.mocked(getTokenArt)).not.toHaveBeenCalled();
  });

  it("asks the contract about a token the cache has not seen yet, because one minted a moment ago is not a 404", async () => {
    vi.mocked(getTokenArt).mockResolvedValueOnce({ kind: "found", value: SVG });
    const response = await get("6");
    expect(response.status).toBe(200);
    expect(vi.mocked(getTokenArt)).toHaveBeenCalledWith(expect.anything(), 6);
  });

  it("does not read the collection at all: its cached supply is what made new tokens 404", async () => {
    vi.mocked(getTokenArt).mockResolvedValueOnce({ kind: "found", value: SVG });
    await get("3");
    expect(vi.mocked(getCollection)).not.toHaveBeenCalled();
  });

  it("is not found when the contract says the token does not exist, and keeps that answer only seconds", async () => {
    vi.mocked(getTokenArt).mockResolvedValueOnce({ kind: "missing" });
    const response = await get("250");
    expect(response.status).toBe(404);
    // a repeated probe of an unminted id should be answered by a CDN, not by the node, but a token minted a moment
    // later must not stay "missing" for long
    expect(response.headers.get("cache-control")).toBe("public, max-age=5, s-maxage=5");
  });

  it("is a bad gateway, and is never kept, when the chain cannot be read", async () => {
    vi.mocked(getTokenArt).mockResolvedValueOnce({ kind: "unavailable" });
    const response = await get("3");
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
