"use client";

import { Fragment } from "react";

import { type TestView } from "@/features/solve/views";

/**
 * @notice Runs the program on the puzzle's cases here in the browser, and shows how it went.
 * @dev A pass is only a rehearsal (the contract draws its own random cases at reveal), and the panel says so. A failure
 * shows the first case the program got wrong, as the case's inputs, the answer wanted and the answer given, so the
 * player can see what the puzzle actually asks.
 * @param props - `view`: what to show, from `testView`. `onRun`: run the test.
 */
export function TestPanel({ view, onRun }: { view: TestView; onRun: () => void }) {
  return (
    <section aria-labelledby="test-heading" className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="test-heading" className="text-2xl font-semibold tracking-tight">
          Test locally
        </h2>
        <button
          type="button"
          onClick={onRun}
          disabled={view.kind === "blocked"}
          className="rounded-[2px] bg-ink px-4 py-1.5 text-paper disabled:opacity-40"
        >
          Run test
        </button>
      </div>

      <div className="mt-3">
        {(view.kind === "blocked" || view.kind === "notRun") && <p className="text-graphite">{view.text}</p>}
        {view.kind === "pass" && (
          <div role="status">
            <p className="font-semibold">{view.headline}</p>
            <p className="mt-1 max-w-prose text-graphite">{view.note}</p>
          </div>
        )}
        {view.kind === "fail" && (
          <div role="alert">
            <p className="font-semibold">{view.headline}</p>
            <dl className="mt-3 grid grid-cols-[minmax(6rem,max-content)_1fr] gap-x-6 gap-y-2 tabular-nums">
              {view.rows.map((row) => (
                <Fragment key={row.label}>
                  <dt className="text-graphite">{row.label}</dt>
                  <dd className="font-address break-words text-sm">{row.value}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
