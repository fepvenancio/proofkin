"use client";

import {
  type AppConfig,
  friendlyError,
  type MintDeps,
  type MintInput,
  type PendingCommit,
  type PendingStore,
  prepareCommit,
  reconcile,
  type Reader,
  resolveMintStep,
  sendCommit,
  sendReveal,
} from "@proofkin/core";
import { useEffect, useReducer, useState } from "react";

import { type WalletView } from "@/features/solve/useWallet";

/** The four steps of a mint, as core has them; a test supplies its own. */
export interface MintSteps {
  prepareCommit: typeof prepareCommit;
  sendCommit: typeof sendCommit;
  reconcile: typeof reconcile;
  sendReveal: typeof sendReveal;
}

const coreSteps: MintSteps = { prepareCommit, sendCommit, reconcile, sendReveal };

/**
 * @notice The mint of one solution as the page lives it: save the salt, commit, wait, reveal, and pick up where a closed
 * tab left off.
 * @dev (1) The flow itself is core's, tested against a real chain; this adds what a page needs around it: the commit in
 * flight, whether a step is being sent, the sentence for a refusal, the block the countdown is measured against, and the
 * unfinished commits saved in this browser. (2) The salt is written down (core's `prepareCommit`) and shown before the
 * commit is sent, so a refusing wallet or a closed tab loses nothing. (3) Blocks are watched only while a commit is
 * waiting to be revealed. (4) When the reveal lands, the server is asked to make its caches fresh and the page re-reads
 * its own; neither is allowed to turn a minted token into an error.
 * @param settings - `app`: the deployment. `publicClient`: a read-only client. `wallet`: the visitor's wallet. `store`:
 * the saved commits. `steps`: the flow, core's unless a test supplies one. `refresh`: the server action that makes the
 * caches fresh. `onRevealed`: runs after a reveal, to re-read the page's server data.
 * @returns The state, and one function for each thing the visitor can do.
 */
export function useMintFlow({
  app,
  publicClient,
  wallet,
  store,
  flow = coreSteps,
  refresh,
  onRevealed,
}: {
  app: AppConfig;
  publicClient: Reader | undefined;
  wallet: WalletView;
  store: PendingStore;
  flow?: MintSteps;
  refresh?: (revealTx: string) => Promise<unknown>;
  onRevealed?: () => void;
}) {
  const [active, setActive] = useState<PendingCommit>();
  const [blockNumber, setBlockNumber] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (!publicClient || active?.status !== "committed") return;
    return publicClient.watchBlockNumber({
      emitOnBegin: true,
      pollingInterval: app.pollingIntervalMs,
      onBlockNumber: (block) => setBlockNumber(Number(block)),
      onError: () => undefined,
    });
  }, [publicClient, active?.status, active?.hash, app.pollingIntervalMs]);

  async function guarded(work: (deps: MintDeps) => Promise<void>): Promise<void> {
    if (!publicClient || !wallet.walletClient) {
      setNotice("Connect a wallet to continue.");
      return;
    }
    setBusy(true);
    setNotice(undefined);
    try {
      await work({ publicClient, walletClient: wallet.walletClient, config: app, store });
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  const commit = (input: MintInput) =>
    guarded(async (deps) => {
      const prepared = await flow.prepareCommit(deps, input);
      setActive(prepared);
      setActive(await flow.sendCommit(deps, prepared));
    });

  const sendPrepared = () =>
    guarded(async (deps) => {
      if (active) setActive(await flow.sendCommit(deps, active));
    });

  const reveal = () =>
    guarded(async (deps) => {
      if (!active) return;
      const done = await flow.sendReveal(deps, active);
      setActive(done);
      void Promise.resolve(done.revealTx && refresh?.(done.revealTx))
        .catch(() => undefined)
        .finally(() => onRevealed?.());
    });

  const resume = (pending: PendingCommit) =>
    guarded(async (deps) => {
      setActive(await flow.reconcile(deps, pending));
    });

  const leave = () => {
    setActive(undefined);
    setBlockNumber(undefined);
    setNotice(undefined);
  };

  const forget = (pending: PendingCommit) => {
    store.remove(pending.hash);
    if (active?.hash === pending.hash) leave();
    else rerender();
  };

  const unfinished = wallet.account
    ? store
        .list({ chainId: app.chain.id, contract: app.proofkin, account: wallet.account })
        .filter((pending) => pending.status !== "revealed" && pending.hash !== active?.hash)
    : [];

  return {
    active,
    step: resolveMintStep(active, blockNumber),
    blockNumber,
    busy,
    notice,
    unfinished,
    persistent: store.persistent,
    commit,
    sendPrepared,
    reveal,
    resume,
    forget,
    leave,
  };
}
