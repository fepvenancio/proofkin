import { type CollectionState, readCollection } from "@proofkin/core";
import { HttpRequestError } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tryReadCollection } from "@/chain/collection";
import { requireAppConfig } from "@/config/env";

vi.mock("@proofkin/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@proofkin/core")>()),
  readCollection: vi.fn(),
}));

const app = requireAppConfig({
  NEXT_PUBLIC_CHAIN: "base",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
});

const state: CollectionState = {
  mintPrice: 10n ** 16n,
  totalSupply: 3n,
  solvedCount: [2, 1, 0, 0, 0, 0],
  bestNodes: [17, 15, 255, 255, 255, 255],
};

describe("tryReadCollection", () => {
  let log: ReturnType<typeof vi.spyOn>;
  const logged = () => log.mock.calls.flat().map(String).join(" ");

  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("hands back the collection when the chain answers, and logs nothing", async () => {
    vi.mocked(readCollection).mockResolvedValueOnce(state);
    await expect(tryReadCollection(app, {})).resolves.toBe(state);
    expect(vi.mocked(readCollection)).toHaveBeenCalledWith(expect.anything(), app);
    expect(log).not.toHaveBeenCalled();
  });

  it("returns undefined, rather than throwing, when the chain cannot be read", async () => {
    vi.mocked(readCollection).mockRejectedValueOnce(new Error("boom"));
    await expect(tryReadCollection(app, {})).resolves.toBeUndefined();
  });

  it("logs the cause on the server, naming the chain, so the page can stay short", async () => {
    vi.mocked(readCollection).mockRejectedValueOnce(new Error("boom"));
    await tryReadCollection(app, {});
    expect(logged()).toContain("Base");
    expect(logged()).toContain("boom");
  });

  it("logs what went wrong with the request, and never the URL it went to", async () => {
    const failure = new HttpRequestError({
      url: "https://rpc.example/v2/SECRETKEY",
      body: { method: "eth_call" },
      details: "fetch failed",
    });
    // viem repeats the URL in `message`, and a provider URL usually carries its API key.
    expect(failure.message).toContain("SECRETKEY");
    vi.mocked(readCollection).mockRejectedValueOnce(failure);

    await tryReadCollection(app, {});

    expect(logged()).toContain("HTTP request failed.");
    expect(logged()).toContain("fetch failed");
    expect(logged()).not.toContain("SECRETKEY");
  });
});
