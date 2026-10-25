"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * @notice Whether this is the browser, after the page has been handed over from the server.
 * @dev `useSyncExternalStore` answers with its server snapshot while the browser hydrates the server's HTML, and with
 * the client snapshot from then on, so the first browser render matches the server's exactly and the next one can use
 * what only a browser has (storage, randomness) without an effect that sets state.
 * @returns False on the server and during hydration; true after.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
