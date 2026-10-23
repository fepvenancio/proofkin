import { describe, expect, it } from "vitest";

import { getServerClient } from "@/chain/server";
import { requireAppConfig } from "@/config/env";

const app = requireAppConfig({
  NEXT_PUBLIC_CHAIN: "base",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
});

describe("getServerClient", () => {
  it("reads the configured chain", () => {
    expect(getServerClient(app, {}).chain?.id).toBe(8453);
  });

  it("uses the server-only RPC URL when there is one, and the public one otherwise", () => {
    expect(getServerClient(app, { RPC_URL: "https://keyed.example/abc" }).transport.url).toBe(
      "https://keyed.example/abc",
    );
    expect(getServerClient(app, {}).transport.url).toBe(app.rpcUrl);
  });
});
