import Link from "next/link";

import { NavLinks } from "@/components/NavLinks";
import { WalletButton } from "@/components/WalletButton";
import { SITE_NAME } from "@/config/site";

/**
 * @notice The top of every page: the name, the navigation and the wallet button.
 * @dev On a phone the navigation drops to a row of its own under the name and the button.
 */
export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-5 sm:px-6">
      <Link href="/" className="text-xl font-semibold tracking-tight">
        {SITE_NAME}
      </Link>
      <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
        <NavLinks />
      </div>
      <WalletButton />
    </header>
  );
}
