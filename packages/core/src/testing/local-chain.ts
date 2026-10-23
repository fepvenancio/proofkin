// A throwaway local chain: Anvil plus the real contracts, deployed from the Foundry artifacts in out/.
// Used by the test setup and by `pnpm dev:chain`. Anvil's accounts are unlocked, so no key is needed.
import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import {
  type Abi,
  type Address,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  getAddress,
  type Hex,
  http,
  parseEther,
} from "viem";
import { foundry } from "viem/chains";

export interface RunningChain {
  rpcUrl: string;
  stop(): Promise<void>;
}

export interface Deployment {
  proofkin: Address;
  renderer: Address;
  owner: Address;
  /** Block the collection was deployed in: where the gallery starts reading events. */
  deployBlock: number;
  mintPrice: bigint;
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

async function waitUntilReady(rpcUrl: string, child: ChildProcess): Promise<void> {
  let exited = false;
  child.once("exit", () => (exited = true));
  for (let attempt = 0; attempt < 100; attempt++) {
    if (exited) throw new Error("anvil exited before it was ready (is `anvil` installed?)");
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("anvil did not come up within 10 seconds");
}

/** `blockTimeSeconds` makes blocks appear on their own (needed to watch a reveal window in a browser). */
export async function startAnvil(opts: { port?: number; blockTimeSeconds?: number } = {}): Promise<RunningChain> {
  const port = opts.port ?? (await freePort());
  const args = ["--port", String(port), "--host", "127.0.0.1", "--silent"];
  if (opts.blockTimeSeconds) args.push("--block-time", String(opts.blockTimeSeconds));

  const child = spawn("anvil", args, { stdio: "ignore" });
  const rpcUrl = `http://127.0.0.1:${port}`;
  try {
    await waitUntilReady(rpcUrl, child);
  } catch (e) {
    child.kill();
    throw e;
  }
  return {
    rpcUrl,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

const artifact = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../../out/${name}.sol/${name}.json`, import.meta.url), "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };

export async function deployContracts(rpcUrl: string, opts: { mintPrice?: bigint } = {}): Promise<Deployment> {
  const mintPrice = opts.mintPrice ?? parseEther("0.01");
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const [unlocked] = await createWalletClient({ chain: foundry, transport: http(rpcUrl) }).getAddresses();
  if (!unlocked) throw new Error("the chain has no unlocked accounts");
  const owner = getAddress(unlocked);
  const wallet = createWalletClient({ account: owner, chain: foundry, transport: http(rpcUrl) });

  const deploy = async (name: string, args: unknown[] = []) => {
    const { abi, bytecode } = artifact(name);
    const hash = await wallet.sendTransaction({ data: encodeDeployData({ abi, bytecode: bytecode.object, args }) });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error(`deploying ${name} did not create a contract`);
    return { address: getAddress(receipt.contractAddress), block: Number(receipt.blockNumber) };
  };

  const renderer = await deploy("Renderer");
  const proofkin = await deploy("Proofkin", [owner, renderer.address, mintPrice]);
  return { proofkin: proofkin.address, renderer: renderer.address, owner, deployBlock: proofkin.block, mintPrice };
}
