import { describe, expect, it } from "vitest";
import { type PendingCommit, PendingStore, type StorageLike } from "../src/storage.ts";
import { MemoryStorage } from "../src/testing/memoryStorage.ts";

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const pending = (over: Partial<PendingCommit> = {}): PendingCommit => ({
  version: 1,
  chainId: 31337,
  contract: CONTRACT,
  account: ALICE,
  program: "0x0100010100000000ff",
  salt: `0x${"11".repeat(32)}`,
  hash: `0x${"aa".repeat(32)}`,
  puzzleId: 0,
  nodeCount: 1,
  status: "prepared",
  createdAt: 1_700_000_000_000,
  ...over,
});

describe("PendingStore", () => {
  it("saves a commit and reads it back, keyed by its hash", () => {
    const store = new PendingStore(new MemoryStorage());
    store.save(pending());
    expect(store.get(`0x${"aa".repeat(32)}`)).toEqual(pending());
    expect(store.get(`0x${"bb".repeat(32)}`)).toBeUndefined();
  });

  it("survives a new store over the same storage, which is the point: a closed tab loses nothing", () => {
    const backing = new MemoryStorage();
    new PendingStore(backing).save(pending());
    expect(new PendingStore(backing).get(`0x${"aa".repeat(32)}`)).toEqual(pending());
  });

  it("lists only the commits of one account on one chain and contract, newest first", () => {
    const store = new PendingStore(new MemoryStorage());
    store.save(pending({ hash: `0x${"01".repeat(32)}`, createdAt: 100 }));
    store.save(pending({ hash: `0x${"02".repeat(32)}`, createdAt: 300 }));
    store.save(pending({ hash: `0x${"03".repeat(32)}`, createdAt: 200 }));
    store.save(pending({ hash: `0x${"04".repeat(32)}`, account: BOB }));
    store.save(pending({ hash: `0x${"05".repeat(32)}`, chainId: 84532 }));
    store.save(pending({ hash: `0x${"06".repeat(32)}`, contract: BOB }));

    const mine = store.list({ chainId: 31337, contract: CONTRACT, account: ALICE });
    expect(mine.map((p) => p.hash)).toEqual([`0x${"02".repeat(32)}`, `0x${"03".repeat(32)}`, `0x${"01".repeat(32)}`]);
  });

  it("matches the account and contract regardless of address letter case", () => {
    const store = new PendingStore(new MemoryStorage());
    store.save(pending());
    expect(store.list({ chainId: 31337, contract: CONTRACT.toLowerCase() as `0x${string}`, account: ALICE.toLowerCase() as `0x${string}` })).toHaveLength(1);
  });

  it("updates a commit as the flow moves on", () => {
    const store = new PendingStore(new MemoryStorage());
    store.save(pending());
    store.update(`0x${"aa".repeat(32)}`, { status: "committed", commitBlock: 1234 });
    expect(store.get(`0x${"aa".repeat(32)}`)).toMatchObject({ status: "committed", commitBlock: 1234, salt: `0x${"11".repeat(32)}` });
  });

  it("removes a commit", () => {
    const store = new PendingStore(new MemoryStorage());
    store.save(pending());
    store.remove(`0x${"aa".repeat(32)}`);
    expect(store.get(`0x${"aa".repeat(32)}`)).toBeUndefined();
  });

  it("skips an entry it cannot read instead of failing the whole list", () => {
    const backing = new MemoryStorage();
    const store = new PendingStore(backing);
    store.save(pending());
    backing.setItem("proofkin:pending:v1:31337:junk", "{not json");
    backing.setItem("proofkin:pending:v1:31337:other", JSON.stringify({ version: 99 }));
    expect(store.list({ chainId: 31337, contract: CONTRACT, account: ALICE })).toHaveLength(1);
  });

  it("says whether it can really persist", () => {
    expect(new PendingStore(new MemoryStorage()).persistent).toBe(true);
    expect(new PendingStore(undefined).persistent).toBe(false);
  });

  it("falls back to memory when the browser refuses to store, and says so", () => {
    const refusing: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    };
    const store = new PendingStore(refusing);
    store.save(pending());
    expect(store.persistent).toBe(false);
    expect(store.get(`0x${"aa".repeat(32)}`)).toEqual(pending()); // still works for this session
  });
});
