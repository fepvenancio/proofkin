"use client";

import { useRef } from "react";

import { type StatusLine } from "@/features/solve/views";

/**
 * @notice Where the program is written, and what is said about it as it is.
 * @dev (1) A plain text field: a program is at most 64 lines, so an editor library would cost more than it gives, and a
 * text field keeps the keyboard, the platform's spelling of selection and a screen reader's reading of it. It is set in
 * the monospaced setting of the one font. (2) The status line is announced as it changes, and when the assembler knows
 * the line a problem is on, a button takes the cursor there. (3) Until the saved draft has been read the field is
 * read-only, so nobody types into text that is about to be replaced.
 * @param props - `text`: the program. `status`: what the page says about it. `onChange`: every edit. `onStartOver`:
 * the visitor confirmed replacing the program with the puzzle's starting point. `loading`: the draft is being read.
 */
export function ProgramEditor({
  text,
  status,
  onChange,
  onStartOver,
  loading = false,
}: {
  text: string;
  status: StatusLine;
  onChange: (text: string) => void;
  onStartOver: () => void;
  loading?: boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);

  function goToLine(line: number): void {
    const lines = text.split("\n");
    const start = lines.slice(0, line - 1).reduce((offset, each) => offset + each.length + 1, 0);
    field.current?.focus();
    field.current?.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  }

  function startOver(): void {
    if (window.confirm("Replace your program with the starting point for this puzzle?")) onStartOver();
  }

  return (
    <section aria-labelledby="program-heading" className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="program-heading" className="text-2xl font-semibold tracking-tight">
          Your program
        </h2>
        <button type="button" onClick={startOver} className="text-graphite underline underline-offset-4">
          Start over
        </button>
      </div>
      <textarea
        ref={field}
        aria-labelledby="program-heading"
        aria-busy={loading ? "true" : undefined}
        readOnly={loading}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        value={text}
        onChange={(event) => onChange(event.target.value)}
        className="font-address mt-3 block min-h-[22rem] w-full rounded-[2px] border border-rule bg-transparent p-4 text-sm leading-6"
      />
      <p role="status" data-tone={status.tone} className="mt-3 tabular-nums">
        {status.line !== undefined && (
          <>
            <button type="button" onClick={() => goToLine(status.line!)} className="underline underline-offset-4">
              {`line ${status.line}`}
            </button>
            {": "}
          </>
        )}
        <span className={status.tone === "bad" ? "font-semibold" : undefined}>{status.text}</span>
      </p>
    </section>
  );
}
