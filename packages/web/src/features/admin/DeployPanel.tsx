"use client";

import { deployGate, type PendingDeploy, ownerInput } from "@proofkin/core/launch";
import { type ReactNode, useState } from "react";
import { base } from "viem/chains";

import { Step } from "@/components/Step";
import { DeployResult } from "@/features/admin/DeployResult";
import { deployStepStates } from "@/features/admin/steps";
import { type WalletView } from "@/features/solve/useWallet";

export interface DeployPanelProps {
  /** The chain the launch goes to; `explorer` is its block explorer's address, if it has one. */
  chain: { id: number; name: string; explorer?: string };
  wallet: Pick<WalletView, "status" | "network" | "account" | "switchNetwork">;
  /** The launch on record for the connected account, if there is one. */
  record: PendingDeploy | undefined;
  busy: boolean;
  notice: string | undefined;
  /** Whether this browser keeps the record: false means the person must write the addresses down. */
  persistent: boolean;
  /** The wallet's connect button, supplied by the page so the panel needs no wallet library of its own. */
  connect: ReactNode;
  onStart: (input: { owner: `0x${string}`; mainnetConfirmed: boolean }) => void;
  onResume: () => void;
  onForget: () => void;
}

const primary = "rounded-[2px] bg-ink px-5 py-2.5 text-paper disabled:opacity-40";
const link = "underline underline-offset-4";
const field = "font-address w-full max-w-[28rem] rounded-[2px] border border-rule bg-paper px-3 py-2";

/**
 * @notice A launch from start to finish: name the owner, deploy the renderer and the collection, and take the settings
 * to the site.
 * @dev (1) It decides nothing: whether a button is open is core's `deployGate`, pure and tested, and where the launch is
 * comes from the record. It places the words. (2) The steps are a numbered list because a launch is a sequence, and the
 * one it is at is `aria-current`. (3) A launch under way shows the owner it was given in place of the form, so the owner
 * cannot be changed halfway. (4) Base mainnet asks for the last characters of the owner's address, so that the address
 * has to be read before the money is spent.
 * @param props - See `DeployPanelProps`.
 */
export function DeployPanel(props: DeployPanelProps) {
  const { chain, wallet, record, busy } = props;
  const [ownerText, setOwnerText] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const mainnet = chain.id === base.id;
  const owner = ownerInput(ownerText);
  const start = deployGate({
    wallet: wallet.status,
    network: wallet.network,
    chainId: chain.id,
    owner,
    confirmation,
    busy,
  });
  const resume = deployGate({
    wallet: wallet.status,
    network: wallet.network,
    chainId: chain.id,
    owner: record ? { status: "ok", address: record.owner } : owner,
    confirmation: "",
    busy,
    resuming: true,
  });
  const states = deployStepStates(record);
  const explorer = (address: string, what: string) =>
    chain.explorer ? (
      <a href={`${chain.explorer}/address/${address}`} className={`${link} mt-1 inline-block`}>
        {`${what} on the explorer`}
      </a>
    ) : null;
  const waiting = (sent: string | undefined) =>
    busy ? (
      <p>{sent ? "Waiting for the transaction to be mined…" : "Confirm the transaction in your wallet…"}</p>
    ) : (
      <p>Not deployed yet.</p>
    );

  return (
    <section aria-labelledby="deploy-heading" className="mt-10 border-t border-rule pt-8">
      <h2 id="deploy-heading" className="text-2xl font-semibold tracking-tight">
        Deploy
      </h2>
      <p className="mt-3 max-w-prose">
        {`Deploys the renderer and then the collection to ${chain.name} from the connected wallet: two transactions, one after the other.`}
      </p>
      {mainnet && (
        <p className="mt-2 max-w-prose font-semibold">
          This is Base mainnet, with real money, and the owner and the price cannot be changed afterwards. Use a
          hardware wallet.
        </p>
      )}

      <ol aria-label="Steps of this deployment" className="mt-6 space-y-6">
        <Step state={states[0]} title="Owner">
          {record ? (
            <code className="font-address mt-1 block break-all text-sm">{record.owner}</code>
          ) : (
            <div className="mt-1 space-y-3">
              <div>
                <label htmlFor="owner" className="block">
                  Owner&apos;s address
                </label>
                <p id="owner-hint" className="max-w-prose text-graphite">
                  Who can replace the renderer, lock it, withdraw the fees and hand ownership on. It need not be the
                  wallet that pays for the deployment.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <input
                    id="owner"
                    aria-describedby="owner-hint"
                    value={ownerText}
                    onChange={(event) => setOwnerText(event.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="0x…"
                    className={field}
                  />
                  {wallet.account && (
                    <button type="button" className={link} onClick={() => setOwnerText(wallet.account ?? "")}>
                      Use my wallet
                    </button>
                  )}
                </div>
              </div>

              {mainnet && owner.status === "ok" && (
                <div>
                  <label htmlFor="confirmation" className="block">
                    To confirm, type the last six characters of the owner&apos;s address
                  </label>
                  <input
                    id="confirmation"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    className={`${field} mt-2 max-w-[10rem]`}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {wallet.status === "none" && props.connect}
                <button
                  type="button"
                  disabled={!start.enabled}
                  className={primary}
                  onClick={() => {
                    if (owner.status === "ok") props.onStart({ owner: owner.address, mainnetConfirmed: mainnet });
                  }}
                >
                  {busy ? "Working…" : "Deploy"}
                </button>
                {wallet.status === "connected" && wallet.network === "wrong" && (
                  <button type="button" onClick={wallet.switchNetwork} className={link}>
                    Switch network
                  </button>
                )}
                {!start.enabled && <span className="text-graphite">{start.reason}</span>}
              </div>
              <p className="max-w-prose text-graphite">Your wallet will ask you to confirm twice.</p>
              <p className="max-w-prose text-graphite">
                If you left a deployment unfinished, connect the account that began it to continue it.
              </p>
            </div>
          )}
        </Step>

        <Step state={states[1]} title="Renderer">
          {record?.renderer ? (
            <>
              <p className="break-all">{`Deployed at ${record.renderer} in block ${record.rendererBlock}.`}</p>
              {explorer(record.renderer, "Renderer")}
            </>
          ) : (
            record && waiting(record.rendererTx)
          )}
        </Step>

        <Step state={states[2]} title="Collection">
          {record?.status === "done" && record.proofkin ? (
            <>
              <p className="break-all">{`Deployed at ${record.proofkin} in block ${record.proofkinBlock}, and checked against the build.`}</p>
              {explorer(record.proofkin, "Collection")}
            </>
          ) : (
            record?.renderer && waiting(record.proofkinTx)
          )}
        </Step>

        <Step state={states[3]} title="Site settings">
          {record?.status === "done" && record.proofkin && record.renderer && record.proofkinBlock !== undefined && (
            <DeployResult
              launched={{
                chainId: record.chainId,
                proofkin: record.proofkin,
                renderer: record.renderer,
                deployBlock: record.proofkinBlock,
              }}
              owner={record.owner}
              explorer={chain.explorer}
              onForget={props.onForget}
            />
          )}
        </Step>
      </ol>

      {record && record.status !== "done" && (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
          {!busy && (
            <button type="button" disabled={!resume.enabled} onClick={props.onResume} className={primary}>
              Continue deploying
            </button>
          )}
          {!busy && !resume.enabled && <span className="text-graphite">{resume.reason}</span>}
          {!busy && wallet.status === "connected" && wallet.network === "wrong" && (
            <button type="button" onClick={wallet.switchNetwork} className={link}>
              Switch network
            </button>
          )}
          <button
            type="button"
            className="text-graphite underline underline-offset-4"
            onClick={() => {
              if (
                window.confirm(
                  "This removes the note of this deployment from this browser. A transaction already sent still happens, and the contract it creates stays on the chain without being tracked here. Forget it?",
                )
              ) {
                props.onForget();
              }
            }}
          >
            Forget this deployment
          </button>
        </div>
      )}

      {props.notice && (
        <p role="alert" className="mt-4 max-w-prose font-semibold">
          {props.notice}
        </p>
      )}
      {!props.persistent && record && (
        <p className="mt-4 max-w-prose">
          This browser would not let the page keep a record of the deployment, so write down each address as it appears.
        </p>
      )}
    </section>
  );
}
