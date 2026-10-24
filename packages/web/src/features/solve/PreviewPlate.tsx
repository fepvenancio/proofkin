"use client";

import { type PreviewView } from "@/features/solve/views";

/**
 * @notice The plate that redraws as the program is written: the contract's own picture of it.
 * @dev (1) It is an `<img>` of a `data:` address, so nothing in the contract's drawing runs. (2) While the next picture
 * is drawn the last one stays, dimmed, so the plate does not blink out with every keystroke. (3) The seed is random and
 * the token's own seed comes from its commit, so the picture is a likeness, not the token; the caption says so.
 * @param props - `view`: what to show, from `previewView`. `seed`: the random seed it is drawn from, once chosen.
 * `onNewSeed`: draw it again from another.
 */
export function PreviewPlate({ view, seed, onNewSeed }: { view: PreviewView; seed?: string; onNewSeed: () => void }) {
  // the caption is about a seed, so it waits for one: the server has not chosen any, and the browser must agree with it
  const captioned = (view.kind === "drawn" || view.kind === "drawing") && seed !== undefined;
  return (
    <div>
      <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-[2px] bg-plate">
        {view.kind === "drawn" ? (
          // eslint-disable-next-line @next/next/no-img-element -- the contract's SVG as a data address, drawn as an image
          <img
            src={view.src}
            alt="Your program, drawn by the contract's renderer"
            width={600}
            height={600}
            data-dimmed={view.dimmed}
            className={`block size-full ${view.dimmed ? "opacity-50" : ""}`}
          />
        ) : view.kind === "error" ? (
          <p role="alert" className="p-6 text-center text-paper/80">
            {view.text}
          </p>
        ) : (
          <p className="p-6 text-center text-paper/70">{view.text}</p>
        )}
      </div>

      {captioned && (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-graphite">
          <span>{"Drawn from a random seed; the token's own seed comes from its commit."}</span>
          <button type="button" onClick={onNewSeed} className="underline underline-offset-4">
            New seed
          </button>
          <code className="font-address" title={seed}>
            {`${seed.slice(0, 10)}…`}
          </code>
        </p>
      )}
    </div>
  );
}
