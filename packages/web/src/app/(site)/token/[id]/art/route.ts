import { getTokenArt } from "@/chain/art";
import { readAppConfig } from "@/config/env";
import { parseTokenId } from "@/config/routes";

const refuse = (status: number, cache = "no-store") =>
  new Response(null, { status, headers: { "cache-control": cache } });

/**
 * @notice A token's art, as an image at an address of its own.
 * @dev (1) The art is the contract's SVG, served separately from the pages so their HTML stays small and a browser
 * fetches only the plates that scroll into view. (2) Anyone can ask for any number, so one above the 300 the collection
 * can hold is refused without a read. Below that the contract says whether the token exists, not a cached supply: the
 * supply may be a minute old, and a plate the gallery already shows would be a broken image. (3) An unminted id costs
 * the node a cheap call each time, so that "not found" is kept for five seconds, by a CDN too, and no longer: the token
 * may be minted a moment later. (4) The image is only an image: the policy stops anything in it from running if the
 * address is opened directly, and `nosniff` stops a browser from guessing otherwise. (5) A browser keeps it five minutes
 * and a CDN an hour: the art changes only if the owner swaps the renderer before locking it.
 * @param _request - Unused.
 * @param context - `params`: the address segment `id`.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = parseTokenId((await context.params).id);
  if (id === undefined) return refuse(404);

  const config = readAppConfig();
  if (!config.ok) return refuse(503);

  const art = await getTokenArt(config.config, id);
  if (art.kind === "missing") return refuse(404, "public, max-age=5, s-maxage=5");
  if (art.kind === "unavailable") return refuse(502);

  return new Response(art.value, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
