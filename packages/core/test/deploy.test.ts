import {
  type Address,
  type Chain,
  createPublicClient,
  createTestClient,
  createWalletClient,
  getAddress,
  type Hex,
  http,
  UserRejectedRequestError,
  zeroAddress,
} from "viem";
import { base, baseSepolia, foundry, mainnet } from "viem/chains";
import { afterEach, describe, expect, it } from "vitest";
import { proofkinAbi } from "../src/abi.ts";
import type { Reader } from "../src/chain.ts";
import { parseConfig } from "../src/config.ts";
import {
  DeployError,
  DeployStore,
  envBlock,
  expectedProofkinRuntime,
  type DeployDeps,
  launchedOf,
  LAUNCH_MINT_PRICE,
  prepareDeploy,
  runDeploy,
  sendProofkin,
  sendRenderer,
  verifyDeployment,
} from "../src/launch/index.ts";
import { friendlyError } from "../src/mint.ts";
import { MemoryStorage } from "../src/testing/memoryStorage.ts";
import { startAnvil, type RunningChain } from "../src/testing/local-chain.ts";
import type { Wallet } from "../src/wallet.ts";

const running: RunningChain[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((chain) => chain.stop()));
});

/** An empty chain, and the three accounts the tests use: the one that sends (0), the one that will own (1), a stranger (2). */
async function emptyChain() {
  const chain = await startAnvil();
  running.push(chain);
  const transport = http(chain.rpcUrl);
  const publicClient = createPublicClient({ chain: foundry, transport, pollingInterval: 50 });
  const testClient = createTestClient({ chain: foundry, mode: "anvil", transport });
  const [sender, owner, stranger] = (await createWalletClient({ chain: foundry, transport }).getAddresses()) as [
    Address,
    Address,
    Address,
  ];
  const walletFor = (account: Address, over: Chain = foundry) =>
    createWalletClient({ account, chain: over, transport, pollingInterval: 50 }) as unknown as Wallet;
  const store = new DeployStore(new MemoryStorage());
  const deps = (over: Partial<DeployDeps> = {}): DeployDeps => ({
    publicClient: publicClient as unknown as Reader,
    walletClient: walletFor(sender),
    store,
    ...over,
  });
  const nonce = () => publicClient.getTransactionCount({ address: sender });
  return { chain, publicClient, testClient, sender, owner, stranger, walletFor, store, deps, nonce };
}

describe("deploying the renderer and the collection", () => {
  it("leaves a collection owned by the account named, which is not the one that sent it, and tells the site how to find it", async () => {
    const t = await emptyChain();
    const pending = await prepareDeploy(t.deps(), { owner: t.owner });
    const done = await runDeploy(t.deps(), pending);

    expect(done.status).toBe("done");
    const read = <N extends "owner" | "renderer" | "mintPrice" | "rendererLocked" | "totalSupply">(functionName: N) =>
      t.publicClient.readContract({ address: done.proofkin!, abi: proofkinAbi, functionName });
    expect(await read("owner")).toBe(t.owner);
    expect(await read("renderer")).toBe(done.renderer);
    expect(await read("mintPrice")).toBe(LAUNCH_MINT_PRICE);
    expect(await read("rendererLocked")).toBe(false);
    expect(await read("totalSupply")).toBe(0n);
    expect(await t.nonce()).toBe(2); // the renderer, then the collection: nothing else

    // the settings it prints are ones the site accepts, and point at what was deployed
    const launched = launchedOf(done)!;
    const env = Object.fromEntries(envBlock(launched).split("\n").map((line) => line.split("=") as [string, string]));
    const parsed = parseConfig({ ...env, NEXT_PUBLIC_RPC_URL: t.chain.rpcUrl }, "NEXT_PUBLIC_");
    if (!parsed.ok) throw new Error(parsed.problems.join("; "));
    expect(parsed.config).toMatchObject({ proofkin: done.proofkin, renderer: done.renderer });
    expect(parsed.config.deployBlock).toBe(BigInt(done.proofkinBlock!));
  });

  it("saves its progress as it goes, so the record is there before the collection is", async () => {
    const t = await emptyChain();
    const pending = await prepareDeploy(t.deps(), { owner: t.owner });
    expect(t.store.get(foundry.id, t.sender)).toMatchObject({ status: "prepared", owner: t.owner });

    const afterRenderer = await sendRenderer(t.deps(), pending);
    expect(afterRenderer).toMatchObject({ status: "renderer", renderer: expect.stringMatching(/^0x/) });
    expect(t.store.get(foundry.id, t.sender)).toEqual(afterRenderer);
    expect(afterRenderer.proofkin).toBeUndefined();
  });

  describe("what it refuses before sending anything", () => {
    it("a wallet on a chain it does not deploy to", async () => {
      const t = await emptyChain();
      await expect(prepareDeploy(t.deps({ walletClient: t.walletFor(t.sender, mainnet) }), { owner: t.owner })).rejects.toThrow(
        /chain 1/,
      );
      expect(t.store.list(1)).toEqual([]);
      expect(await t.nonce()).toBe(0);
    });

    it("an owner that is not an address, and the zero address, which could never administer anything", async () => {
      const t = await emptyChain();
      await expect(prepareDeploy(t.deps(), { owner: zeroAddress })).rejects.toThrow(DeployError);
      await expect(prepareDeploy(t.deps(), { owner: "0x1234" as Address })).rejects.toThrow(/address/);
      expect(t.store.list(foundry.id)).toEqual([]);
    });

    it("Base mainnet until it has been confirmed, and then allows it", async () => {
      const t = await emptyChain();
      const mainnetWallet = t.walletFor(t.sender, base);
      await expect(prepareDeploy(t.deps({ walletClient: mainnetWallet }), { owner: t.owner })).rejects.toThrow(/confirm/i);
      await expect(
        prepareDeploy(t.deps({ walletClient: mainnetWallet }), { owner: t.owner, mainnetConfirmed: false }),
      ).rejects.toThrow(/confirm/i);
      expect(t.store.list(base.id)).toEqual([]);
      const pending = await prepareDeploy(t.deps({ walletClient: mainnetWallet }), { owner: t.owner, mainnetConfirmed: true });
      expect(pending.chainId).toBe(8453);
    });

    it("a second deployment while one is on record for this account, which would lose where the first is", async () => {
      const t = await emptyChain();
      await prepareDeploy(t.deps(), { owner: t.owner });
      await expect(prepareDeploy(t.deps(), { owner: t.stranger })).rejects.toThrow(/already/);
      expect(t.store.get(foundry.id, t.sender)?.owner).toBe(t.owner);
    });

    it("a deployment whose gas cannot be estimated, so nothing is spent on it", async () => {
      const t = await emptyChain();
      const pending = await prepareDeploy(t.deps(), { owner: t.owner });
      const broken = { ...t.publicClient, estimateGas: async () => { throw new Error("execution reverted"); } } as unknown as Reader;
      await expect(sendRenderer(t.deps({ publicClient: broken }), pending)).rejects.toThrow(/reverted/);
      expect(await t.nonce()).toBe(0);
      expect(t.store.get(foundry.id, t.sender)?.rendererTx).toBeUndefined();
    });
  });

  describe("coming back", () => {
    it("after the renderer was deployed and the tab closed, sends the collection only, to the same renderer", async () => {
      const t = await emptyChain();
      const first = await sendRenderer(t.deps(), await prepareDeploy(t.deps(), { owner: t.owner }));
      expect(await t.nonce()).toBe(1);

      // a new tab: nothing in memory but what the store holds
      const done = await runDeploy(t.deps(), t.store.get(foundry.id, t.sender)!);
      expect(done.renderer).toBe(first.renderer);
      expect(done.status).toBe("done");
      expect(await t.nonce()).toBe(2);
    });

    it("after the wallet refused the second transaction, sends only that one again", async () => {
      const t = await emptyChain();
      const real = t.walletFor(t.sender);
      let calls = 0;
      const refusing = {
        ...real,
        account: real.account,
        chain: real.chain,
        sendTransaction: async (args: Parameters<Wallet["sendTransaction"]>[0]) => {
          if (++calls === 2) throw new UserRejectedRequestError(new Error("denied"));
          return real.sendTransaction(args);
        },
      } as unknown as Wallet;

      const pending = await prepareDeploy(t.deps({ walletClient: refusing }), { owner: t.owner });
      const failure = await runDeploy(t.deps({ walletClient: refusing }), pending).catch((e: unknown) => e);
      expect(friendlyError(failure)).toBe("You rejected the request in your wallet.");
      const record = t.store.get(foundry.id, t.sender)!;
      expect(record.status).toBe("renderer");
      expect(record.proofkinTx).toBeUndefined(); // nothing was sent, so there is no transaction to wait for next time
      expect(await t.nonce()).toBe(1);

      const done = await runDeploy(t.deps(), t.store.get(foundry.id, t.sender)!);
      expect(done.status).toBe("done");
      expect(await t.nonce()).toBe(2);
    });

    it("after the collection was sent but the tab closed before it was mined, waits for that transaction and does not send another", async () => {
      const t = await emptyChain();
      const afterRenderer = await sendRenderer(t.deps(), await prepareDeploy(t.deps(), { owner: t.owner }));

      await t.testClient.setAutomine(false);
      void sendProofkin(t.deps(), afterRenderer).catch(() => undefined); // the first tab, which is then closed
      for (let i = 0; i < 100 && !t.store.get(foundry.id, t.sender)?.proofkinTx; i++) await new Promise((r) => setTimeout(r, 50));
      expect(t.store.get(foundry.id, t.sender)?.proofkinTx).toBeDefined();

      const resumed = runDeploy(t.deps(), t.store.get(foundry.id, t.sender)!);
      await t.testClient.mine({ blocks: 1 });
      await t.testClient.setAutomine(true);
      expect((await resumed).status).toBe("done");
      expect(await t.nonce()).toBe(2);
    });
  });

  describe("who may carry a launch on", () => {
    it("only the account that began it, whose name it asks to be switched back to", async () => {
      const t = await emptyChain();
      const pending = await prepareDeploy(t.deps(), { owner: t.owner });
      const other = t.deps({ walletClient: t.walletFor(t.stranger) });
      await expect(sendRenderer(other, pending)).rejects.toThrow(new RegExp(`started by ${t.sender}`));
      await expect(runDeploy(other, pending)).rejects.toThrow(DeployError);
      expect(await t.nonce()).toBe(0);
    });

    it("only on the chain it began on", async () => {
      const t = await emptyChain();
      const pending = await prepareDeploy(t.deps(), { owner: t.owner });
      const elsewhere = t.deps({ walletClient: t.walletFor(t.sender, baseSepolia) });
      await expect(sendRenderer(elsewhere, pending)).rejects.toThrow(/on chain 31337; the wallet is on chain 84532/);
      expect(await t.nonce()).toBe(0);
    });

    it("and the collection only after the renderer", async () => {
      const t = await emptyChain();
      const pending = await prepareDeploy(t.deps(), { owner: t.owner });
      await expect(sendProofkin(t.deps(), pending)).rejects.toThrow(/renderer comes first/);
      expect(await t.nonce()).toBe(0);
    });
  });

  describe("what it checks on the chain afterwards", () => {
    it("code that is not the compiled code, which it does not call a deployment", async () => {
      const t = await emptyChain();
      const lying = {
        ...t.publicClient,
        getCode: async (args: { address: Address }) =>
          (await t.publicClient.getCode(args)) === undefined ? undefined : ("0x6001600155" as Hex),
      } as unknown as Reader;
      const pending = await prepareDeploy(t.deps({ publicClient: lying }), { owner: t.owner });
      await expect(runDeploy(t.deps({ publicClient: lying }), pending)).rejects.toThrow(/code/);
      expect(t.store.get(foundry.id, t.sender)?.status).not.toBe("done");
      // it stops at the renderer: a collection is not deployed on top of a renderer that is not the one that was built
      expect(await t.nonce()).toBe(1);
    });

    it("a collection whose code is not the compiled code, however the renderer checks out, and does not call the launch done", async () => {
      const t = await emptyChain();
      const wrongCollection = {
        ...t.publicClient,
        getCode: async (args: { address: Address }) => {
          const real = await t.publicClient.getCode(args);
          return real?.toLowerCase() === expectedProofkinRuntime(LAUNCH_MINT_PRICE).toLowerCase() ? ("0x6001600155" as Hex) : real;
        },
      } as unknown as Reader;
      const pending = await prepareDeploy(t.deps({ publicClient: wrongCollection }), { owner: t.owner });
      await expect(runDeploy(t.deps({ publicClient: wrongCollection }), pending)).rejects.toThrow(/is not the collection that was built/);
      const record = t.store.get(foundry.id, t.sender)!;
      expect(record.status).toBe("renderer");
      expect(record.proofkin).toBeUndefined();
    });

    it("a collection that points at a renderer other than the one meant, even when that one is the compiled renderer", async () => {
      const t = await emptyChain();
      const done = await runDeploy(t.deps(), await prepareDeploy(t.deps(), { owner: t.owner }));
      // a second, perfectly good renderer, which this collection does not use
      const spare = await sendRenderer(
        t.deps({ walletClient: t.walletFor(t.stranger) }),
        await prepareDeploy(t.deps({ walletClient: t.walletFor(t.stranger) }), { owner: t.owner }),
      );
      const verdict = await verifyDeployment(t.deps().publicClient, { proofkin: done.proofkin!, renderer: spare.renderer!, owner: t.owner });
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.problems.join("\n")).toMatch(/uses the renderer at/);
    });

    it("a collection whose owner is not the one that was meant", async () => {
      const t = await emptyChain();
      const done = await runDeploy(t.deps(), await prepareDeploy(t.deps(), { owner: t.owner }));
      const wrong = await verifyDeployment(t.deps().publicClient, {
        proofkin: done.proofkin!,
        renderer: done.renderer!,
        owner: t.stranger,
      });
      expect(wrong.ok).toBe(false);
      if (!wrong.ok) expect(wrong.problems.join("\n")).toMatch(/owner/);
      const right = await verifyDeployment(t.deps().publicClient, {
        proofkin: done.proofkin!,
        renderer: done.renderer!,
        owner: t.owner,
      });
      expect(right).toEqual({ ok: true });
    });

    it("a collection that points at another renderer, or sits at an address with no code", async () => {
      const t = await emptyChain();
      const done = await runDeploy(t.deps(), await prepareDeploy(t.deps(), { owner: t.owner }));
      const other = await verifyDeployment(t.deps().publicClient, {
        proofkin: done.proofkin!,
        renderer: getAddress(t.stranger),
        owner: t.owner,
      });
      expect(other.ok).toBe(false);
      if (!other.ok) expect(other.problems.join("\n")).toMatch(/renderer/i);

      const empty = await verifyDeployment(t.deps().publicClient, { proofkin: t.stranger, renderer: done.renderer!, owner: t.owner });
      expect(empty.ok).toBe(false);
      if (!empty.ok) expect(empty.problems.join("\n")).toMatch(/no code|code/);
    });
  });
});

describe("the record of a deployment", () => {
  it("is kept for one chain and one account, whatever the case of the address", async () => {
    const t = await emptyChain();
    const pending = await prepareDeploy(t.deps(), { owner: t.owner });
    expect(t.store.get(foundry.id, t.sender.toLowerCase() as Address)).toEqual(pending);
    expect(t.store.get(foundry.id, t.stranger)).toBeUndefined();
    expect(t.store.get(base.id, t.sender)).toBeUndefined();
  });

  it("is forgotten when asked, and a bad entry in storage is ignored", async () => {
    const t = await emptyChain();
    await prepareDeploy(t.deps(), { owner: t.owner });
    t.store.remove(foundry.id, t.sender);
    expect(t.store.get(foundry.id, t.sender)).toBeUndefined();

    const storage = new MemoryStorage();
    storage.setItem(`proofkin:deploy:v1:${foundry.id}:${t.sender.toLowerCase()}`, "{not json");
    expect(new DeployStore(storage).get(foundry.id, t.sender)).toBeUndefined();
    expect(new DeployStore(storage).list(foundry.id)).toEqual([]);
  });

  it("keeps working in memory when the browser will not store it, and says so", async () => {
    const refusing = new MemoryStorage();
    refusing.setItem = () => {
      throw new Error("quota");
    };
    const store = new DeployStore(refusing);
    const t = await emptyChain();
    await prepareDeploy(t.deps({ store }), { owner: t.owner });
    expect(store.persistent).toBe(false);
    expect(store.get(foundry.id, t.sender)?.owner).toBe(t.owner);
  });

  it("lists the finished deployments of a chain, newest first, for the console to find its collection", async () => {
    const t = await emptyChain();
    const first = await runDeploy(t.deps(), await prepareDeploy(t.deps({ now: () => 1 }), { owner: t.owner }));
    expect(t.store.list(foundry.id).map((p) => p.proofkin)).toEqual([first.proofkin]);
    expect(launchedOf(await prepareDeploy(t.deps({ walletClient: t.walletFor(t.stranger) }), { owner: t.owner }))).toBeUndefined();
  });
});
