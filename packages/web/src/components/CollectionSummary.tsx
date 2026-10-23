import { type CollectionState, formatEth, NO_SOLUTION_YET, PUZZLE_INFO, SLOTS_PER_PUZZLE } from "@proofkin/core";

/**
 * @notice The state of the collection at a glance: the chain, the price, how much is solved, and each puzzle.
 * @dev Presentation only. It takes what was already read, so it renders the same on the server and in a test, and the
 * page decides where the read happens. The record per puzzle is the smallest solution minted so far.
 * @param props - `chainName`: the chain's display name, as the wallet shows it. `state`: the collection as
 * `readCollection` returned it.
 */
export function CollectionSummary({ chainName, state }: { chainName: string; state: CollectionState }) {
  const capacity = SLOTS_PER_PUZZLE * PUZZLE_INFO.length;
  return (
    <section>
      <dl className="grid grid-cols-[8em_1fr] gap-x-6 gap-y-2">
        <dt>Chain</dt>
        <dd>{chainName}</dd>
        <dt>Price</dt>
        <dd>{formatEth(state.mintPrice)}</dd>
        <dt>Solved</dt>
        <dd>{`${state.totalSupply} of ${capacity}`}</dd>
      </dl>
      <table className="mt-6 w-full text-left">
        <thead>
          <tr>
            <th scope="col">Puzzle</th>
            <th scope="col">Solved</th>
            <th scope="col">Smallest</th>
          </tr>
        </thead>
        <tbody>
          {PUZZLE_INFO.map((puzzle) => {
            const best = state.bestNodes[puzzle.id];
            return (
              <tr key={puzzle.id}>
                <th scope="row">{puzzle.name}</th>
                <td>{`${state.solvedCount[puzzle.id]} of ${SLOTS_PER_PUZZLE}`}</td>
                <td>{best === undefined || best === NO_SOLUTION_YET ? "none yet" : `${best} nodes`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
