// When the Mint button may be pressed, and the reason shown when it may not.
import type { Address } from "viem";
import { shortAddress } from "./format.ts";

export interface MintGateInput {
  /** The program assembles and validates. */
  analysis: "ok" | "invalid";
  localTest: "pass" | "fail" | "notRun";
  /** "connecting": a wallet that was connected is being reconnected, as when the page has just loaded. */
  wallet: "connected" | "connecting" | "none";
  network: "right" | "wrong";
  /** What the contract says about this exact program and its puzzle. */
  onChain: "free" | "alreadyMinted" | "puzzleFull" | "unknown";
  /** A mint is already under way. */
  busy: boolean;
}

export type MintGate = { enabled: true } | { enabled: false; reason: string };

export function mintGate(i: MintGateInput): MintGate {
  const no = (reason: string): MintGate => ({ enabled: false, reason });
  if (i.busy) return no("A mint is in progress, please wait.");
  if (i.analysis !== "ok") return no("Fix the program first.");
  if (i.localTest === "notRun") return no("Run the local test first.");
  if (i.localTest === "fail") return no("The program has to pass the local test first.");
  if (i.wallet === "connecting") return no("Connecting to your wallet…");
  if (i.wallet !== "connected") return no("Connect a wallet to mint.");
  if (i.network !== "right") return no("Switch your wallet to the right network.");
  if (i.onChain === "unknown") return no("Checking the chain…");
  if (i.onChain === "alreadyMinted") return no("This exact program has already been minted.");
  if (i.onChain === "puzzleFull") return no("All 50 slots of this puzzle are taken.");
  return { enabled: true };
}

export interface StepGateInput {
  /** A transaction of this mint is being sent. */
  busy: boolean;
  wallet: "connected" | "connecting" | "none";
  network: "right" | "wrong";
  /** The connected account, if there is one. */
  account: Address | undefined;
  /** The account that sent the commit. */
  committedBy: Address;
}

/**
 * Whether the next step of a commit already in flight (sending it, or revealing) may be sent, and why not. A commit
 * binds the account that sent it, so only that account can reveal, and the gate says which one to switch to.
 */
export function stepGate(i: StepGateInput): MintGate {
  const no = (reason: string): MintGate => ({ enabled: false, reason });
  if (i.busy) return no("A mint is in progress, please wait.");
  if (i.wallet === "none") return no("Connect a wallet to continue.");
  if (i.wallet === "connecting") return no("Connecting to your wallet…");
  if (i.network !== "right") return no("Switch your wallet to the right network.");
  if (i.account?.toLowerCase() !== i.committedBy.toLowerCase()) {
    return no(`Switch your wallet to ${shortAddress(i.committedBy)} to continue this mint: the commit belongs to that account.`);
  }
  return { enabled: true };
}
