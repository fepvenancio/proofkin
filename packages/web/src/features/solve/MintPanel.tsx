"use client";

import {
  etaSeconds,
  formatDuration,
  type MintGate,
  type MintStep,
  type PendingCommit,
  PUZZLE_HUES,
  PUZZLE_INFO,
  resolveMintStep,
  REVEAL_DELAY,
} from "@proofkin/core";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useState } from "react";

import { paths } from "@/config/routes";
import { type WalletView } from "@/features/solve/useWallet";

export interface MintPanelProps {
  /** The puzzle of the page the panel is on. */
  puzzleId: number;
  /** What a reveal costs, as words ("0.01 ETH"), once the chain has been read. */
  price: string | undefined;
  blockTimeSeconds: number;
  wallet: Pick<WalletView, "status" | "network" | "switchNetwork">;
  /** Whether a new commit may be started, from `mintGate`. */
  gate: MintGate;
  step: MintStep;
  /** The commit in flight, if there is one. */
  active: PendingCommit | undefined;
  /** Whether the commit in flight may take its next step, from `stepGate`. */
  stepGate: MintGate;
  busy: boolean;
  notice: string | undefined;
  /** Whether this browser keeps the salt: false means the page must tell the player to copy it. */
  persistent: boolean;
  unfinished: PendingCommit[];
  /** The chain's newest block, when it is known: it is what tells a saved commit its window has closed. */
  latestBlock?: number;
  /** The wallet's connect button, supplied by the page so the panel needs no wallet library of its own. */
  connect: ReactNode;
  onCommit: () => void;
  onSendPrepared: () => void;
  onReveal: () => void;
  onResume: (pending: PendingCommit) => void;
  onForget: (pending: PendingCommit) => void;
  onLeave: () => void;
}

type State = "done" | "current" | "todo";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const primary = "rounded-[2px] bg-ink px-5 py-2.5 text-paper disabled:opacity-40";
const link = "underline underline-offset-4";

/**
 * @notice The whole of a mint, from "Commit solution" to the token: what to press, what is being waited for, and what
 * to do when it goes wrong.
 * @dev (1) It decides nothing: whether a button is open is `gate` and `stepGate`, which are pure and tested, and what step
 * the mint is at is `step`. It only places the words. (2) The countdown changes text, never structure, so a block that
 * arrives between the pointer going down and coming up does not replace the button under it. (3) The steps are a
 * numbered list because a mint is a sequence, and the current one is `aria-current`.
 * @param props - See `MintPanelProps`.
 */
export function MintPanel(props: MintPanelProps) {
  const { active, step, price, blockTimeSeconds } = props;
  const eta = (blocks: number) => formatDuration(etaSeconds(blocks, blockTimeSeconds));
  const [copied, setCopied] = useState(false);

  const waiting = step.step === "waiting" || step.step === "checking";
  const states: [State, State, State, State] = [
    "done",
    step.step === "unsent" ? "current" : "done",
    step.step === "unsent" ? "todo" : waiting ? "current" : "done",
    step.step === "ready" || step.step === "expired" ? "current" : step.step === "revealed" ? "done" : "todo",
  ];

  function gateReason(): ReactNode {
    return !props.stepGate.enabled && !props.busy ? (
      <p className="mt-2 text-graphite">{props.stepGate.reason}</p>
    ) : null;
  }

  return (
    <section
      aria-labelledby="mint-heading"
      className="mt-10 border-t border-rule pt-8"
      style={{ "--h": PUZZLE_HUES[active?.puzzleId ?? props.puzzleId] } as CSSProperties}
    >
      <h2 id="mint-heading" className="text-2xl font-semibold tracking-tight">
        Mint
      </h2>

      {!active && (
        <div className="mt-3">
          {props.wallet.status === "none" ? (
            <div className="flex flex-wrap items-center gap-3">
              {props.connect}
              <span className="text-graphite">to mint</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={props.onCommit} disabled={!props.gate.enabled} className={primary}>
                {props.busy ? "Working…" : "Commit solution"}
              </button>
              {props.wallet.status === "connected" && props.wallet.network === "wrong" && (
                <button type="button" onClick={props.wallet.switchNetwork} className={link}>
                  Switch network
                </button>
              )}
              {!props.gate.enabled && <span className="text-graphite">{props.gate.reason}</span>}
            </div>
          )}
          <p className="mt-3 max-w-prose text-graphite">
            {`Minting takes two transactions: a commit, then a reveal at least ${REVEAL_DELAY + 1} blocks later (${eta(REVEAL_DELAY + 1)}).`}
          </p>
        </div>
      )}

      {active && (
        <ol aria-label="Steps of this mint" className="mt-4 space-y-6">
          <Item state="done" title="Salt saved">
            <p className="max-w-prose">
              {props.persistent
                ? "Kept in this browser."
                : "This browser would not let the page store it, so copy it now."}
              {" Without this salt the commit can never be revealed."}
            </p>
            <code className="font-address mt-2 block break-all text-sm">{active.salt}</code>
            <button
              type="button"
              className={`${link} mt-2`}
              onClick={() => void navigator.clipboard?.writeText(active.salt).then(() => setCopied(true))}
            >
              {copied ? "Copied" : "Copy salt"}
            </button>
          </Item>

          <Item state={states[1]} title="Commit">
            {step.step === "unsent" ? (
              props.busy ? (
                <p>Confirm the transaction in your wallet…</p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={props.onSendPrepared}
                    disabled={!props.stepGate.enabled}
                    className={primary}
                  >
                    Send commit
                  </button>
                  {gateReason()}
                </>
              )
            ) : (
              <p>{`Committed in block ${active.commitBlock}.`}</p>
            )}
          </Item>

          <Item state={states[2]} title={`Wait ${REVEAL_DELAY + 1} blocks`}>
            {step.step === "waiting" && (
              <p className="tabular-nums">{`${plural(step.blocksUntilReady, "more block")} to go (${eta(step.blocksUntilReady)}).`}</p>
            )}
            {step.step === "checking" && <p>Checking the chain…</p>}
          </Item>

          <Item state={states[3]} title="Reveal and mint">
            {step.step === "ready" &&
              (props.busy ? (
                <p>Confirm the transaction in your wallet…</p>
              ) : (
                <>
                  <button type="button" onClick={props.onReveal} disabled={!props.stepGate.enabled} className={primary}>
                    {`Reveal and mint for ${price ?? "the mint price"}`}
                  </button>
                  {gateReason()}
                </>
              ))}
            {step.step === "ready" && (
              <p className="mt-2 tabular-nums text-graphite">
                {step.blocksLeft === 0
                  ? "Send it now: this is the last block it can land in."
                  : `Send it within ${plural(step.blocksLeft, "block")} (${eta(step.blocksLeft)}).`}
              </p>
            )}
            {step.step === "expired" && (
              <>
                <p role="alert" className="font-semibold">
                  The 250-block window for this commit has closed. Commit again with a new salt.
                </p>
                <button type="button" onClick={props.onLeave} className={`${link} mt-2`}>
                  Start over
                </button>
              </>
            )}
            {step.step === "revealed" && <p>Revealed.</p>}
          </Item>

          {step.step === "revealed" && (
            <Item
              state="done"
              title={step.tokenId === undefined ? "Your token is minted" : `Token #${step.tokenId} is yours`}
            >
              <p className="flex flex-wrap gap-x-6 gap-y-2">
                {step.tokenId === undefined ? (
                  <Link href="/gallery" className={link}>
                    See it in the gallery
                  </Link>
                ) : (
                  <Link href={paths.token(step.tokenId)} className={link}>
                    {`View token #${step.tokenId}`}
                  </Link>
                )}
                <button type="button" onClick={props.onLeave} className={link}>
                  Mint another
                </button>
              </p>
            </Item>
          )}
        </ol>
      )}

      {props.notice && (
        <p role="alert" className="mt-4 max-w-prose font-semibold">
          {props.notice}
        </p>
      )}

      {props.unfinished.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold">Unfinished mints</h3>
          <ul aria-label="Unfinished mints" className="mt-2 divide-y divide-rule">
            {props.unfinished.map((pending) => {
              const puzzle = PUZZLE_INFO[pending.puzzleId]!;
              // a commit older than its window can never be revealed, so it is only worth forgetting
              const dead = resolveMintStep(pending, props.latestBlock).step === "expired";
              return (
                <li key={pending.hash} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 py-2">
                  <span className="tabular-nums">{`${puzzle.name}, ${pending.nodeCount} nodes: ${pending.status === "prepared" ? "saved, not yet sent" : dead ? "committed, window closed" : "committed"}`}</span>
                  {dead ? null : pending.puzzleId === props.puzzleId ? (
                    <button type="button" onClick={() => props.onResume(pending)} className={link}>
                      Continue
                    </button>
                  ) : (
                    <Link href={paths.solve(pending.puzzleId)} className={link}>
                      {`Continue on ${puzzle.name}`}
                    </Link>
                  )}
                  <button
                    type="button"
                    className="text-graphite underline underline-offset-4"
                    onClick={() => {
                      if (
                        window.confirm(
                          "This deletes the saved salt. If the commit was already sent, it can never be revealed without it. Forget it?",
                        )
                      ) {
                        props.onForget(pending);
                      }
                    }}
                  >
                    Forget
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One step of the list: a marker that says whether it is done, the one it is at, or still to come, and its content. */
function Item({ state, title, children }: { state: State; title: string; children?: ReactNode }) {
  return (
    <li
      data-state={state}
      aria-current={state === "current" ? "step" : undefined}
      className="grid grid-cols-[1.25rem_1fr] gap-x-3"
    >
      <span
        aria-hidden
        className={`mt-1.5 size-3 rounded-full ${
          state === "done"
            ? "bg-puzzle-mark"
            : state === "current"
              ? "border-2 border-puzzle-glow bg-paper ring-2 ring-ink"
              : "border-2 border-rule"
        }`}
      />
      <div>
        <h3 className={`font-semibold ${state === "todo" ? "text-graphite" : ""}`}>{title}</h3>
        {children}
      </div>
    </li>
  );
}
