// Shared by the tests that talk to the local Anvil chain started in global-setup.ts.
import { readFileSync } from "node:fs";
import { type Account, type Address, type Chain, createPublicClient, createTestClient, createWalletClient, type Hex, http, type PublicClient, type Transport, type WalletClient } from "viem";
import { foundry } from "viem/chains";
import { afterAll, afterEach, beforeEach } from "vitest";
import { analyze } from "../analyze.ts";
import { type AppConfig, parseConfig } from "../config.ts";
import { deployContracts, startAnvil } from "./local-chain.ts";

export const solutionText = (name: string) =>
  readFileSync(new URL(`../../../../fixtures/solutions/${name}.pk`, import.meta.url), "utf8");

/** A fixture solution (or an edited copy of its text) as the bytes the contract takes. */
export function programOf(text: string): { program: Uint8Array; hex: Hex; puzzleId: number; nodeCount: number } {
  const a = analyze(text);
  if (!a.ok) throw new Error(`test program does not analyze: ${a.message}`);
  return { program: a.program, hex: a.hex, puzzleId: a.puzzleId, nodeCount: a.nodeCount };
}

/** A different byte string with the same behaviour: swaps the operands of the k-th commutative node for each bit set in `mask`. */
export function swapVariant(program: Uint8Array, mask: number): Uint8Array {
  const q = Uint8Array.from(program);
  let k = 0;
  for (let i = 0; i < program[2]!; i++) {
    const at = 4 + 4 * i;
    const commutative = [2, 4, 6, 7, 9, 10, 11].includes(program[at]!) && program[at + 1] !== program[at + 2];
    if (!commutative) continue;
    if ((mask >> k) & 1) [q[at + 1], q[at + 2]] = [program[at + 2]!, program[at + 1]!];
    k++;
  }
  return q;
}

export interface Kit {
  config: AppConfig;
  publicClient: PublicClient;
  testClient: ReturnType<typeof createTestClient>;
  accounts: Address[];
  walletFor(account: Address): WalletClient<Transport, Chain, Account>;
}

/**
 * A private Anvil chain with the real contracts deployed, for the calling test file alone. Files run in
 * parallel, so sharing one chain would let one file's snapshot/revert pull the state out from under another.
 */
export async function makeKit(): Promise<Kit> {
  const running = await startAnvil();
  afterAll(() => running.stop());
  const d = await deployContracts(running.rpcUrl);
  const parsed = parseConfig({
    VITE_CHAIN: "anvil",
    VITE_RPC_URL: running.rpcUrl,
    VITE_PROOFKIN: d.proofkin,
    VITE_RENDERER: d.renderer,
    VITE_DEPLOY_BLOCK: String(d.deployBlock),
  });
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  const transport = http(running.rpcUrl);
  const publicClient = createPublicClient({ chain: foundry, transport, pollingInterval: 50 });
  const testClient = createTestClient({ chain: foundry, mode: "anvil", transport });
  const accounts = await createWalletClient({ chain: foundry, transport }).getAddresses();
  return {
    config: parsed.config,
    publicClient,
    testClient,
    accounts,
    walletFor: (account) => createWalletClient({ account, chain: foundry, transport, pollingInterval: 50 }),
  };
}

/** Every test in the calling file starts from the chain as it was deployed. */
export function isolateChain(kit: Kit): void {
  let id: Hex | undefined;
  beforeEach(async () => {
    id = await kit.testClient.snapshot();
  });
  afterEach(async () => {
    if (id) await kit.testClient.revert({ id });
  });
}

/** The same behaviour with `extra` more nodes: appends `MAX x x` nodes after the node behind output slot 0 and points that slot at the last. */
export function padVariant(program: Uint8Array, extra: number): Uint8Array {
  const n = program[2]!;
  const outCount = program[3]!;
  const q = new Uint8Array(program.length + 4 * extra);
  q.set(program.subarray(0, 4 + 4 * n));
  q[2] = n + extra;

  let prev = program[4 + 4 * n]!; // output slot 0
  for (let j = 0; j < extra; j++) {
    const at = 4 + 4 * (n + j);
    q.set([7, prev, prev, 0], at); // MAX prev prev
    prev = n + j;
  }
  const outputsAt = 4 + 4 * (n + extra);
  q.set(program.subarray(4 + 4 * n, 4 + 4 * n + outCount), outputsAt);
  if (extra > 0) q[outputsAt] = prev;
  return q;
}
