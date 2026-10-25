/**
 * @notice `window.localStorage`, or nothing.
 * @dev Reading it throws in some private modes and with site data blocked, and there is no window on a server; neither is
 * an error for a page whose storage is a convenience, so both are "no storage". Drafts and saved commits take it as an
 * optional argument and carry on without.
 * @returns The storage, if the browser has one and allows it.
 */
export function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
