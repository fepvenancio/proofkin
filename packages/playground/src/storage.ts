// A commit is useless without its salt, and the salt exists only in this browser. So the salt is written
// down before the commit is sent, and a closed tab can pick the flow up again.
import type { Address, Hex } from "viem";

/** The part of `window.localStorage` this uses, so tests can bring their own. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PendingCommit {
  version: 1;
  chainId: number;
  contract: Address;
  account: Address;
  /** The program bytes, hex. */
  program: Hex;
  salt: Hex;
  /** The commit hash; also the key. */
  hash: Hex;
  puzzleId: number;
  nodeCount: number;
  /** prepared: saved, commit not yet sent. committed: mined. revealed: token minted. */
  status: "prepared" | "committed" | "revealed";
  commitBlock?: number;
  commitTx?: Hex;
  revealTx?: Hex;
  tokenId?: number;
  createdAt: number;
}

const PREFIX = "proofkin:pending:v1:";

function parse(raw: string | null): PendingCommit | undefined {
  if (raw === null) return undefined;
  try {
    const p = JSON.parse(raw) as Partial<PendingCommit>;
    const ok =
      p.version === 1 &&
      typeof p.chainId === "number" &&
      typeof p.contract === "string" &&
      typeof p.account === "string" &&
      typeof p.program === "string" &&
      typeof p.salt === "string" &&
      typeof p.hash === "string" &&
      typeof p.createdAt === "number";
    return ok ? (p as PendingCommit) : undefined;
  } catch {
    return undefined;
  }
}

export class PendingStore {
  /** False when entries live only in memory: the browser has no storage or refused to write. */
  persistent: boolean;
  private readonly memory = new Map<string, PendingCommit>();
  private readonly storage: StorageLike | undefined;

  constructor(storage: StorageLike | undefined) {
    this.storage = storage;
    this.persistent = storage !== undefined;
  }

  save(p: PendingCommit): void {
    this.memory.set(p.hash, p);
    if (!this.storage) return;
    try {
      this.storage.setItem(PREFIX + p.hash, JSON.stringify(p));
    } catch {
      this.persistent = false;
    }
  }

  get(hash: Hex): PendingCommit | undefined {
    if (this.storage) {
      try {
        const stored = parse(this.storage.getItem(PREFIX + hash));
        if (stored) return stored;
      } catch {
        // fall through to memory
      }
    }
    return this.memory.get(hash);
  }

  update(hash: Hex, patch: Partial<PendingCommit>): void {
    const current = this.get(hash);
    if (current) this.save({ ...current, ...patch });
  }

  remove(hash: Hex): void {
    this.memory.delete(hash);
    try {
      this.storage?.removeItem(PREFIX + hash);
    } catch {
      // nothing more to do
    }
  }

  /** One account's commits on one chain and contract, newest first. */
  list(filter: { chainId: number; contract: Address; account: Address }): PendingCommit[] {
    const all = new Map<string, PendingCommit>(this.memory);
    if (this.storage) {
      try {
        for (let i = 0; i < this.storage.length; i++) {
          const key = this.storage.key(i);
          if (!key?.startsWith(PREFIX)) continue;
          const p = parse(this.storage.getItem(key));
          if (p) all.set(p.hash, p);
        }
      } catch {
        // storage became unreadable: whatever memory holds is what there is
      }
    }
    return [...all.values()]
      .filter(
        (p) =>
          p.chainId === filter.chainId &&
          p.contract.toLowerCase() === filter.contract.toLowerCase() &&
          p.account.toLowerCase() === filter.account.toLowerCase(),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}
