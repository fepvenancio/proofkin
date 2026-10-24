import { PUZZLE_HUES } from "@proofkin/core";

/**
 * @notice A plate with nothing on it yet: one ring for each of the six puzzles.
 * @dev What the first screen shows before the first solution is minted, in the place the newest token will take. The
 * rings echo the dotted rings behind every real creature.
 */
export function EmptyPlate() {
  return (
    <svg
      role="img"
      aria-label="Nothing has been solved yet. Six empty rings, one for each puzzle."
      viewBox="0 0 600 600"
      className="block aspect-square w-full rounded-[2px] bg-plate"
    >
      <g transform="translate(300 300)" fill="none" strokeLinecap="round" strokeDasharray="1 9" strokeWidth={3}>
        {PUZZLE_HUES.map((hue, index) => (
          <circle key={hue} r={50 + index * 36} stroke={`hsl(${hue} 74% 70% / 0.7)`} />
        ))}
      </g>
    </svg>
  );
}
