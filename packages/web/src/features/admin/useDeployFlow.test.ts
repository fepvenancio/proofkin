import { type StorageLike } from "@proofkin/core";
import { type DeployDeps, DeployError, DeployStore, type PendingDeploy } from "@proofkin/core/launch";
import { act, renderHook, waitFor } from "@testing-library/react";
import { UserRejectedRequestError } from "viem";
import { describe, expect, it, vi } from "vitest";

import { useDeployFlow } from "@/features/admin/useDeployFlow";
import { type WalletView } from "@/features/solve/useWallet";

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const OWNER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const RENDERER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const PROOFKIN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CHAIN = { id: 84532 };

const record = (over: Partial<PendingDeploy> = {}): PendingDeploy => ({
  version: 1,
  chainId: 84532,
  account: ALICE,
  owner: OWNER,
  status: "prepared",
  createdAt: 1,
  ...over,
});

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

const wallet = (over: Partial<WalletView> = {}): WalletView => ({
  status: "connected",
  network: "right",
  account: ALICE,
  walletClient: { account: { address: ALICE }, chain: CHAIN } as unknown as WalletView["walletClient"],
  switchNetwork: () => undefined,
  ...over,
});

function setup(over: { wallet?: WalletView; store?: DeployStore } = {}) {
  const store = over.store ?? new DeployStore(memory());
  const flow = {
    prepareDeploy: vi.fn<
      (deps: DeployDeps, input: { owner: string; mainnetConfirmed?: boolean }) => Promise<PendingDeploy>
    >(async (deps, input) => {
      const made = record({ owner: input.owner as PendingDeploy["owner"] });
      deps.store.save(made);
      return made;
    }),
    runDeploy: vi.fn(
      async (deps: DeployDeps, p: PendingDeploy, onStep?: (next: PendingDeploy) => void): Promise<PendingDeploy> => {
        const withRenderer = {
          ...p,
          status: "renderer" as const,
          renderer: RENDERER as PendingDeploy["renderer"],
          rendererBlock: 5,
        };
        deps.store.save(withRenderer);
        onStep?.(withRenderer);
        const done = {
          ...withRenderer,
          status: "done" as const,
          proofkin: PROOFKIN as PendingDeploy["proofkin"],
          proofkinBlock: 6,
        };
        deps.store.save(done);
        onStep?.(done);
        return done;
      },
    ),
  };
  const view = renderHook(() =>
    useDeployFlow({
      app: { chain: CHAIN } as never,
      publicClient: {} as never,
      wallet: over.wallet ?? wallet(),
      store,
      flow: flow as never,
    }),
  );
  return { ...view, flow, store };
}

describe("useDeployFlow", () => {
  it("has nothing on record for an account that has not started", () => {
    const { result } = setup();
    expect(result.current.record).toBeUndefined();
    expect(result.current.busy).toBe(false);
    expect(result.current.notice).toBeUndefined();
  });

  it("prepares the launch with the named owner and then deploys, ending on the finished record", async () => {
    const { result, flow } = setup();
    await act(() => result.current.start({ owner: OWNER, mainnetConfirmed: false }));
    expect(flow.prepareDeploy).toHaveBeenCalledWith(expect.anything(), { owner: OWNER, mainnetConfirmed: false });
    expect(flow.runDeploy).toHaveBeenCalledOnce();
    expect(result.current.record).toMatchObject({ status: "done", proofkin: PROOFKIN, renderer: RENDERER });
    expect(result.current.busy).toBe(false);
  });

  it("shows the renderer as deployed while the collection is still on its way", async () => {
    const { result, flow } = setup();
    let release: () => void = () => undefined;
    flow.runDeploy.mockImplementationOnce(async (deps, p, onStep) => {
      const next = { ...p, status: "renderer" as const, renderer: RENDERER as PendingDeploy["renderer"] };
      deps.store.save(next);
      onStep?.(next);
      await new Promise<void>((resolve) => (release = resolve));
      return { ...next, status: "done" as const };
    });
    let finished: Promise<void> = Promise.resolve();
    act(() => {
      finished = result.current.start({ owner: OWNER, mainnetConfirmed: false });
    });
    await waitFor(() => expect(result.current.record?.status).toBe("renderer"));
    expect(result.current.busy).toBe(true);
    await act(async () => {
      release();
      await finished;
    });
    expect(result.current.busy).toBe(false);
  });

  it("asks for a wallet instead of starting without one", async () => {
    const { result, flow } = setup({ wallet: wallet({ status: "none", account: undefined, walletClient: undefined }) });
    await act(() => result.current.start({ owner: OWNER, mainnetConfirmed: false }));
    expect(result.current.notice).toBe("Connect a wallet to continue.");
    expect(flow.prepareDeploy).not.toHaveBeenCalled();
  });

  it("says in words that the wallet refused, and shows what the store holds so the launch can be continued", async () => {
    const { result, flow, store } = setup();
    flow.runDeploy.mockImplementationOnce(async (deps, p) => {
      deps.store.save({ ...p, status: "renderer", renderer: RENDERER });
      throw new UserRejectedRequestError(new Error("denied"));
    });
    await act(() => result.current.start({ owner: OWNER, mainnetConfirmed: false }));
    expect(result.current.notice).toBe("You rejected the request in your wallet.");
    expect(result.current.record).toEqual(store.get(84532, ALICE));
    expect(result.current.record?.status).toBe("renderer");
    expect(result.current.busy).toBe(false);
  });

  it("shows a refusal by the flow in the flow's own words", async () => {
    const { result, flow } = setup();
    flow.prepareDeploy.mockRejectedValueOnce(new DeployError("The owner cannot be the zero address."));
    await act(() => result.current.start({ owner: OWNER, mainnetConfirmed: false }));
    expect(result.current.notice).toBe("The owner cannot be the zero address.");
    expect(flow.runDeploy).not.toHaveBeenCalled();
  });

  it("clears the last refusal when it tries again", async () => {
    const { result, flow } = setup();
    flow.prepareDeploy.mockRejectedValueOnce(new DeployError("Nope."));
    await act(() => result.current.start({ owner: OWNER, mainnetConfirmed: false }));
    expect(result.current.notice).toBe("Nope.");
    await act(() => result.current.start({ owner: OWNER, mainnetConfirmed: false }));
    expect(result.current.notice).toBeUndefined();
  });

  describe("coming back", () => {
    it("picks up the record this account left in the store, and continues it", async () => {
      const store = new DeployStore(memory());
      store.save(record({ status: "renderer", renderer: RENDERER }));
      const { result, flow } = setup({ store });
      expect(result.current.record?.status).toBe("renderer");

      await act(() => result.current.resume());
      expect(flow.runDeploy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "renderer" }),
        expect.any(Function),
      );
      expect(flow.prepareDeploy).not.toHaveBeenCalled();
      expect(result.current.record?.status).toBe("done");
    });

    it("stops showing a launch when the wallet switches to another account", async () => {
      let current = wallet();
      const store = new DeployStore(memory());
      const flow = {
        prepareDeploy: vi.fn(async (deps: DeployDeps, input: { owner: string }): Promise<PendingDeploy> => {
          const made = record({ owner: input.owner as PendingDeploy["owner"] });
          deps.store.save(made);
          return made;
        }),
        runDeploy: vi.fn(async (_deps: DeployDeps, p: PendingDeploy): Promise<PendingDeploy> => p),
      };
      const { result, rerender } = renderHook(() =>
        useDeployFlow({
          app: { chain: CHAIN } as never,
          publicClient: {} as never,
          wallet: current,
          store,
          flow: flow as never,
        }),
      );
      await act(() => result.current.start({ owner: OWNER, mainnetConfirmed: false }));
      expect(result.current.record?.account).toBe(ALICE);

      current = wallet({
        account: BOB,
        walletClient: { account: { address: BOB }, chain: CHAIN } as unknown as WalletView["walletClient"],
      });
      rerender();
      expect(result.current.record).toBeUndefined();
    });

    it("does not show another account's launch", () => {
      const store = new DeployStore(memory());
      store.save(record({ account: BOB }));
      expect(setup({ store }).result.current.record).toBeUndefined();
    });

    it("forgets a record when asked, from the store as well as the screen", async () => {
      const store = new DeployStore(memory());
      store.save(record());
      const { result } = setup({ store });
      expect(result.current.record).toBeDefined();
      act(() => result.current.forget());
      expect(result.current.record).toBeUndefined();
      expect(store.get(84532, ALICE)).toBeUndefined();
    });

    it("says whether the browser keeps the record, since a launch that is not kept cannot be continued", () => {
      const refusing = memory();
      refusing.setItem = () => {
        throw new Error("quota");
      };
      const store = new DeployStore(refusing);
      store.save(record());
      expect(setup({ store }).result.current.persistent).toBe(false);
      expect(setup().result.current.persistent).toBe(true);
    });
  });
});
