/**
 * @notice What a visitor sees when the chain could not be read.
 * @dev It names the chain and nothing about how it was reached: the server reads through a private RPC URL that may
 * carry a key, and the reason is in the server log, not on the page.
 * @param props - `chainName`: the chain's display name, as the wallet shows it.
 */
export function CollectionUnavailable({ chainName }: { chainName: string }) {
  return <p role="status">Could not reach {chainName} right now, so the collection cannot be shown.</p>;
}
