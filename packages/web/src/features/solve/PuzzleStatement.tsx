import { gridDiagramSvg, PUZZLE_HUES, PUZZLE_INFO, SLOTS_PER_PUZZLE } from "@proofkin/core";
import { type CSSProperties } from "react";

import { groupInputs } from "@/features/solve/inputGroups";

/** What the chain says about a puzzle right now, if it could be read. */
export interface PuzzleFacts {
  price: string;
  slotsLeft: number;
  /** The smallest solution so far; undefined when nobody has solved the puzzle. */
  best: number | undefined;
}

/**
 * @notice What a puzzle asks, for someone about to write a program for it.
 * @dev (1) A server component with no state: it is the same text for every visitor, so it is rendered once and sent
 * as HTML. (2) Each input is shown as the line that reads it, `IN 0`, with the values the contract draws it from,
 * because that is what the player types; a run of alike inputs is one line (`groupInputs`). (3) The diagram's markup is a constant of ours (`gridDiagramSvg`), drawn with
 * `currentColor` so it takes the page's ink, which an `<img>` could not.
 * @param props - `puzzleId`: which puzzle. `facts`: the price, the slots left and the smallest solution; left out when
 * the chain could not be read, since the puzzle is the same without them.
 */
export function PuzzleStatement({ puzzleId, facts }: { puzzleId: number; facts?: PuzzleFacts }) {
  const puzzle = PUZZLE_INFO[puzzleId]!;
  return (
    <section style={{ "--h": PUZZLE_HUES[puzzleId] } as CSSProperties}>
      <h1 className="text-puzzle text-4xl font-semibold tracking-tight">{puzzle.name}</h1>
      <p className="mt-3 max-w-prose text-lg">{puzzle.summary}</p>

      <dl className="mt-6 grid grid-cols-[minmax(7rem,max-content)_1fr] gap-x-8 gap-y-4">
        <dt className="text-graphite">Inputs</dt>
        <dd>
          <ul aria-label="Inputs" className="grid gap-1">
            {groupInputs(puzzle.inputs).map((group) => (
              <li key={group.first} className="tabular-nums">
                <code className="font-address">
                  {group.last === group.first ? `IN ${group.first}` : `IN ${group.first} to ${group.last}`}
                </code>
                {` ${group.last === group.first ? group.firstLabel : `${group.firstLabel} to ${group.lastLabel}`}, ${group.lo} to ${group.hi}`}
              </li>
            ))}
          </ul>
        </dd>

        <dt className="text-graphite">{puzzle.outputs.length === 1 ? "Answer" : "Answers"}</dt>
        <dd>
          {puzzle.outputs.length === 1 ? (
            puzzle.outputs[0]
          ) : (
            <ul aria-label="Answers" className="grid gap-1 sm:grid-cols-2">
              {puzzle.outputs.map((output, slot) => (
                <li key={slot}>
                  <code className="font-address">{slot}</code>
                  {` ${output}`}
                </li>
              ))}
            </ul>
          )}
        </dd>

        <dt className="text-graphite">The rule</dt>
        <dd className="max-w-prose">{puzzle.rule}</dd>

        <dt className="text-graphite">Edge cases</dt>
        <dd>
          <p className="max-w-prose">
            Every program is tried on these fixed cases, whatever the seed, as well as on random ones:
          </p>
          <ol aria-label="Edge cases" className="mt-2 list-decimal space-y-1 pl-5">
            {puzzle.edgeCases.map((edgeCase) => (
              <li key={edgeCase}>{edgeCase}</li>
            ))}
          </ol>
        </dd>

        {puzzleId === 3 && (
          <>
            <dt className="text-graphite">Edge numbers</dt>
            <dd>
              <p className="max-w-prose">
                Inputs 0 to 5 are the horizontal edges row by row, inputs 6 to 11 the vertical edges row by row.
              </p>
              <div className="mt-3 w-fit text-ink" dangerouslySetInnerHTML={{ __html: gridDiagramSvg() }} />
            </dd>
          </>
        )}

        {facts && (
          <>
            <dt className="text-graphite">Price</dt>
            <dd className="tabular-nums">{facts.price}</dd>
            <dt className="text-graphite">Slots</dt>
            <dd className="tabular-nums">{`${facts.slotsLeft} of ${SLOTS_PER_PUZZLE} left`}</dd>
            <dt className="text-graphite">Smallest solution</dt>
            <dd className="tabular-nums">{facts.best === undefined ? "none yet" : `${facts.best} nodes`}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
