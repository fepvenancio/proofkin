/**
 * @notice An SVG as a `data:` address that an `<img>` can draw.
 * @dev Drawn as an image, nothing in it runs, which is why the contract's own drawing may be shown this way and never
 * inserted as markup. `btoa` only takes Latin-1, so the text is encoded to bytes first, in chunks that stay under the
 * argument limit of `String.fromCharCode`.
 * @param svg - The markup.
 * @returns A base64 `data:image/svg+xml` address.
 */
export function svgDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
