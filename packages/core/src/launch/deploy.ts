// Deploying the renderer and the collection from a wallet: two transactions, the first saved before the second is sent
// so that a closed tab picks the launch up where it was, and a check afterwards that what the chain holds is what was built.
import { type Address, encodeAbiParameters, getAddress, type Hex, isAddress, zeroAddress } from "viem";
import { base } from "viem/chains";
import { proofkinAbi } from "../abi.ts";
import type { Reader } from "../chain.ts";
import type { StorageLike } from "../storage.ts";
import type { Wallet } from "../wallet.ts";
import { proofkinCreationCode, rendererCreationCode, rendererRuntimeCode } from "./bytecode.ts";
import { expectedProofkinRuntime } from "./code.ts";
import { DEPLOY_CHAIN_IDS, type Launched, LAUNCH_MINT_PRICE } from "./plan.ts";

/** A failure whose message is already fit to show the person deploying. */
export class DeployError extends Error {}

// ---------------------------------------------------------------------- record

/** A deployment under way or finished, written down before anything is sent and kept up to date as it goes. */
export interface PendingDeploy {
  version: 1;
  chainId: number;
  /** The account that sends both transactions. */
  account: Address;
  /** Who administers the collection from its first block. Not necessarily the sender. */
  owner: Address;
  /** prepared: nothing deployed. renderer: the renderer is. done: the collection is, and has been checked. */
  status: "prepared" | "renderer" | "done";
  rendererTx?: Hex;
  renderer?: Address;
  rendererBlock?: number;
  proofkinTx?: Hex;
  proofkin?: Address;
  proofkinBlock?: number;
  createdAt: number;
}

const PREFIX = "proofkin:deploy:v1:";
const keyOf = (chainId: number, account: Address) => `${PREFIX}${chainId}:${account.toLowerCase()}`;

function parse(raw: string | null): PendingDeploy | undefined {
  if (raw === null) return undefined;
  try {
    const p = JSON.parse(raw) as Partial<PendingDeploy>;
    const ok =
      p.version === 1 &&
      typeof p.chainId === "number" &&
      typeof p.account === "string" &&
      typeof p.owner === "string" &&
      (p.status === "prepared" || p.status === "renderer" || p.status === "done") &&
      typeof p.createdAt === "number";
    return ok ? (p as PendingDeploy) : undefined;
  } catch {
    return undefined;
  }
}

/** One record for each chain and sending account, in the browser's storage and in memory if it will not keep them. */
export class DeployStore {
  /** False when records live only in memory: the browser has no storage or refused to write. */
  persistent: boolean;
  private readonly memory = new Map<string, PendingDeploy>();
  private readonly storage: StorageLike | undefined;

  constructor(storage: StorageLike | undefined) {
    this.storage = storage;
    this.persistent = storage !== undefined;
  }

  save(p: PendingDeploy): void {
    const key = keyOf(p.chainId, p.account);
    this.memory.set(key, p);
    if (!this.storage) return;
    try {
      this.storage.setItem(key, JSON.stringify(p));
    } catch {
      this.persistent = false;
    }
  }

  get(chainId: number, account: Address): PendingDeploy | undefined {
    const key = keyOf(chainId, account);
    if (this.storage) {
      try {
        const stored = parse(this.storage.getItem(key));
        if (stored) return stored;
      } catch {
        // fall through to memory
      }
    }
    return this.memory.get(key);
  }

  remove(chainId: number, account: Address): void {
    const key = keyOf(chainId, account);
    this.memory.delete(key);
    try {
      this.storage?.removeItem(key);
    } catch {
      // nothing more to do
    }
  }

  /** Every record for a chain, whichever account sent it, newest first. */
  list(chainId: number): PendingDeploy[] {
    const all = new Map<string, PendingDeploy>(this.memory);
    if (this.storage) {
      try {
        for (let i = 0; i < this.storage.length; i++) {
          const key = this.storage.key(i);
          if (!key?.startsWith(PREFIX)) continue;
          const p = parse(this.storage.getItem(key));
          if (p) all.set(key, p);
        }
      } catch {
        // storage became unreadable: whatever memory holds is what there is
      }
    }
    return [...all.values()].filter((p) => p.chainId === chainId).sort((a, b) => b.createdAt - a.createdAt);
  }
}

/** Where a finished deployment is, in the form the site's settings are made from. */
export function launchedOf(p: PendingDeploy): Launched | undefined {
  if (p.status !== "done" || !p.proofkin || !p.renderer || p.proofkinBlock === undefined) return undefined;
  return { chainId: p.chainId, proofkin: p.proofkin, renderer: p.renderer, deployBlock: p.proofkinBlock };
}

// ------------------------------------------------------------------------ check

export type Verdict = { ok: true } | { ok: false; problems: string[] };

/**
 * @notice Whether the chain holds the collection and renderer this build deploys, wired together as they should be.
 * @dev The collection's code must equal the compiled code with the launch price written in: byte for byte, with nothing
 * masked. Reads happen at `blockNumber` when it is given, so a node that has not caught up with a receipt answers with
 * an error, not with an empty account.
 * @param publicClient - A read-only client for the chain.
 * @param expected - The two addresses, and the owner the collection was meant to have.
 * @returns Whether it checks out, or each thing that does not.
 */
export async function verifyDeployment(
  publicClient: Reader,
  expected: { proofkin: Address; renderer: Address; owner: Address },
  blockNumber?: bigint,
): Promise<Verdict> {
  const problems: string[] = [];
  const codeAt = (address: Address) => publicClient.getCode({ address, blockNumber });
  const same = (actual: Hex | undefined, wanted: Hex) => actual !== undefined && actual.toLowerCase() === wanted.toLowerCase();

  const rendererCode = await codeAt(expected.renderer);
  if (!rendererCode || rendererCode === "0x") problems.push(`There is no code at the renderer's address, ${expected.renderer}.`);
  else if (!same(rendererCode, rendererRuntimeCode)) {
    problems.push(`The code at the renderer's address, ${expected.renderer}, is not the renderer that was built.`);
  }

  const proofkinCode = await codeAt(expected.proofkin);
  if (!proofkinCode || proofkinCode === "0x") {
    problems.push(`There is no code at the collection's address, ${expected.proofkin}.`);
  } else if (!same(proofkinCode, expectedProofkinRuntime(LAUNCH_MINT_PRICE))) {
    problems.push(`The code at the collection's address, ${expected.proofkin}, is not the collection that was built.`);
  } else {
    const read = <N extends "owner" | "renderer" | "mintPrice">(functionName: N) =>
      publicClient.readContract({ address: expected.proofkin, abi: proofkinAbi, functionName, blockNumber });
    const [owner, renderer, price] = await Promise.all([read("owner"), read("renderer"), read("mintPrice")]);
    if (owner.toLowerCase() !== expected.owner.toLowerCase()) problems.push(`The collection's owner is ${owner}, not ${expected.owner}.`);
    if (renderer.toLowerCase() !== expected.renderer.toLowerCase()) {
      problems.push(`The collection uses the renderer at ${renderer}, not the one at ${expected.renderer}.`);
    }
    if (price !== LAUNCH_MINT_PRICE) problems.push(`The collection's mint price is ${price} wei, not ${LAUNCH_MINT_PRICE}.`);
  }
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

// ------------------------------------------------------------------------- flow

export interface DeployDeps {
  publicClient: Reader;
  walletClient: Wallet;
  store: DeployStore;
  now?: () => number;
}

/**
 * Step 1: decide who owns the collection, and write the launch down. Nothing is sent.
 * @dev The refusals are Deploy.s.sol's: an owner that is named, a chain it deploys to, and a confirmation for Base
 * mainnet. Only one record is kept per chain and account, so a second launch cannot lose where the first one is.
 */
export async function prepareDeploy(
  deps: DeployDeps,
  input: { owner: Address; mainnetConfirmed?: boolean },
): Promise<PendingDeploy> {
  const chainId = deps.walletClient.chain.id;
  const account = deps.walletClient.account.address;
  if (!(DEPLOY_CHAIN_IDS as readonly number[]).includes(chainId)) {
    throw new DeployError(`Proofkin is deployed to a local chain, Base Sepolia and Base, not to chain ${chainId}.`);
  }
  if (!isAddress(input.owner)) throw new DeployError("The owner is not an address.");
  const owner = getAddress(input.owner);
  if (owner === zeroAddress) {
    throw new DeployError("The owner cannot be the zero address: nobody could ever administer the collection.");
  }
  if (chainId === base.id && input.mainnetConfirmed !== true) {
    throw new DeployError("Deploying to Base mainnet has to be confirmed first.");
  }
  if (deps.store.get(chainId, account)) {
    throw new DeployError(
      "A deployment is already on record for this account on this chain. Continue it, or forget it first.",
    );
  }
  const pending: PendingDeploy = {
    version: 1,
    chainId,
    account,
    owner,
    status: "prepared",
    createdAt: (deps.now ?? Date.now)(),
  };
  deps.store.save(pending);
  return pending;
}

function sameWallet(deps: DeployDeps, pending: PendingDeploy): void {
  if (deps.walletClient.chain.id !== pending.chainId) {
    throw new DeployError(`This deployment is on chain ${pending.chainId}; the wallet is on chain ${deps.walletClient.chain.id}.`);
  }
  if (deps.walletClient.account.address.toLowerCase() !== pending.account.toLowerCase()) {
    throw new DeployError(`This deployment was started by ${pending.account}; switch the wallet back to that account.`);
  }
}

/** Sends the creation code, unless an earlier attempt already did: then it waits for that transaction instead. */
async function deploy(
  deps: DeployDeps,
  pending: PendingDeploy,
  data: Hex,
  sent: Hex | undefined,
  remember: (hash: Hex) => PendingDeploy,
  what: string,
) {
  let hash = sent;
  if (!hash) {
    // the node refuses a creation that would revert, and says why, before any gas is spent
    await deps.publicClient.estimateGas({ account: deps.walletClient.account, data });
    hash = await deps.walletClient.sendTransaction({ data });
    remember(hash);
  }
  const receipt = await deps.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new DeployError(`The ${what}'s deployment failed on chain (transaction ${hash}).`);
  }
  return { address: getAddress(receipt.contractAddress), block: receipt.blockNumber };
}

/** Step 2: deploy the renderer, or pick up the one an earlier attempt sent. */
export async function sendRenderer(deps: DeployDeps, pending: PendingDeploy): Promise<PendingDeploy> {
  if (pending.renderer) return pending;
  sameWallet(deps, pending);
  const { address, block } = await deploy(
    deps,
    pending,
    rendererCreationCode,
    pending.rendererTx,
    (hash) => {
      pending = { ...pending, rendererTx: hash };
      deps.store.save(pending);
      return pending;
    },
    "renderer",
  );
  const code = await deps.publicClient.getCode({ address, blockNumber: block });
  if (code?.toLowerCase() !== rendererRuntimeCode.toLowerCase()) {
    throw new DeployError(`The code at the renderer's address, ${address}, is not the renderer that was built.`);
  }
  const next: PendingDeploy = { ...pending, status: "renderer", renderer: address, rendererBlock: Number(block) };
  deps.store.save(next);
  return next;
}

/** Step 3: deploy the collection with the named owner, check it, and only then call the launch done. */
export async function sendProofkin(deps: DeployDeps, pending: PendingDeploy): Promise<PendingDeploy> {
  if (pending.status === "done") return pending;
  if (!pending.renderer) throw new DeployError("The renderer comes first.");
  sameWallet(deps, pending);
  const renderer = pending.renderer;
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }],
    [pending.owner, renderer, LAUNCH_MINT_PRICE],
  );
  const { address, block } = await deploy(
    deps,
    pending,
    `${proofkinCreationCode}${args.slice(2)}`,
    pending.proofkinTx,
    (hash) => {
      pending = { ...pending, proofkinTx: hash };
      deps.store.save(pending);
      return pending;
    },
    "collection",
  );
  const verdict = await verifyDeployment(deps.publicClient, { proofkin: address, renderer, owner: pending.owner }, block);
  if (!verdict.ok) throw new DeployError(verdict.problems.join(" "));
  const next: PendingDeploy = { ...pending, status: "done", proofkin: address, proofkinBlock: Number(block) };
  deps.store.save(next);
  return next;
}

/** Both steps in order; it can be called again after any failure and carries on from what is on record. */
export async function runDeploy(
  deps: DeployDeps,
  pending: PendingDeploy,
  onStep?: (next: PendingDeploy) => void,
): Promise<PendingDeploy> {
  const withRenderer = await sendRenderer(deps, pending);
  onStep?.(withRenderer);
  const done = await sendProofkin(deps, withRenderer);
  onStep?.(done);
  return done;
}
