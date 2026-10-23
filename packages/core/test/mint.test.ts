import { assemble } from "@proofkin/vm";
import { bytesToHex, ContractFunctionRevertedError, custom, createWalletClient, encodeErrorResult, type Hex, parseEther } from "viem";
import { foundry } from "viem/chains";
import { describe, expect, it } from "vitest";
import { proofkinAbi } from "../src/abi.ts";
import { currentBlock } from "../src/chain.ts";
import { friendlyError, type MintDeps, phaseOf, prepareCommit, reconcile, sendCommit, sendReveal } from "../src/mint.ts";
import { PendingStore } from "../src/storage.ts";
import { isolateChain, makeKit, programOf, solutionText } from "../src/testing/kit.ts";
import { MemoryStorage } from "../src/testing/memoryStorage.ts";

const kit = await makeKit();
isolateChain(kit);
const { publicClient, testClient, config } = kit;
const [, alice, bob] = kit.accounts as [`0x${string}`, `0x${string}`, `0x${string}`];

function depsFor(account: `0x${string}`, storage = new MemoryStorage()): MintDeps & { storage: MemoryStorage } {
  return { publicClient, walletClient: kit.walletFor(account), config, store: new PendingStore(storage), storage };
}

const sort8 = programOf(solutionText("SORT8"));
const input = (p: { hex: Hex; puzzleId: number; nodeCount: number }) => ({ program: p.hex, puzzleId: p.puzzleId, nodeCount: p.nodeCount });

const read = <F extends "ownerOf" | "totalSupply" | "commitBlock">(functionName: F, args: readonly unknown[] = []) =>
  publicClient.readContract({ address: config.proofkin, abi: proofkinAbi, functionName, args } as never) as Promise<unknown>;

describe("the whole flow: prepare, commit, wait, reveal", () => {
  it("mints a token to the account that solved it", async () => {
    const d = depsFor(alice);

    const prepared = await prepareCommit(d, input(sort8));
    expect(prepared).toMatchObject({ status: "prepared", account: alice, contract: config.proofkin, chainId: 31337, puzzleId: 2, nodeCount: 46, program: sort8.hex });
    expect(prepared.salt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(d.store.get(prepared.hash)).toEqual(prepared); // written down before anything is sent

    const committed = await sendCommit(d, prepared);
    expect(committed.status).toBe("committed");
    expect(committed.commitBlock).toBe(Number(await read("commitBlock", [committed.hash])));
    expect(d.store.get(committed.hash)).toEqual(committed);

    expect(await phaseOf(d, committed)).toEqual({ phase: "waiting", blocksUntilReady: 3 });
    await testClient.mine({ blocks: 2 });
    expect(await phaseOf(d, committed)).toEqual({ phase: "waiting", blocksUntilReady: 1 });
    await testClient.mine({ blocks: 1 });
    expect(await phaseOf(d, committed)).toEqual({ phase: "ready", blocksLeft: 246 });

    const revealed = await sendReveal(d, committed);
    expect(revealed).toMatchObject({ status: "revealed", tokenId: 1 });
    expect(revealed.revealTx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(d.store.get(revealed.hash)).toEqual(revealed);

    expect(await read("ownerOf", [1n])).toBe(alice);
    expect(await read("totalSupply")).toBe(1n);
    const balance = await publicClient.getBalance({ address: config.proofkin });
    expect(balance).toBe(parseEther("0.01")); // the mint price, paid exactly
  });
});

describe("the end of the reveal window", () => {
  it("accepts a reveal sent with exactly one block to spare", async () => {
    const d = depsFor(alice);
    const committed = await sendCommit(d, await prepareCommit(d, input(sort8)));
    await testClient.mine({ blocks: 249 }); // the latest block is commitBlock + 249
    expect(await phaseOf(d, committed)).toEqual({ phase: "ready", blocksLeft: 0 });

    // sent now, it is mined in commitBlock + 250: the last block Proofkin accepts
    const revealed = await sendReveal(d, committed);
    expect(revealed.status).toBe("revealed");
    expect(await read("totalSupply")).toBe(1n);
  });

  it("refuses one block later without sending anything, because the reveal could only land too late", async () => {
    const d = depsFor(alice);
    const committed = await sendCommit(d, await prepareCommit(d, input(sort8)));
    await testClient.mine({ blocks: 250 }); // the latest block is commitBlock + 250
    expect(await phaseOf(d, committed)).toEqual({ phase: "expired" });

    const before = await currentBlock(publicClient);
    const failure = await sendReveal(d, committed).catch((e: unknown) => e);
    expect(friendlyError(failure)).toMatch(/250-block/);
    expect(await currentBlock(publicClient)).toBe(before); // no transaction, no gas spent
    expect(await read("totalSupply")).toBe(0n);
  });
});

describe("a closed tab, a refusing wallet, a lost receipt", () => {
  it("keeps the salt when the wallet refuses to send the commit", async () => {
    const storage = new MemoryStorage();
    const real = kit.walletFor(alice);
    const refusing = createWalletClient({
      account: real.account,
      chain: foundry,
      transport: custom({
        request: async ({ method, params }: { method: string; params?: unknown }) => {
          if (method === "eth_sendTransaction") throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          return publicClient.request({ method, params } as never);
        },
      }),
    });
    const d = { ...depsFor(alice, storage), walletClient: refusing };

    const prepared = await prepareCommit(d, input(sort8));
    const failure = await sendCommit(d, prepared).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(failure).toBeDefined();
    expect(friendlyError(failure)).toMatch(/rejected/i);
    expect(d.store.get(prepared.hash)).toMatchObject({ status: "prepared", salt: prepared.salt });
    expect(await read("commitBlock", [prepared.hash])).toBe(0n);
  });

  it("resumes from storage in a fresh session and still reveals", async () => {
    const storage = new MemoryStorage();
    const first = depsFor(alice, storage);
    const committed = await sendCommit(first, await prepareCommit(first, input(sort8)));
    await testClient.mine({ blocks: 3 });

    // "reload the page": new store over the same browser storage, nothing else carried over
    const second = depsFor(alice, storage);
    const found = second.store.list({ chainId: 31337, contract: config.proofkin, account: alice });
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual(committed);

    const revealed = await sendReveal(second, found[0]!);
    expect(revealed.status).toBe("revealed");
    expect(await read("ownerOf", [1n])).toBe(alice);
  });

  it("reconciles a commit that landed while the page was closed", async () => {
    const d = depsFor(alice);
    const prepared = await prepareCommit(d, input(sort8));

    // the transaction goes through, but this page never hears about it
    const { request } = await publicClient.simulateContract({ address: config.proofkin, abi: proofkinAbi, functionName: "commit", args: [prepared.hash], account: alice });
    await publicClient.waitForTransactionReceipt({ hash: await d.walletClient.writeContract(request) });
    expect(d.store.get(prepared.hash)?.status).toBe("prepared");

    const fixedUp = await reconcile(d, prepared);
    expect(fixedUp.status).toBe("committed");
    expect(fixedUp.commitBlock).toBe(Number(await read("commitBlock", [prepared.hash])));
    expect(d.store.get(prepared.hash)).toEqual(fixedUp);
  });

  it("leaves a commit that really never landed as prepared", async () => {
    const d = depsFor(alice);
    const prepared = await prepareCommit(d, input(sort8));
    expect(await reconcile(d, prepared)).toEqual(prepared);
  });
});

describe("what the contract says no to, in words a player can use", () => {
  async function committedAndReady(account: `0x${string}`, p: { hex: Hex; puzzleId: number; nodeCount: number } = sort8) {
    const d = depsFor(account);
    const committed = await sendCommit(d, await prepareCommit(d, input(p)));
    return { d, committed };
  }

  it("too early: refuses before sending anything", async () => {
    const { d, committed } = await committedAndReady(alice);
    const before = await currentBlock(publicClient);
    const failure = await sendReveal(d, committed).catch((e: unknown) => e);
    expect(friendlyError(failure)).toMatch(/too early/i);
    expect(await currentBlock(publicClient)).toBe(before); // simulated, never sent
    expect(await read("totalSupply")).toBe(0n);
  });

  it("expired: says to commit again", async () => {
    const { d, committed } = await committedAndReady(alice);
    await testClient.mine({ blocks: 251 });
    expect(await phaseOf(d, committed)).toEqual({ phase: "expired" });
    const failure = await sendReveal(d, committed).catch((e: unknown) => e);
    expect(friendlyError(failure)).toMatch(/250-block.*passed|window.*passed/i);
    expect(friendlyError(failure)).toMatch(/commit again/i);
  });

  it("someone else's commit: no commit for this account", async () => {
    const { committed } = await committedAndReady(alice);
    await testClient.mine({ blocks: 3 });
    const failure = await sendReveal(depsFor(bob), committed).catch((e: unknown) => e);
    expect(friendlyError(failure)).toMatch(/no commit/i);
  });

  it("a program that is already minted", async () => {
    const first = await committedAndReady(alice);
    await testClient.mine({ blocks: 3 });
    await sendReveal(first.d, first.committed);

    const second = await committedAndReady(bob); // bob's commit is a different hash, so it is accepted...
    await testClient.mine({ blocks: 3 });
    const failure = await sendReveal(second.d, second.committed).catch((e: unknown) => e);
    expect(friendlyError(failure)).toMatch(/already been minted/i); // ...but the program is taken
  });

  it("a solution the contract's own trials reject, naming the trial", async () => {
    const broken = programOf(solutionText("QUORUM7").replace("LT s6 t", "LT t s6"));
    const { d, committed } = await committedAndReady(alice, broken);
    await testClient.mine({ blocks: 3 });
    const failure = await sendReveal(d, committed).catch((e: unknown) => e);
    expect(friendlyError(failure)).toMatch(/trial 0/i);
    expect(friendlyError(failure)).toMatch(/edge case/i);
  });

  it("a program that is not valid at all", async () => {
    // two nodes, only the first is read: node 1 is dead code. The assembler does not mind; the contract does.
    const bytes = assemble("puzzle QUORUM7\nused = IN 0\nspare = IN 1\nout used");
    const dead = { hex: bytesToHex(bytes), puzzleId: 0, nodeCount: 2 };
    const { d, committed } = await committedAndReady(alice, dead);
    await testClient.mine({ blocks: 3 });
    const failure = await sendReveal(d, committed).catch((e: unknown) => e);
    expect(friendlyError(failure)).toMatch(/not valid/i);
    expect(friendlyError(failure)).toMatch(/node 1/i);
  });
});

describe("friendlyError", () => {
  it("passes an ordinary error's message through", () => {
    expect(friendlyError(new Error("boom"))).toBe("boom");
  });

  it("calls trials 0, 1 and 10 up the fixed edge cases, and trials 2 to 9 random cases", () => {
    const failedAt = (trial: bigint) =>
      new ContractFunctionRevertedError({
        abi: proofkinAbi,
        data: encodeErrorResult({ abi: proofkinAbi, errorName: "SolveFailed", args: [trial] }),
        functionName: "reveal",
      });
    expect(friendlyError(failedAt(0n))).toMatch(/trial 0 \(one of the fixed edge cases\)/);
    expect(friendlyError(failedAt(1n))).toMatch(/trial 1 \(one of the fixed edge cases\)/);
    expect(friendlyError(failedAt(2n))).toMatch(/trial 2 \(one of its random cases\)/);
    expect(friendlyError(failedAt(9n))).toMatch(/trial 9 \(one of its random cases\)/);
    // the contract only ever reports a trial its puzzle has, so from 10 on it is one of the further fixed cases
    expect(friendlyError(failedAt(10n))).toMatch(/trial 10 \(one of the fixed edge cases\)/);
    expect(friendlyError(failedAt(15n))).toMatch(/trial 15 \(one of the fixed edge cases\)/);
  });

  it("copes with things that are not errors", () => {
    expect(friendlyError("plain string")).toBe("plain string");
    expect(friendlyError(undefined)).toMatch(/something went wrong/i);
  });
});
