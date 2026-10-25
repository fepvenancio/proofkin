// The mint flow (PLAN.md §9): prepare and save a salt, commit, wait, reveal. Every step that sends a
// transaction is simulated first, so a refusal arrives as a readable message and costs no gas.
import {
  BaseError,
  ContractFunctionRevertedError,
  type Hex,
  parseEventLogs,
  UserRejectedRequestError,
} from "viem";
import { TRIALS } from "@proofkin/vm";
import { type proofkinAbi as ProofkinAbi, proofkinAbi } from "./abi.ts";
import { commitBlockOf, currentBlock, type Reader } from "./chain.ts";
import { commitHash, newSalt } from "./commitment.ts";
import type { AppConfig } from "./config.ts";
import { type RevealPhase, revealPhase } from "./phase.ts";
import type { PendingCommit, PendingStore } from "./storage.ts";
import type { Wallet } from "./wallet.ts";

export interface MintDeps {
  publicClient: Reader;
  walletClient: Wallet;
  config: AppConfig;
  store: PendingStore;
  /** Randomness for the salt; tests can fix it. */
  newSalt?: () => Hex;
  now?: () => number;
}

export interface MintInput {
  program: Hex;
  puzzleId: number;
  nodeCount: number;
}

/** A failure whose message is already fit to show a player. */
export class MintError extends Error {}

// ------------------------------------------------------------------ messages

const EXPIRED = "The 250-block reveal window for this commit has passed. Commit again, with a new salt.";

/** Trials 0 and 1 are fixed edge cases, trials 2 to 9 random, and the contract only reports a trial its own puzzle has, so any from TRIALS on is one of the puzzle's further fixed cases. */
const isFixedTrial = (trial: number): boolean => trial < 2 || trial >= TRIALS;

/** What the contract can revert with: the names of the errors in its ABI. */
type ErrorName = Extract<(typeof ProofkinAbi)[number], { type: "error" }>["name"];
type Reason = (args: readonly unknown[]) => string;

const reasons = {
  NoCommit: () => "There is no commit for this program from this account: the account, the program or the salt does not match what was committed.",
  TooEarly: () => "Too early: a reveal has to wait until the commit is three blocks old.",
  Expired: () => EXPIRED,
  NoBlockhash: () => "The chain no longer holds the block hash this commit needs. Commit again, with a new salt.",
  WrongPayment: () => "The payment does not match the mint price.",
  AlreadyMinted: () => "This exact program has already been minted.",
  PuzzleFull: () => "All 50 slots of this puzzle are taken.",
  AlreadyCommitted: () => "This commit has already been made.",
  SolveFailed: ([trial]) =>
    `The contract's own check failed on trial ${trial} (${isFixedTrial(Number(trial)) ? "one of the fixed edge cases" : "one of its random cases"}). ` +
    "A program that passes the local test can still fail the contract's cases: test it harder.",
  BadLength: vmInvalid("its length does not match its header"),
  BadVersion: vmInvalid("its version is wrong"),
  BadPuzzle: vmInvalid("it names a puzzle that does not exist"),
  BadNodeCount: vmInvalid("it has no nodes or more than 64"),
  BadOutCount: vmInvalid("it has the wrong number of output slots"),
  BadOpcode: vmInvalid("a node has an unknown operation", true),
  UnusedFieldNotZero: vmInvalid("a node has a field it does not use set", true),
  OperandNotEarlier: vmInvalid("a node uses a node declared after it", true),
  BadInputIndex: vmInvalid("a node reads an input the puzzle does not have", true),
  BadOutputIndex: vmInvalid("an output slot points at no node", true),
  DeadNode: ([node]) => `The program is not valid: node ${node} feeds no output.`,
} satisfies Partial<Record<ErrorName, Reason>>;

function vmInvalid(what: string, withIndex = false): Reason {
  return ([index]) => `The program is not valid: ${what}${withIndex ? ` (node ${index})` : ""}.`;
}

/** The errors a minter is told about, in words. */
export const MINT_ERROR_NAMES = Object.keys(reasons) as ErrorName[];

/**
 * The contract's other errors, which a minter cannot meet at commit or reveal. Listing them is what makes the map
 * exhaustive: `errors.test.ts` fails when the contract gains an error that is in neither list, so a new revert cannot
 * reach a player as a raw name.
 */
export const NOT_ON_THE_MINT_PATH = [
  // the owner's: ownership and the renderer (the admin console)
  "AlreadyInitialized",
  "InvalidRenderer",
  "NewOwnerIsZeroAddress",
  "NoHandoverRequest",
  "RendererLocked",
  "Unauthorized",
  // the token standard's: transfers, approvals and balances, and a token that does not exist
  "AccountBalanceOverflow",
  "BalanceQueryForZeroAddress",
  "NotOwnerNorApproved",
  "TokenDoesNotExist",
  "TransferFromIncorrectOwner",
  "TransferToNonERC721ReceiverImplementer",
  "TransferToZeroAddress",
  // unreachable: ids are sequential, and a program that validated has the right puzzle and input count
  "TokenAlreadyExists",
  "BadInputLength",
  "UnknownPuzzle",
] as const satisfies readonly ErrorName[];

/** Turns anything thrown on the way into a sentence for the player. */
export function friendlyError(err: unknown): string {
  if (err instanceof MintError) return err.message;
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "You rejected the request in your wallet.";
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      const describe = name ? (reasons as Partial<Record<string, Reason>>)[name] : undefined;
      if (describe) return describe(reverted.data?.args ?? []);
      return reverted.reason ?? reverted.shortMessage;
    }
    return err.shortMessage;
  }
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Something went wrong.";
}

// ---------------------------------------------------------------------- flow

/** Step 1: choose the salt and write the commit down. Nothing is sent, and nothing can be lost from here on. */
export async function prepareCommit(deps: MintDeps, input: MintInput): Promise<PendingCommit> {
  const account = deps.walletClient.account.address;
  const salt = (deps.newSalt ?? newSalt)();
  const pending: PendingCommit = {
    version: 1,
    chainId: deps.config.chain.id,
    contract: deps.config.proofkin,
    account,
    program: input.program,
    salt,
    hash: commitHash(input.program, account, salt),
    puzzleId: input.puzzleId,
    nodeCount: input.nodeCount,
    status: "prepared",
    createdAt: (deps.now ?? Date.now)(),
  };
  deps.store.save(pending);
  return pending;
}

/** Step 2: send the commit and record the block it landed in. */
export async function sendCommit(deps: MintDeps, pending: PendingCommit): Promise<PendingCommit> {
  const { publicClient, walletClient, config } = deps;
  const { request } = await publicClient.simulateContract({
    address: config.proofkin,
    abi: proofkinAbi,
    functionName: "commit",
    args: [pending.hash],
    account: walletClient.account,
  });
  const commitTx = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: commitTx });
  if (receipt.status !== "success") throw new MintError("The commit transaction failed on chain.");

  const next: PendingCommit = { ...pending, status: "committed", commitBlock: Number(receipt.blockNumber), commitTx };
  deps.store.save(next);
  return next;
}

/** A commit that landed while this page was not listening (closed tab, lost receipt) is picked up from the chain. */
export async function reconcile(deps: MintDeps, pending: PendingCommit): Promise<PendingCommit> {
  if (pending.status !== "prepared") return pending;
  const block = await commitBlockOf(deps.publicClient, deps.config, pending.hash);
  if (block === 0) return pending;
  const next: PendingCommit = { ...pending, status: "committed", commitBlock: block };
  deps.store.save(next);
  return next;
}

export async function phaseOf(deps: MintDeps, pending: PendingCommit): Promise<RevealPhase> {
  if (pending.commitBlock === undefined) throw new MintError("This commit has not been sent yet.");
  return revealPhase(pending.commitBlock, await currentBlock(deps.publicClient));
}

/** Step 3: reveal, once the commit is old enough and before the window closes. */
export async function sendReveal(deps: MintDeps, pending: PendingCommit): Promise<PendingCommit> {
  const { publicClient, walletClient, config } = deps;

  // Near the end of the window a simulation can still pass (it runs on the latest block) while the
  // transaction would be mined after the window closes. The phase knows better, and saves the gas.
  if ((await phaseOf(deps, pending)).phase === "expired") throw new MintError(EXPIRED);

  const mintPrice = await publicClient.readContract({ address: config.proofkin, abi: proofkinAbi, functionName: "mintPrice" });
  const { request } = await publicClient.simulateContract({
    address: config.proofkin,
    abi: proofkinAbi,
    functionName: "reveal",
    args: [pending.program, pending.salt],
    value: mintPrice,
    account: walletClient.account,
  });
  const revealTx = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: revealTx });
  if (receipt.status !== "success") {
    throw new MintError("The reveal was mined but reverted, most likely because it landed after the window closed. Commit again.");
  }

  const [solved] = parseEventLogs({ abi: proofkinAbi, logs: receipt.logs, eventName: "Solved" });
  const next: PendingCommit = { ...pending, status: "revealed", revealTx, tokenId: solved ? Number(solved.args.tokenId) : undefined };
  deps.store.save(next);
  return next;
}
