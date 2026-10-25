// When the Deploy button may be pressed, and the reason shown when it may not.
import { type Address, getAddress, isAddress, zeroAddress } from "viem";
import { base } from "viem/chains";
import type { MintGate } from "../mintGate.ts";
import { isConfirmed } from "./plan.ts";

export type OwnerInput = { status: "empty" } | { status: "invalid" } | { status: "zero" } | { status: "ok"; address: Address };

/** What was typed as the owner: an address, or the reason it is not one. Spaces round it are ignored. */
export function ownerInput(text: string): OwnerInput {
  const typed = text.trim();
  if (typed === "") return { status: "empty" };
  // strict: a mixed-case address has to carry its checksum, which is what catches a mistyped character
  if (!isAddress(typed)) return { status: "invalid" };
  const address = getAddress(typed);
  return address === zeroAddress ? { status: "zero" } : { status: "ok", address };
}

export interface DeployGateInput {
  wallet: "connected" | "connecting" | "none";
  network: "right" | "wrong";
  chainId: number;
  owner: OwnerInput;
  /** What was typed to confirm a deployment to Base mainnet. */
  confirmation: string;
  /** A deployment is already being sent. */
  busy: boolean;
  /** The launch was begun already, and confirmed then: it is being continued. */
  resuming?: boolean;
}

export function deployGate(i: DeployGateInput): MintGate {
  const no = (reason: string): MintGate => ({ enabled: false, reason });
  if (i.busy) return no("A deployment is in progress, please wait.");
  if (i.wallet === "connecting") return no("Connecting to your wallet…");
  if (i.wallet !== "connected") return no("Connect a wallet to deploy.");
  if (i.network !== "right") return no("Switch your wallet to the right network.");
  if (i.owner.status === "empty") return no("Name the owner first.");
  if (i.owner.status === "invalid") return no("The owner is not an address.");
  if (i.owner.status === "zero") return no("The owner cannot be the zero address.");
  if (i.chainId === base.id && !i.resuming && !isConfirmed(i.confirmation, i.owner.address)) {
    return no("Type the last six characters of the owner's address to confirm a deployment to Base.");
  }
  return { enabled: true };
}
