import { type AppConfig } from "@proofkin/core";
import { type Address, type Hex } from "viem";

/**
 * @notice Every TanStack Query key the app uses, in one place.
 * @dev (1) A key that is spelled where it is used is spelled differently where it is invalidated, and the page then
 * shows an answer nobody asked for. (2) Each key names the chain and the collection, so an answer read from one
 * deployment is never shown for another.
 */
export const queryKeys = {
  /** What `Renderer.render` draws for a program and a seed. Deterministic, so it never goes stale. */
  preview: (app: AppConfig, program: Hex, seed: Hex) => ["preview", app.chain.id, app.proofkin, program, seed] as const,
  /** The chain's newest block, which tells a saved commit whether its reveal window is still open. */
  latestBlock: (app: AppConfig) => ["latestBlock", app.chain.id, app.proofkin] as const,
  /** What the console shows about a collection: its owner, renderer, price, supply and the fees it holds. */
  collectionStatus: (collection: { chain: { id: number }; proofkin: Address }) =>
    ["collectionStatus", collection.chain.id, collection.proofkin] as const,
  /** The beginning every `programStatus` key shares: what a mint ends, since it changes the answer for its program. */
  programStatuses: (app: AppConfig) => ["programStatus", app.chain.id, app.proofkin] as const,
  /** What the contract says about an exact program: free, already minted, or its puzzle full. */
  programStatus: (app: AppConfig, program: Hex) => [...queryKeys.programStatuses(app), program] as const,
};
