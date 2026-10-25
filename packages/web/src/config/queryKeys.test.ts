import { type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { requireAppConfig } from "@/config/env";
import { queryKeys } from "@/config/queryKeys";

const env = {
  NEXT_PUBLIC_CHAIN: "baseSepolia",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
};
const app = requireAppConfig(env);
const otherChain = requireAppConfig({ ...env, NEXT_PUBLIC_CHAIN: "base" });
const otherCollection = requireAppConfig({
  ...env,
  NEXT_PUBLIC_PROOFKIN: "0x0000000000000000000000000000000000000001",
});

const PROGRAM: Hex = "0x010203";
const seedOf = (byte: string): Hex => `0x${byte.repeat(32)}`;
const SEED = seedOf("ab");

describe("queryKeys", () => {
  it("are the same for the same question, so the answer is found again", () => {
    expect(queryKeys.preview(app, PROGRAM, SEED)).toEqual(queryKeys.preview(app, PROGRAM, SEED));
    expect(queryKeys.programStatus(app, PROGRAM)).toEqual(queryKeys.programStatus(app, PROGRAM));
  });

  it("differ by program and by seed, since each draws a different picture", () => {
    expect(queryKeys.preview(app, PROGRAM, SEED)).not.toEqual(queryKeys.preview(app, "0x040506" as Hex, SEED));
    expect(queryKeys.preview(app, PROGRAM, SEED)).not.toEqual(queryKeys.preview(app, PROGRAM, seedOf("cd")));
  });

  it("name the chain and the collection, so an answer from one deployment is never shown for another", () => {
    expect(queryKeys.preview(app, PROGRAM, SEED)).not.toEqual(queryKeys.preview(otherChain, PROGRAM, SEED));
    expect(queryKeys.preview(app, PROGRAM, SEED)).not.toEqual(queryKeys.preview(otherCollection, PROGRAM, SEED));
    expect(queryKeys.programStatus(app, PROGRAM)).not.toEqual(queryKeys.programStatus(otherChain, PROGRAM));
    expect(queryKeys.programStatus(app, PROGRAM)).not.toEqual(queryKeys.programStatus(otherCollection, PROGRAM));
  });

  it("name the chain and the collection for the latest block, too", () => {
    expect(queryKeys.latestBlock(app)).toEqual(queryKeys.latestBlock(app));
    expect(queryKeys.latestBlock(app)).not.toEqual(queryKeys.latestBlock(otherChain));
    expect(queryKeys.latestBlock(app)).not.toEqual(queryKeys.latestBlock(otherCollection));
  });

  it("give every program's status one shared beginning, so a mint can end them all at once, for this collection only", () => {
    const all = queryKeys.programStatuses(app);
    expect(queryKeys.programStatus(app, PROGRAM).slice(0, all.length)).toEqual(all);
    expect(queryKeys.programStatus(app, "0x040506" as Hex).slice(0, all.length)).toEqual(all);
    expect(queryKeys.programStatus(otherChain, PROGRAM).slice(0, all.length)).not.toEqual(all);
    expect(queryKeys.programStatus(otherCollection, PROGRAM).slice(0, all.length)).not.toEqual(all);
  });

  it("name the chain and the collection for the console's view of it, so one deployment's state is never shown for another", () => {
    expect(queryKeys.collectionStatus(app)).toEqual(queryKeys.collectionStatus(app));
    expect(queryKeys.collectionStatus(app)).not.toEqual(queryKeys.collectionStatus(otherChain));
    expect(queryKeys.collectionStatus(app)).not.toEqual(queryKeys.collectionStatus(otherCollection));
    expect(queryKeys.collectionStatus(app)[0]).not.toBe(queryKeys.latestBlock(app)[0]);
  });

  it("keep the two questions apart, even for the same program", () => {
    expect(queryKeys.preview(app, PROGRAM, SEED)[0]).not.toBe(queryKeys.programStatus(app, PROGRAM)[0]);
  });
});
