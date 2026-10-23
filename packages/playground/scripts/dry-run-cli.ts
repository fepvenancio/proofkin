// `pnpm launch:dry-run`: mint the fixture solution of every puzzle on a deployment, to prove it works end to end.
//
// The deployment comes from the same VITE_* settings the page reads (what Deploy.s.sol prints; the package script
// also loads .env.local). The signer is PRIVATE_KEY from the shell: a throwaway TESTNET key, never one that holds
// real funds. It is not read from any file, and never printed.
import { createWalletClient, formatEther, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PendingStore, makePublicClient, parseConfig } from "@proofkin/core";
import { dryRunMints } from "./dry-run.ts";

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const parsed = parseConfig(process.env);
if (!parsed.ok) fail(["The deployment is not configured:", ...parsed.problems.map((p) => `  ${p}`)].join("\n"));
const config = parsed.ok ? parsed.config : fail("unreachable");

const key = process.env.PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  fail("PRIVATE_KEY must be a 0x-prefixed 32-byte hex key: a throwaway testnet key, never one that holds real funds.");
}
const account = privateKeyToAccount(key as Hex);
const publicClient = makePublicClient(config);
const walletClient = createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl), pollingInterval: config.pollingIntervalMs });

const chainId = await publicClient.getChainId();
if (chainId !== config.chain.id) fail(`${config.rpcUrl} answers with chain id ${chainId}, but VITE_CHAIN=${config.name} is ${config.chain.id}.`);

console.log(`chain       ${config.name} (${chainId})`);
console.log(`collection  ${config.proofkin}`);
console.log(`account     ${account.address}  holding ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);
console.log("");

try {
  const results = await dryRunMints({ publicClient, walletClient, config, store: new PendingStore(undefined) }, { onProgress: (line) => console.log(line) });
  const minted = results.filter((r) => r.outcome === "minted");

  console.log("");
  console.log(`${minted.length} minted, ${results.length - minted.length} skipped.`);
  for (const r of minted) console.log(`  #${r.tokenId}  ${r.puzzle.padEnd(12)} ${String(r.nodeCount).padStart(2)} nodes  reveal ${r.revealGas} gas`);
  const held = await publicClient.getBalance({ address: config.proofkin });
  console.log(`The collection now holds ${formatEther(held)} ETH of fees; its owner can take them back with withdraw().`);
} catch (e) {
  fail(`The dry run stopped: ${e instanceof Error ? e.message : String(e)}`);
}
