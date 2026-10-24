import { unstable_cache } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { CACHE_SECONDS, cachedRead } from "@/chain/cache";
import { requireAppConfig } from "@/config/env";

// Outside a Next.js server there is no cache to ask, so the stand-in runs the function and records how it was set up.
vi.mock("next/cache", () => ({ unstable_cache: vi.fn((read: () => Promise<unknown>) => read) }));

const env = {
  NEXT_PUBLIC_CHAIN: "base",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
};
const app = requireAppConfig(env);
const other = requireAppConfig({ ...env, NEXT_PUBLIC_PROOFKIN: "0x0000000000000000000000000000000000000001" });

const keyOf = () => vi.mocked(unstable_cache).mock.calls.at(-1)![1] as string[];

describe("cachedRead", () => {
  it("hands back what the read returns", async () => {
    await expect(cachedRead(app, "answer", async () => ({ n: 42 }), ["t"])).resolves.toEqual({ n: 42 });
  });

  it("keeps a minute of the answer, so one visitor's page view is the next visitor's cache hit", async () => {
    await cachedRead(app, "answer", async () => 1, ["answer"]);
    expect(CACHE_SECONDS).toBe(60);
    expect(vi.mocked(unstable_cache).mock.calls.at(-1)![2]).toEqual({ revalidate: 60, tags: ["answer"] });
  });

  it("keys the answer by what was asked, the chain and the collection, so two deployments never share one", async () => {
    await cachedRead(app, "solved", async () => 1, []);
    const base = keyOf();
    await cachedRead(app, "collection", async () => 1, []);
    const otherName = keyOf();
    await cachedRead(other, "solved", async () => 1, []);
    const otherDeployment = keyOf();

    expect(base).toContain("solved");
    expect(base).toContain(String(app.chain.id));
    expect(base).toContain(app.proofkin);
    expect(otherName).not.toEqual(base);
    expect(otherDeployment).not.toEqual(base);
  });

  it("refuses data a cache cannot hold, because the cache stores JSON and a bigint would fail there, not here", () => {
    // @ts-expect-error a bigint is not JSON
    void cachedRead(app, "price", async () => 10n ** 16n, []).catch(() => undefined);
  });
});
