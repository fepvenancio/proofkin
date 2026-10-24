import { type Address } from "viem";

/*
 * The shapes the pages share. They are plain numbers and strings (declared with `type`, which has the implicit index
 * signature `Json` needs) because everything read from the chain is stored in the cache as JSON. Kept outside `chain/`
 * so a component can name them without reaching a module that only a server may import.
 */

/**
 * Anything a cache can hold. The cache stores JSON, so a `bigint` (the contract's prices and counts) or a class
 * instance is a type error where it is written instead of a failure in production. Describe data with `type`, not
 * `interface`: an interface has no index signature, so it does not match.
 */
export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json | undefined };

/** The state of the collection. The price is wei as a decimal string, because a JSON number cannot hold it. */
export type CollectionData = {
  mintPrice: string;
  totalSupply: number;
  /** Per puzzle. */
  solvedCount: number[];
  /** Smallest node count solved so far per puzzle; 255 until the first solve. */
  bestNodes: number[];
};

/**
 * One solution: which token, which puzzle, who solved it, how small, and in what order. The `Solved` events are the
 * whole of the gallery, the leaderboards and the slot strips, so none of them needs a token rendered. The block the
 * solution was minted in is left out: no page shows it.
 */
export type SolvedEntry = {
  tokenId: number;
  puzzleId: number;
  author: Address;
  nodeCount: number;
  /** 1-based solve order within the puzzle. */
  rank: number;
};

/** What the token page shows beyond what the gallery knows: the contract's traits, and who owns it now. */
export type TokenDetail = {
  id: number;
  name: string;
  attributes: { trait: string; value: string | number }[];
  owner: Address;
};

/**
 * The three ways a read of one token can end. A token that does not exist is a "not found" page, a node that cannot be
 * read is "try again", and neither is an exception the caller has to know to catch.
 */
export type ReadResult<T> = { kind: "found"; value: T } | { kind: "missing" } | { kind: "unavailable" };
