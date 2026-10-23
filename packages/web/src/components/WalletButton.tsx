"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

/**
 * @notice The wallet button: connect, switch network, show the account.
 * @dev A client component, because a wallet exists only in the browser. It is a leaf, so the page around it stays a
 * server component and only this island ships wallet code.
 */
export function WalletButton() {
  return <ConnectButton />;
}
