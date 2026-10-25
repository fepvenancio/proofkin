import { ConfigProblems } from "@/components/ConfigProblems";
import { readAppConfig } from "@/config/env";

import type { ReactNode } from "react";

/**
 * @notice The layout of the pages that read the collection: the home page, the gallery, the puzzles and the tokens.
 * @dev A deployment whose contracts are not set shows what is wrong in place of the page, inside the root layout. The
 * admin console is outside this group on purpose: it has to work before there is a collection.
 * @param props - `children`: the page.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  const config = readAppConfig();
  return config.ok ? children : <ConfigProblems problems={config.problems} />;
}
