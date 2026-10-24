import { paths } from "@/config/routes";

/**
 * @notice A token's art: the contract's own SVG, as a dark plate.
 * @dev (1) A plain `<img>`, not `next/image`: the art is an SVG served from its own address with its own cache
 * headers, and an optimiser has nothing to do with it. (2) The width and height are the art's, so the square is held
 * before it arrives. (3) The SVG animates itself, which an `<img>` allows and a script would not.
 * @param props - `id`: the token. `alt`: what the art is, or "" when the words beside it already say. `priority`:
 * load it now, for the first thing on a page; every other plate waits until it is scrolled to.
 */
export function Plate({ id, alt, priority = false }: { id: number; alt: string; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an SVG with its own address and headers, see above
    <img
      src={paths.art(id)}
      alt={alt}
      width={600}
      height={600}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className="block aspect-square w-full rounded-[2px] bg-plate"
    />
  );
}
