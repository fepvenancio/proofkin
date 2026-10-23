// The launch dry run (PLAN.md §10, milestone 5): mint the fixture solution of every puzzle on a deployment and
// read each token back through the renderer. It reuses the playground's own mint flow, so what it proves is what
// a player's browser would do. Meant for a testnet; it refuses Base mainnet, where every mint takes a public slot.
import { readFileSync } from "node:fs";
import { PUZZLE_NAMES } from "@proofkin/vm";
import { formatEther, type Hex } from "viem";
import { proofkinAbi } from "../src/abi.ts";
import { analyze } from "../src/analyze.ts";
import { checkProgram } from "../src/chain.ts";
import { fetchToken } from "../src/gallery.ts";
import { friendlyError, type MintDeps, phaseOf, prepareCommit, sendCommit, sendReveal } from "../src/mint.ts";

export interface DryRunResult {
  puzzle: string;
  outcome: "minted" | "skipped";
  nodeCount: number;
  tokenId?: number;
  commitTx?: Hex;
  revealTx?: Hex;
  revealGas?: bigint;
  /** Why a puzzle was skipped. */
  note?: string;
}

/** Waits of `pause` before giving up on a chain that is not making blocks. */
const MAX_WAITS = 300;

const fixtureProgram = (name: string) => {
  const text = readFileSync(new URL(`../../../fixtures/solutions/${name}.pk`, import.meta.url), "utf8");
  const a = analyze(text);
  if (!a.ok) throw new Error(`the ${name} fixture does not analyze: ${a.message}`);
  return { name, hex: a.hex, puzzleId: a.puzzleId, nodeCount: a.nodeCount };
};

export async function dryRunMints(
  deps: MintDeps,
  opts: { pause?: () => Promise<void>; onProgress?: (line: string) => void } = {},
): Promise<DryRunResult[]> {
  const { publicClient, walletClient, config } = deps;
  const pause = opts.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 1000)));
  const say = opts.onProgress ?? (() => {});

  if (config.name === "base") {
    throw new Error("A dry run mints real tokens, and on Base mainnet each one takes a slot from the public. Use Base Sepolia or a local chain.");
  }

  const account = walletClient.account.address;
  const programs = PUZZLE_NAMES.map(fixtureProgram);
  const statuses = await Promise.all(programs.map((p) => checkProgram(publicClient, config, p.hex)));

  const price = await publicClient.readContract({ address: config.proofkin, abi: proofkinAbi, functionName: "mintPrice" });
  const mints = statuses.filter((s) => s === "free").length;
  const balance = await publicClient.getBalance({ address: account });
  if (balance < price * BigInt(mints)) {
    throw new Error(`${account} holds ${formatEther(balance)} ETH, and the ${mints} mints cost ${formatEther(price * BigInt(mints))} ETH before gas.`);
  }

  const results: DryRunResult[] = [];
  for (const [i, p] of programs.entries()) {
    const status = statuses[i]!;
    if (status !== "free") {
      const note = status === "alreadyMinted" ? "this exact program is already minted" : "every slot of this puzzle is taken";
      say(`${p.name}: skipped, ${note}`);
      results.push({ puzzle: p.name, outcome: "skipped", nodeCount: p.nodeCount, note });
      continue;
    }

    try {
      say(`${p.name}: committing a ${p.nodeCount}-node program`);
      const committed = await sendCommit(deps, await prepareCommit(deps, { program: p.hex, puzzleId: p.puzzleId, nodeCount: p.nodeCount }));
      say(`${p.name}: committed in block ${committed.commitBlock}, waiting for the reveal window`);
      for (let waits = 0; (await phaseOf(deps, committed)).phase === "waiting"; waits++) {
        if (waits >= MAX_WAITS) throw new Error("the chain is not making blocks");
        await pause();
      }

      const revealed = await sendReveal(deps, committed);
      if (revealed.tokenId === undefined || revealed.revealTx === undefined) throw new Error("the reveal gave no Solved event");
      const receipt = await publicClient.getTransactionReceipt({ hash: revealed.revealTx });

      const token = await fetchToken(publicClient, config, revealed.tokenId);
      const trait = (name: string) => token.attributes.find((a) => a.trait === name)?.value;
      if (trait("Puzzle") !== p.name || trait("Nodes") !== p.nodeCount) {
        throw new Error(`token #${revealed.tokenId} reads back as ${trait("Puzzle")} with ${trait("Nodes")} nodes`);
      }

      say(`${p.name}: minted token #${revealed.tokenId}, the reveal used ${receipt.gasUsed} gas`);
      results.push({
        puzzle: p.name,
        outcome: "minted",
        nodeCount: p.nodeCount,
        tokenId: revealed.tokenId,
        commitTx: committed.commitTx,
        revealTx: revealed.revealTx,
        revealGas: receipt.gasUsed,
      });
    } catch (e) {
      throw new Error(`${p.name}: ${friendlyError(e)}`);
    }
  }
  return results;
}
