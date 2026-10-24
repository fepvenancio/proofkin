import Link from "next/link";

import { type GalleryQuery, paths } from "@/config/routes";

/**
 * @notice Newer and older pages of the gallery.
 * @dev The gallery is newest first, so the way back is "Newer". It keeps the puzzle being looked at, and says nothing at
 * all when everything fits on one page.
 * @param props - `query`: the filter and page being shown. `pages`: how many pages there are.
 */
export function Pager({ query, pages }: { query: GalleryQuery; pages: number }) {
  if (pages <= 1) return null;
  const to = (page: number) => paths.gallery({ ...query, page });
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-4 border-t border-rule pt-5 tabular-nums">
      {query.page > 1 ? (
        <Link href={to(query.page - 1)} className="underline underline-offset-4">
          Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="text-graphite">{`Page ${query.page} of ${pages}`}</span>
      {query.page < pages ? (
        <Link href={to(query.page + 1)} className="underline underline-offset-4">
          Older
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
