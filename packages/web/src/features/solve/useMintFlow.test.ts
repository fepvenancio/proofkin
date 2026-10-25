import { type MintDeps, MintError, type PendingCommit, PendingStore, type StorageLike } from "@proofkin/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAppConfig } from "@/config/env";
import { useMintFlow } from "@/features/solve/useMintFlow";
import { type WalletView } from "@/features/solve/useWallet";

const app = requireAppConfig({
  NEXT_PUBLIC_CHAIN: "baseSepolia",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
});

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const INPUT = { program: "0x010203", puzzleId: 2, nodeCount: 46 } as const;

const pending = (over: Partial<PendingCommit> = {}): PendingCommit => ({
  version: 1,
  chainId: app.chain.id,
  contract: app.proofkin,
  account: ALICE,
  program: "0x010203",
  salt: `0x${"11".repeat(32)}`,
  hash: `0x${"22".repeat(32)}`,
  puzzleId: 2,
  nodeCount: 46,
  status: "prepared",
  createdAt: 1,
  ...over,
});
const committed = (block = 100, over: Partial<PendingCommit> = {}) =>
  pending({ status: "committed", commitBlock: block, ...over });

/** localStorage, as a map. */
function memory(): StorageLike {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** The chain's block number, which the test advances by hand. */
function blocks() {
  let listener: ((block: bigint) => void) | undefined;
  const stop = vi.fn();
  return {
    watchBlockNumber: vi.fn(({ onBlockNumber }: { onBlockNumber: (block: bigint) => void }) => {
      listener = onBlockNumber;
      return stop;
    }),
    stop,
    tick: (block: number) => act(() => listener?.(BigInt(block))),
    watching: () => listener !== undefined,
  };
}

const wallet = (over: Partial<WalletView> = {}): WalletView => ({
  status: "connected",
  network: "right",
  account: ALICE,
  walletClient: { account: { address: ALICE } } as unknown as WalletView["walletClient"],
  switchNetwork: () => undefined,
  ...over,
});

function setup(over: { wallet?: WalletView; store?: PendingStore } = {}) {
  const chain = blocks();
  const store = over.store ?? new PendingStore(memory());
  const flow = {
    prepareCommit: vi.fn<(deps: MintDeps, input: unknown) => Promise<PendingCommit>>(async () => pending()),
    sendCommit: vi.fn(async (_deps: MintDeps, p: PendingCommit) => ({
      ...p,
      status: "committed" as const,
      commitBlock: 100,
    })),
    reconcile: vi.fn(async (_deps: MintDeps, p: PendingCommit) => p),
    sendReveal: vi.fn(async (_deps: MintDeps, p: PendingCommit) => ({
      ...p,
      status: "revealed" as const,
      revealTx: `0x${"cc".repeat(32)}` as const,
      tokenId: 7,
    })),
  };
  const refresh = vi.fn<(tx: string) => Promise<unknown>>(async () => ({ refreshed: true }));
  const onRevealed = vi.fn();
  const view = renderHook(() =>
    useMintFlow({
      app,
      publicClient: { watchBlockNumber: chain.watchBlockNumber } as unknown as Parameters<
        typeof useMintFlow
      >[0]["publicClient"],
      wallet: over.wallet ?? wallet(),
      store,
      flow,
      refresh,
      onRevealed,
    }),
  );
  return { ...view, chain, store, flow, refresh, onRevealed };
}

describe("useMintFlow", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("starts with nothing under way, and does not watch the chain's blocks", () => {
    const { result, chain } = setup();
    expect(result.current.active).toBeUndefined();
    expect(result.current.step).toEqual({ step: "idle" });
    expect(result.current.busy).toBe(false);
    expect(chain.watching()).toBe(false);
  });

  describe("committing", () => {
    it("writes the salt down and shows it while the commit is still being sent, so a closed tab loses nothing", async () => {
      const { result, flow } = setup();
      let release!: () => void;
      flow.sendCommit.mockImplementationOnce(
        (_deps, p) =>
          new Promise((resolve) => (release = () => resolve({ ...p, status: "committed", commitBlock: 100 }))),
      );
      let done!: Promise<void>;
      act(() => void (done = result.current.commit(INPUT)));

      // the wallet has not answered, and the page already holds the commit that was saved
      await waitFor(() => expect(result.current.active).toMatchObject({ status: "prepared" }));
      expect(flow.prepareCommit).toHaveBeenCalledOnce();
      expect(result.current.busy).toBe(true);

      await act(async () => {
        release();
        await done;
      });
      expect(result.current.active).toMatchObject({ status: "committed" });
    });

    it("sends the commit that was prepared, for the account and the program it was asked about", async () => {
      const { result, flow } = setup();
      await act(() => result.current.commit(INPUT));
      expect(flow.prepareCommit.mock.calls[0]![1]).toEqual(INPUT);
      expect(flow.sendCommit.mock.calls[0]![1]).toMatchObject({ status: "prepared" });
      expect(result.current.active).toMatchObject({ status: "committed", commitBlock: 100 });
    });

    it("watches the chain's blocks once the commit is sent, and says what step it is at", async () => {
      const { result, chain } = setup();
      await act(() => result.current.commit(INPUT));
      await waitFor(() => expect(chain.watching()).toBe(true));
      chain.tick(101);
      expect(result.current.step).toEqual({ step: "waiting", blocksUntilReady: 2 });
      chain.tick(103);
      expect(result.current.step).toEqual({ step: "ready", blocksLeft: 246 });
    });

    it("is busy while the commit is being sent, and not after", async () => {
      const { result, flow } = setup();
      let release!: () => void;
      flow.sendCommit.mockImplementationOnce(
        (_deps, p) =>
          new Promise((resolve) => (release = () => resolve({ ...p, status: "committed", commitBlock: 100 }))),
      );
      let done!: Promise<void>;
      act(() => void (done = result.current.commit(INPUT)));
      await waitFor(() => expect(result.current.busy).toBe(true));
      await act(async () => {
        release();
        await done;
      });
      expect(result.current.busy).toBe(false);
    });

    it("keeps the prepared commit when the wallet refuses, says why in plain words, and lets it be sent again", async () => {
      const { result, flow } = setup();
      flow.sendCommit.mockRejectedValueOnce(new MintError("You rejected the request in your wallet."));
      await act(() => result.current.commit(INPUT));
      expect(result.current.notice).toBe("You rejected the request in your wallet.");
      expect(result.current.busy).toBe(false);
      expect(result.current.active).toMatchObject({ status: "prepared" });
      expect(result.current.step).toEqual({ step: "unsent" });

      await act(() => result.current.sendPrepared());
      expect(flow.sendCommit).toHaveBeenCalledTimes(2);
      expect(result.current.active).toMatchObject({ status: "committed" });
      expect(result.current.notice).toBeUndefined();
    });

    it("does nothing, and says so, with no wallet that can send", async () => {
      const { result, flow } = setup({
        wallet: wallet({ status: "none", account: undefined, walletClient: undefined }),
      });
      await act(() => result.current.commit(INPUT));
      expect(flow.prepareCommit).not.toHaveBeenCalled();
      expect(result.current.notice).toMatch(/connect a wallet/i);
    });
  });

  describe("revealing", () => {
    async function committedFlow() {
      const s = setup();
      await act(() => s.result.current.commit(INPUT));
      s.chain.tick(110);
      return s;
    }

    it("reveals the active commit and ends on the token it made", async () => {
      const { result, flow } = await committedFlow();
      await act(() => result.current.reveal());
      expect(flow.sendReveal).toHaveBeenCalledOnce();
      expect(result.current.step).toEqual({ step: "revealed", tokenId: 7 });
    });

    it("makes the site's caches fresh with the reveal's transaction, and then the page's own data", async () => {
      const { result, refresh, onRevealed } = await committedFlow();
      await act(() => result.current.reveal());
      expect(refresh).toHaveBeenCalledWith(`0x${"cc".repeat(32)}`);
      await waitFor(() => expect(onRevealed).toHaveBeenCalledOnce());
    });

    it("is still a success when making the caches fresh fails: the token is minted, and that only makes it sooner", async () => {
      const { result, refresh, onRevealed } = await committedFlow();
      refresh.mockRejectedValueOnce(new Error("action unavailable"));
      await act(() => result.current.reveal());
      expect(result.current.notice).toBeUndefined();
      expect(result.current.step).toEqual({ step: "revealed", tokenId: 7 });
      await waitFor(() => expect(onRevealed).toHaveBeenCalled());
    });

    it("stops watching blocks once the token is minted", async () => {
      const { result, chain } = await committedFlow();
      await act(() => result.current.reveal());
      expect(chain.stop).toHaveBeenCalled();
    });

    it("says in words why the contract refused, and keeps the commit so the player can try again", async () => {
      const { result, flow } = await committedFlow();
      flow.sendReveal.mockRejectedValueOnce(
        new MintError("The 250-block reveal window for this commit has passed. Commit again, with a new salt."),
      );
      await act(() => result.current.reveal());
      expect(result.current.notice).toMatch(/250-block reveal window/);
      expect(result.current.active).toMatchObject({ status: "committed" });
      expect(result.current.busy).toBe(false);
    });

    it("does not reveal without a wallet that can send", async () => {
      const s = setup({ wallet: wallet({ walletClient: undefined, status: "connecting" }) });
      await act(() => s.result.current.reveal());
      expect(s.flow.sendReveal).not.toHaveBeenCalled();
    });
  });

  describe("coming back to a commit", () => {
    it("lists this account's unfinished commits on this chain and collection, newest first, and not what is done or someone else's", () => {
      const store = new PendingStore(memory());
      store.save(pending({ hash: `0x${"01".repeat(32)}`, createdAt: 1 }));
      store.save(committed(100, { hash: `0x${"02".repeat(32)}`, createdAt: 3 }));
      store.save(committed(100, { hash: `0x${"03".repeat(32)}`, createdAt: 2, status: "revealed" }));
      store.save(pending({ hash: `0x${"04".repeat(32)}`, account: BOB, createdAt: 4 }));
      store.save(pending({ hash: `0x${"05".repeat(32)}`, chainId: 1, createdAt: 5 }));
      const { result } = setup({ store });
      expect(result.current.unfinished.map((p) => p.hash.slice(2, 4))).toEqual(["02", "01"]);
    });

    it("lists nothing without a connected account, since commits belong to accounts", () => {
      const store = new PendingStore(memory());
      store.save(pending());
      const { result } = setup({
        store,
        wallet: wallet({ status: "none", account: undefined, walletClient: undefined }),
      });
      expect(result.current.unfinished).toEqual([]);
    });

    it("resumes a commit: picks it up from the chain, and watches its blocks", async () => {
      const store = new PendingStore(memory());
      const p = pending({ hash: `0x${"01".repeat(32)}` });
      store.save(p);
      const { result, flow, chain } = setup({ store });
      flow.reconcile.mockResolvedValueOnce({ ...p, status: "committed", commitBlock: 90 });
      await act(() => result.current.resume(p));
      expect(flow.reconcile).toHaveBeenCalledWith(expect.anything(), p);
      expect(result.current.active).toMatchObject({ status: "committed", commitBlock: 90 });
      await waitFor(() => expect(chain.watching()).toBe(true));
    });

    it("does not list the commit that is the active one", async () => {
      const store = new PendingStore(memory());
      const { result, flow } = setup({ store });
      flow.prepareCommit.mockImplementationOnce(async () => {
        const p = pending({ hash: `0x${"07".repeat(32)}` });
        store.save(p);
        return p;
      });
      await act(() => result.current.commit(INPUT));
      expect(result.current.unfinished).toEqual([]);
    });

    it("forgets a commit when told to, which deletes its salt", () => {
      const store = new PendingStore(memory());
      const p = pending();
      store.save(p);
      const { result } = setup({ store });
      expect(result.current.unfinished).toHaveLength(1);
      act(() => result.current.forget(p));
      expect(store.get(p.hash)).toBeUndefined();
      expect(result.current.unfinished).toEqual([]);
    });

    it("leaves the mint when the commit forgotten is the one in flight, and its salt goes with it", async () => {
      const { result, store } = setup();
      await act(() => result.current.commit(INPUT));
      const inFlight = result.current.active!;
      store.save(inFlight); // core saves what it prepares; the stand-in for it does not
      act(() => result.current.forget(inFlight));
      expect(result.current.active).toBeUndefined();
      expect(store.get(inFlight.hash)).toBeUndefined();
    });

    it("leaves a mint, and stops watching its blocks", async () => {
      const { result, chain } = setup();
      await act(() => result.current.commit(INPUT));
      await waitFor(() => expect(chain.watching()).toBe(true));
      act(() => result.current.leave());
      expect(result.current.active).toBeUndefined();
      expect(chain.stop).toHaveBeenCalled();
    });

    it("says whether the browser would keep the salt, so the page can tell the player to copy it", () => {
      const refusing: StorageLike = {
        ...memory(),
        setItem: () => {
          throw new Error("full");
        },
      };
      const store = new PendingStore(refusing);
      store.save(pending());
      const { result } = setup({ store });
      expect(result.current.persistent).toBe(false);
    });
  });
});
