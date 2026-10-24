// @vitest-environment node
import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";
import { getClient } from "wagmi/actions";

import { requireAppConfig } from "@/config/env";
import { createWagmiConfig } from "@/config/wagmi";

import type { AddressInfo } from "node:net";

const ANSWERS: Record<string, string> = { eth_chainId: "0x7a69", eth_blockNumber: "0x10", eth_gasPrice: "0x1" };

/** A node that counts how many HTTP requests reach it, and how many calls each carried. */
async function node() {
  const requests: number[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const parsed = JSON.parse(body) as { id: number; method: string } | { id: number; method: string }[];
      const calls = Array.isArray(parsed) ? parsed : [parsed];
      requests.push(calls.length);
      const answers = calls.map((call) => ({ jsonrpc: "2.0", id: call.id, result: ANSWERS[call.method] }));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(Array.isArray(parsed) ? answers : answers[0]));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

describe("the wagmi configuration's connection to the chain", () => {
  let open: { close: () => Promise<unknown> } | undefined;
  afterEach(async () => {
    await open?.close();
  });

  it("sends the reads of one moment to the node as one request, which a public RPC counts once", async () => {
    const chain = (open = await node());
    const app = requireAppConfig({
      NEXT_PUBLIC_CHAIN: "anvil",
      NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      NEXT_PUBLIC_RPC_URL: chain.url,
    });
    const client = getClient(createWagmiConfig({ app, server: true }), { chainId: app.chain.id })!;

    await Promise.all([
      client.request({ method: "eth_chainId" }),
      client.request({ method: "eth_blockNumber" }),
      client.request({ method: "eth_gasPrice" }),
    ]);

    expect(chain.requests).toEqual([3]);
  });
});
