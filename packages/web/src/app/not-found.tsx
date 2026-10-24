import Link from "next/link";

/**
 * @notice What a visitor sees for an address that is no page: an unknown puzzle, a token nobody has minted, a page of
 * the gallery past the last.
 */
export default function NotFound() {
  return (
    <section className="py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-4 max-w-prose text-lg text-graphite">
        There is nothing at this address. A token appears here once someone has solved a puzzle and minted it.
      </p>
      <p className="mt-6 flex gap-6">
        <Link href="/" className="underline underline-offset-4">
          See the puzzles
        </Link>
        <Link href="/gallery" className="underline underline-offset-4">
          Browse the gallery
        </Link>
      </p>
    </section>
  );
}
