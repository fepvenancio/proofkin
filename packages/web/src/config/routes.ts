import { PUZZLE_INFO, SLOTS_PER_PUZZLE } from "@proofkin/core";

/* //////////////////////////////////////////////////////////////
                              PUZZLES
//////////////////////////////////////////////////////////////*/

const slugs = PUZZLE_INFO.map((puzzle) => puzzle.name.toLowerCase().replaceAll("_", "-"));
const puzzleBySlug = new Map(slugs.map((slug, id) => [slug, id]));

/**
 * @notice The address segment of a puzzle: `SORT8` is `sort8`, `GRID_PATH` is `grid-path`.
 * @param id - The puzzle's id, 0 to 5.
 * @returns The slug.
 */
export function puzzleSlug(id: number): string {
  return slugs[id]!;
}

/**
 * @notice The puzzle a slug names.
 * @dev A lookup in a map, not in an object, so `constructor` and `__proto__` are not puzzles. Only the exact slug
 * counts, so a puzzle has one address and a search engine sees one page.
 * @param slug - A path segment.
 * @returns The puzzle's id, or undefined.
 */
export function puzzleFromSlug(slug: string): number | undefined {
  return puzzleBySlug.get(slug);
}

/* //////////////////////////////////////////////////////////////
                               TOKENS
//////////////////////////////////////////////////////////////*/

/** Plain digits with no sign, no leading zero and at most nine of them, so a number is spelled one way. */
const WHOLE_NUMBER = /^[1-9]\d{0,8}$/;

/** The most tokens the collection can ever hold: 6 puzzles of 50 slots. */
export const MAX_TOKEN_ID = SLOTS_PER_PUZZLE * PUZZLE_INFO.length;

/**
 * @notice The token an address segment names.
 * @dev (1) Token ids start at 1 and the collection holds at most 300, so anything above that is refused without asking
 * anyone. (2) Whether a token below that exists is the contract's to say, not a cached supply's: the supply may be a
 * minute old, and a token minted a moment ago must not be a 404.
 * @param raw - A path segment.
 * @param bound - The highest id to accept; the collection's capacity unless a caller knows better.
 * @returns The id, or undefined.
 */
export function parseTokenId(raw: string, bound = MAX_TOKEN_ID): number | undefined {
  if (!WHOLE_NUMBER.test(raw)) return undefined;
  const id = Number(raw);
  return id <= bound ? id : undefined;
}

/* //////////////////////////////////////////////////////////////
                              GALLERY
//////////////////////////////////////////////////////////////*/

/** Tokens per page of the gallery: four rows of six, or six of four. */
export const PAGE_SIZE = 24;

export interface GalleryQuery {
  /** Only this puzzle's tokens; every puzzle when absent. */
  puzzle?: number;
  /** 1-based. */
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * @notice Reads the gallery's filter and page from the address.
 * @dev (1) Never throws and never refuses: a stale or mistyped link shows the gallery, not an error. (2) Whether a
 * page exists is for the caller to say, because it needs the count.
 * @param params - The search parameters, as Next.js hands them over.
 * @returns The puzzle (if a known one was named) and the page.
 */
export function parseGalleryQuery(params: SearchParams): GalleryQuery {
  const slug = first(params.puzzle);
  const puzzle = slug === undefined ? undefined : puzzleFromSlug(slug);
  const page = first(params.page);
  const query: GalleryQuery = { page: page !== undefined && WHOLE_NUMBER.test(page) ? Number(page) : 1 };
  return puzzle === undefined ? query : { puzzle, page: query.page };
}

/**
 * @param total - How many tokens there are to show.
 * @returns How many pages they make; one, even for none, so the first page always exists.
 */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/**
 * @param list - Everything to show, in order.
 * @param page - 1-based.
 * @returns That page's share of the list; empty beyond the last page.
 */
export function pageOf<T>(list: readonly T[], page: number): T[] {
  return list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

/* //////////////////////////////////////////////////////////////
                               PATHS
//////////////////////////////////////////////////////////////*/

/**
 * @notice Every address the app serves, built in one place.
 * @dev The first page and "every puzzle" are the defaults, and a default is left out of the address, so each view of
 * the gallery has one spelling.
 */
export const paths = {
  home: "/",
  gallery({ puzzle, page }: GalleryQuery): string {
    const params = new URLSearchParams();
    if (puzzle !== undefined) params.set("puzzle", puzzleSlug(puzzle));
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/gallery?${query}` : "/gallery";
  },
  puzzle: (id: number) => `/puzzles/${puzzleSlug(id)}`,
  solve: (id: number) => `/puzzles/${puzzleSlug(id)}/solve`,
  token: (id: number) => `/token/${id}`,
  art: (id: number) => `/token/${id}/art`,
};

/* //////////////////////////////////////////////////////////////
                             SECTIONS
//////////////////////////////////////////////////////////////*/

export type Section = "puzzles" | "gallery";

const under = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/**
 * @notice Which part of the site a page belongs to, for the navigation to say so.
 * @dev A token page belongs to the gallery and a puzzle page to Puzzles, which is also the home page. Matching on the
 * whole segment keeps `/galleryx` out.
 * @param pathname - The page's path.
 * @returns The section, or undefined for a page that is in neither.
 */
export function currentSection(pathname: string): Section | undefined {
  if (pathname === "/" || under(pathname, "/puzzles")) return "puzzles";
  if (under(pathname, "/gallery") || under(pathname, "/token")) return "gallery";
  return undefined;
}
