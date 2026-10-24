// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";

import { fetchToken, proofkinAbi, type TokenView } from "@proofkin/core";
import { ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTokenArt, isSafeSvg } from "@/chain/art";
import { requireAppConfig } from "@/config/env";

vi.mock("@proofkin/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@proofkin/core")>()),
  fetchToken: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_cache: (read: () => Promise<unknown>) => read }));

const app = requireAppConfig({
  NEXT_PUBLIC_CHAIN: "base",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
});

/** The six creatures the contract draws, as the renderer's snapshot tests pin them. */
const RENDERS = new URL("../../../../fixtures/renders/", import.meta.url);
const renders = readdirSync(RENDERS)
  .filter((name) => name.endsWith(".svg"))
  .map((name) => [name, readFileSync(new URL(name, RENDERS), "utf8")] as const);

const view = (svg: string): TokenView => ({
  name: "Proofkin #1",
  description: "",
  attributes: [],
  imageSrc: "data:",
  svg,
});

describe("isSafeSvg", () => {
  it("has the six real creatures to judge", () => {
    expect(renders).toHaveLength(6);
  });

  it.each(renders)("accepts the contract's own art: %s", (_name, svg) => {
    expect(isSafeSvg(svg)).toBe(true);
  });

  const art = renders[0]![1];
  const inject = (markup: string) => art.replace("</svg>", `${markup}</svg>`);

  it.each([
    ["a script", inject("<script>alert(1)</script>")],
    ["a script in any case", inject("<SCRIPT>alert(1)</SCRIPT>")],
    ["a foreignObject", inject("<foreignObject><div/></foreignObject>")],
    ["an embedded image", inject('<image width="1" height="1"/>')],
    ["a use of another document", inject("<use/>")],
    ["a link", inject("<a>x</a>")],
    ["an href", inject('<rect href="https://evil.example"/>')],
    ["an event handler", inject('<rect onload="alert(1)"/>')],
    ["an event handler after a newline", inject('<rect\nonclick = "alert(1)"/>')],
    ["a javascript url", inject('<rect fill="javascript:alert(1)"/>')],
    ["a style import", inject("<style>@import 'https://evil.example/x.css';</style>")],
    ["a paint from elsewhere", inject('<rect fill="url(https://evil.example/x.svg#a)"/>')],
    ["a paint from a quoted elsewhere", inject("<rect fill=\"url('https://evil.example/x.svg#a')\"/>")],
    ["a data url paint", inject('<rect fill="url(data:image/svg+xml,x)"/>')],
  ])("refuses %s", (_what, svg) => {
    expect(isSafeSvg(svg)).toBe(false);
  });

  it("refuses anything that is not a whole SVG document", () => {
    expect(isSafeSvg("<html></html>")).toBe(false);
    expect(isSafeSvg("")).toBe(false);
    expect(isSafeSvg(art.slice(0, -10))).toBe(false);
    expect(isSafeSvg(`<p>x</p>${art}`)).toBe(false);
  });
});

describe("getTokenArt", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("hands back the SVG the contract draws", async () => {
    vi.mocked(fetchToken).mockResolvedValueOnce(view(renders[0]![1]));
    await expect(getTokenArt(app, 1, {})).resolves.toEqual({ kind: "found", value: renders[0]![1] });
  });

  it("asks for the token it was given", async () => {
    vi.mocked(fetchToken).mockResolvedValueOnce(view(renders[0]![1]));
    await getTokenArt(app, 7, {});
    expect(vi.mocked(fetchToken)).toHaveBeenCalledWith(expect.anything(), app, 7);
  });

  it("says a token is missing when the contract does", async () => {
    const data = encodeErrorResult({ abi: proofkinAbi, errorName: "TokenDoesNotExist" });
    const reverted = new ContractFunctionRevertedError({ abi: proofkinAbi, data, functionName: "tokenURI" });
    vi.mocked(fetchToken).mockRejectedValueOnce(
      new ContractFunctionExecutionError(reverted, { abi: proofkinAbi, functionName: "tokenURI", args: [9n] }),
    );
    await expect(getTokenArt(app, 9, {})).resolves.toEqual({ kind: "missing" });
  });

  it("is unavailable, and says why in the log, when the chain cannot be read", async () => {
    vi.mocked(fetchToken).mockRejectedValueOnce(new Error("boom"));
    await expect(getTokenArt(app, 1, {})).resolves.toEqual({ kind: "unavailable" });
    expect(log.mock.calls.flat().map(String).join(" ")).toContain("boom");
  });

  it("refuses to serve an image that is not safe, however the contract came to draw it", async () => {
    vi.mocked(fetchToken).mockResolvedValueOnce(view("<svg><script>alert(1)</script></svg>"));
    await expect(getTokenArt(app, 1, {})).resolves.toEqual({ kind: "unavailable" });
    expect(log.mock.calls.flat().map(String).join(" ")).toMatch(/not safe/i);
  });
});
