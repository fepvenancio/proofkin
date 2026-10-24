"use client";

/**
 * @notice What a visitor sees when a page throws while it renders.
 * @dev (1) A node that does not answer is not this: pages show a sentence for that themselves. This is for what nobody
 * expected. (2) The error is not shown, because it can name an endpoint or a key; it is in the server log. (3) Trying
 * again asks Next.js to render the page again, which re-reads the chain.
 * @param props - `error`: what was thrown (unused on purpose). `reset`: renders the page again.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Something went wrong showing this page.</h1>
      <p className="mt-4 max-w-prose text-lg text-graphite">
        The details are in the server log. Trying again reads the chain afresh.
      </p>
      <button type="button" onClick={reset} className="mt-6 rounded-[2px] bg-ink px-5 py-2.5 text-paper">
        Try again
      </button>
    </section>
  );
}
