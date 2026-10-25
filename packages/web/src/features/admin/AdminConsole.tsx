"use client";

import { DeployStore } from "@proofkin/core/launch";
import { useMemo, useReducer } from "react";
import { usePublicClient } from "wagmi";

import { ConfigProblems } from "@/components/ConfigProblems";
import { WalletButton } from "@/components/WalletButton";
import { collectionFromEnv, requireChainConfig } from "@/config/env";
import { CollectionStatus } from "@/features/admin/CollectionStatus";
import { DeployPanel } from "@/features/admin/DeployPanel";
import { DeployResult } from "@/features/admin/DeployResult";
import { useDeployFlow } from "@/features/admin/useDeployFlow";
import { browserStorage } from "@/features/solve/browserStorage";
import { useMounted } from "@/features/solve/useMounted";
import { useWallet } from "@/features/solve/useWallet";

/**
 * @notice The page for whoever launches and looks after the collection.
 * @dev (1) Only the heading is drawn on the server and while the browser hydrates: the wallet, the browser's storage and
 * the chain are all browser things, and a first frame that the browser then disagrees with is worse than a short
 * wait. (2) It works before any contract exists, which is what it is for: it needs the chain and nothing else.
 */
export function AdminConsole() {
  const mounted = useMounted();
  return (
    <div className="mt-6">
      <h1 className="text-4xl font-semibold tracking-tight">Admin</h1>
      {mounted && <Console />}
    </div>
  );
}

/**
 * @dev Which collection it works on is decided in this order: the one the site's settings name; else the launch the
 * connected account has on record, whatever its state; else a finished launch this browser made, for a visit with no
 * wallet; else none, and then it offers to deploy.
 */
function Console() {
  const chain = useMemo(() => requireChainConfig(), []);
  const source = useMemo(() => collectionFromEnv(), []);
  const reader = usePublicClient({ chainId: chain.chain.id });
  const wallet = useWallet(chain);
  const store = useMemo(() => new DeployStore(browserStorage()), []);
  const flow = useDeployFlow({ app: chain, publicClient: reader, wallet, store });
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  const display = { id: chain.chain.id, name: chain.chain.name, explorer: chain.chain.blockExplorers?.default.url };

  if (source.kind === "broken") return <ConfigProblems problems={source.problems} />;

  if (source.kind === "configured") {
    return (
      <>
        <p className="mt-3 max-w-prose">The collection named by this site&apos;s settings.</p>
        <CollectionStatus chain={display} proofkin={source.app.proofkin} account={wallet.account} reader={reader} />
      </>
    );
  }

  if (flow.record) {
    const { record } = flow;
    return (
      <>
        <DeployPanel
          chain={display}
          wallet={wallet}
          record={record}
          busy={flow.busy}
          notice={flow.notice}
          persistent={flow.persistent}
          connect={<WalletButton />}
          onStart={(input) => void flow.start(input)}
          onResume={() => void flow.resume()}
          onForget={flow.forget}
        />
        {record.status === "done" && record.proofkin && (
          <CollectionStatus chain={display} proofkin={record.proofkin} account={wallet.account} reader={reader} />
        )}
      </>
    );
  }

  const kept = store.list(chain.chain.id).find((p) => p.status === "done");
  if (kept?.proofkin && kept.renderer && kept.proofkinBlock !== undefined) {
    return (
      <>
        <section aria-labelledby="kept-heading" className="mt-10 border-t border-rule pt-8">
          <h2 id="kept-heading" className="text-2xl font-semibold tracking-tight">
            Deployed from this browser
          </h2>
          <p className="mt-3 max-w-prose">
            This browser deployed a collection to {chain.chain.name}. The site shows it once its settings are in the
            environment.
          </p>
          <div className="mt-4">
            <DeployResult
              launched={{
                chainId: kept.chainId,
                proofkin: kept.proofkin,
                renderer: kept.renderer,
                deployBlock: kept.proofkinBlock,
              }}
              owner={kept.owner}
              explorer={display.explorer}
              onForget={() => {
                store.remove(kept.chainId, kept.account);
                rerender();
              }}
            />
          </div>
        </section>
        <CollectionStatus chain={display} proofkin={kept.proofkin} account={wallet.account} reader={reader} />
      </>
    );
  }

  return (
    <DeployPanel
      chain={display}
      wallet={wallet}
      record={undefined}
      busy={flow.busy}
      notice={flow.notice}
      persistent={flow.persistent}
      connect={<WalletButton />}
      onStart={(input) => void flow.start(input)}
      onResume={() => void flow.resume()}
      onForget={flow.forget}
    />
  );
}
