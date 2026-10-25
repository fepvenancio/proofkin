// What the admin console shows about a collection, read from the chain.
import type { Address } from "viem";
import { proofkinAbi } from "../abi.ts";
import type { Reader } from "../chain.ts";

export interface CollectionAdminState {
  owner: Address;
  renderer: Address;
  rendererLocked: boolean;
  /** In wei. */
  mintPrice: bigint;
  totalSupply: bigint;
  /** The fees the contract holds, in wei: what `withdraw` would send to the owner. */
  balance: bigint;
}

/**
 * @notice Everything the console needs to know about a collection, read at once.
 * @dev Never cached: the console is where a change is made, and has to show it the moment it lands.
 * @param client - A read-only client for the collection's chain.
 * @param proofkin - The collection.
 * @returns Its owner, renderer, whether the renderer is locked, price, supply and fees held.
 */
export async function readCollectionAdmin(client: Reader, proofkin: Address): Promise<CollectionAdminState> {
  const read = <N extends "owner" | "renderer" | "rendererLocked" | "mintPrice" | "totalSupply">(functionName: N) =>
    client.readContract({ address: proofkin, abi: proofkinAbi, functionName });
  const [owner, renderer, rendererLocked, mintPrice, totalSupply, balance] = await Promise.all([
    read("owner"),
    read("renderer"),
    read("rendererLocked"),
    read("mintPrice"),
    read("totalSupply"),
    client.getBalance({ address: proofkin }),
  ]);
  return { owner, renderer, rendererLocked, mintPrice, totalSupply, balance };
}
