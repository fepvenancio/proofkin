import "server-only";

import { type AppConfig, fetchToken } from "@proofkin/core";

import { cachedRead } from "@/chain/cache";
import { settle } from "@/chain/failure";
import { getServerClient } from "@/chain/server";
import { type ReadResult } from "@/model/data";

/** Markup an image has no business containing: anything that runs, embeds, links or loads from elsewhere. */
const FORBIDDEN = [
  /<\s*(?:script|foreignObject|image|use|a|iframe|object|embed)\b/i,
  /\bhref\s*=/i,
  /@import/i,
  /\bon[a-z]+\s*=/i,
  /javascript:/i,
  // A paint server may only be one of the document's own: `url(#g)`.
  /url\(\s*(?!['"]?#)/i,
];

/**
 * @notice Whether an SVG may be served from this site's own address.
 * @dev (1) The renderer is the owner's to replace until it is locked, and the page serves what it draws from the
 * site's origin, so the image is checked rather than trusted: it must be one whole SVG document and contain nothing
 * that runs, embeds, links or loads from elsewhere. (2) The six creatures the contract draws today all pass.
 * @param svg - The markup the contract returned.
 * @returns True when it is safe to serve.
 */
export function isSafeSvg(svg: string): boolean {
  const document = svg.trim();
  if (!document.startsWith("<svg") || !document.endsWith("</svg>")) return false;
  return !FORBIDDEN.some((pattern) => pattern.test(document));
}

/**
 * @notice The SVG the contract draws for a token.
 * @dev The image is the expensive read of the app (the contract renders it, up to 3.4M gas), so it goes through the
 * cache, and it is served from its own address so the gallery's HTML carries none of it and a browser fetches only the
 * plates that scroll into view.
 * @param app - The deployment to read.
 * @param id - The token.
 * @param env - The server settings; the real ones unless a test supplies others.
 * @returns The SVG; or that the token does not exist; or that it could not be read, or was not safe.
 */
export function getTokenArt(
  app: AppConfig,
  id: number,
  env?: Record<string, string | undefined>,
): Promise<ReadResult<string>> {
  return settle(app, "the token's art", () =>
    cachedRead(
      app,
      `art-${id}`,
      async () => {
        const { svg } = await fetchToken(getServerClient(app, env), app, id);
        if (!isSafeSvg(svg)) throw new Error("The token's image is not safe to serve.");
        return svg;
      },
      ["art", `art-${id}`],
    ),
  );
}
