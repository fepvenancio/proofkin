"use client";

import { type ChainConfig, friendlyError, type Reader } from "@proofkin/core";
import { type DeployDeps, type DeployStore, type PendingDeploy, prepareDeploy, runDeploy } from "@proofkin/core/launch";
import { useReducer, useState } from "react";
import { type Address } from "viem";

import { type WalletView } from "@/features/solve/useWallet";

/** The two things a launch is made of, as core has them; a test supplies its own. */
export interface DeploySteps {
  prepareDeploy: typeof prepareDeploy;
  runDeploy: typeof runDeploy;
}

const coreSteps: DeploySteps = { prepareDeploy, runDeploy };

/**
 * @notice A launch as the console lives it: name the owner, deploy the renderer and the collection, and pick up where a
 * closed tab left off.
 * @dev (1) The flow is core's, tested against a real chain; this adds the record on screen, whether a transaction is
 * being sent, and the sentence for a refusal. (2) The record shown is the one the store holds for the connected account,
 * so a reloaded page continues a launch rather than offering to begin another. (3) After any failure the record is
 * read back from the store, because the flow saves each transaction as it sends it, and the screen would otherwise lag
 * behind what the chain is about to confirm.
 * @param settings - `app`: the chain. `publicClient`: a read-only client. `wallet`: the connected wallet. `store`: the
 * saved launches. `flow`: core's unless a test supplies one.
 * @returns The record, the state of the work, and one function for each thing the person can do.
 */
export function useDeployFlow({
  app,
  publicClient,
  wallet,
  store,
  flow = coreSteps,
}: {
  app: Pick<ChainConfig, "chain">;
  publicClient: Reader | undefined;
  wallet: WalletView;
  store: DeployStore;
  flow?: DeploySteps;
}) {
  const [current, setCurrent] = useState<PendingDeploy>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  const saved = wallet.account ? store.get(app.chain.id, wallet.account) : undefined;
  // `current` is what this session has done; `saved` is what any session left. Either is for this account only.
  const record =
    current && current.account.toLowerCase() === wallet.account?.toLowerCase() && current.chainId === app.chain.id
      ? current
      : saved;

  async function guarded(work: (deps: DeployDeps) => Promise<void>): Promise<void> {
    if (!publicClient || !wallet.walletClient) {
      setNotice("Connect a wallet to continue.");
      return;
    }
    setBusy(true);
    setNotice(undefined);
    try {
      await work({ publicClient, walletClient: wallet.walletClient, store });
    } catch (error) {
      setNotice(friendlyError(error));
      setCurrent(store.get(wallet.walletClient.chain.id, wallet.walletClient.account.address));
    } finally {
      setBusy(false);
    }
  }

  const start = (input: { owner: Address; mainnetConfirmed: boolean }) =>
    guarded(async (deps) => {
      const prepared = await flow.prepareDeploy(deps, input);
      setCurrent(prepared);
      await flow.runDeploy(deps, prepared, setCurrent);
    });

  const resume = () =>
    guarded(async (deps) => {
      if (record) await flow.runDeploy(deps, record, setCurrent);
    });

  const forget = () => {
    if (wallet.account) store.remove(app.chain.id, wallet.account);
    setCurrent(undefined);
    setNotice(undefined);
    rerender();
  };

  return { record, busy, notice, persistent: store.persistent, start, resume, forget };
}
