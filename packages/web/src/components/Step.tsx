import { type ReactNode } from "react";

export type StepState = "done" | "current" | "todo";

/**
 * @notice One step of a numbered list of things that happen in order: a marker that says whether it is done, the one it
 * is at, or still to come, and its content.
 * @dev A sequence is the one structure that earns a numbered list, so it is an `<li>`; the step the list is at carries
 * `aria-current`. The marker is decoration: the state is in `data-state` and in the words beside it.
 * @param props - `state`: where the list is relative to this step. `title`: its name. `children`: what to say or press.
 */
export function Step({ state, title, children }: { state: StepState; title: string; children?: ReactNode }) {
  return (
    <li
      data-state={state}
      aria-current={state === "current" ? "step" : undefined}
      className="grid grid-cols-[1.25rem_1fr] gap-x-3"
    >
      <span
        aria-hidden
        className={`mt-1.5 size-3 rounded-full ${
          state === "done"
            ? "bg-puzzle-mark"
            : state === "current"
              ? "border-2 border-puzzle-glow bg-paper ring-2 ring-ink"
              : "border-2 border-rule"
        }`}
      />
      <div>
        <h3 className={`font-semibold ${state === "todo" ? "text-graphite" : ""}`}>{title}</h3>
        {children}
      </div>
    </li>
  );
}
