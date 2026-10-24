import { getTokenArt } from "@/chain/art";
import { getCollection } from "@/chain/collection";
import { readAppConfig } from "@/config/env";
import { parseTokenId } from "@/config/routes";

const refuse = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

/**
 * @notice A token's art, as an image at an address of its own.
 * @dev (1) The art is the contract's SVG, served separately from the pages so their HTML stays small and a browser
 * fetches only the plates that scroll into view. (2) The supply is checked first, from the cache, because anyone can
 * ask for any number and each unknown one would otherwise cost the node a call. (3) The image is only an image: the
 * policy stops anything in it from running if the address is opened directly, and `nosniff` stops a browser from
 * guessing otherwise. (4) A browser keeps it five minutes and a CDN an hour: the art changes only if the owner swaps
 * the renderer before locking it.
 * @param _request - Unused.
 * @param context - `params`: the address segment `id`.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = parseTokenId((await context.params).id);
  if (id === undefined) return refuse(404);

  const config = readAppConfig();
  if (!config.ok) return refuse(503);

  const collection = await getCollection(config.config);
  if (!collection) return refuse(502);
  if (id > collection.totalSupply) return refuse(404);

  const art = await getTokenArt(config.config, id);
  if (art.kind === "missing") return refuse(404);
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
