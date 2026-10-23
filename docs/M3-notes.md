# Milestone 3 notes

## What is here

- `contracts/src/Proofkin.sol`: the collection. Solady `ERC721` and `Ownable`, `commit` and `reveal`,
  token storage (programs as SSTORE2 contract code), `setRenderer` / `lockRenderer` / `withdraw`.
- Tests: `Proofkin.t.sol` (commit, reveal, storage), `ProofkinAdmin.t.sol` (admin, ERC721, `tokenURI`
  through the real renderer), `Proofkin.invariants.t.sol` (§7), with helpers in `contracts/test/helpers/`.

```bash
forge test                          # everything
python3 tools/mutate.py proofkin    # plant bugs in Proofkin.sol one at a time; each must fail a test
```

## Decisions where PLAN.md was silent or loose

1. **Mint price: 0.01 ETH** (§11 left "free or a small fee" open). `mintPrice` stays an immutable set by
   the constructor, as §5.1 says, and may still be zero. Every test deploys at 0.01 ETH unless it says
   otherwise, and one test covers the free case. The Deploy script (M5) will pass `0.01 ether`.
   `reveal` is the only `payable` function: a reveal that reverts returns the payment, `commit` and
   `withdraw` take none, and there is no `receive` or `fallback` (tested).
2. **Token ids are sequential from 1** in mint order. The puzzle and rank are in the token and in the
   `Solved` event, so the id carries no other meaning.
3. **Constructor**: `Proofkin(owner, renderer, mintPrice)`. The renderer must be non-zero, in the
   constructor and in `setRenderer`, so a renderer that is locked can never be the zero address. The
   renderer reads tokens back from its caller, so there is no circular dependency: deploy it first.
4. **`withdraw` is owner-only** and sends the whole balance to the owner. If ownership is renounced the
   fees are stuck; Solady's `transferOwnership`, two-step handover and `renounceOwnership` are inherited
   and are the only other admin surface.
5. **Events**: only `Solved(tokenId, puzzleId, author, nodeCount, rank)`, with the first three
   indexed. Admin actions emit nothing; `renderer()` and `rendererLocked()` are readable.
6. **Order of checks in `reveal`**: commit exists, not too early, not expired, blockhash non-zero,
   payment, then the program's structure (`VM.validate`), not already minted, puzzle not full, then the
   10 trials. The first failure wins.
7. **Token struct** keeps §5.2's field order, which takes three storage slots. Putting `seed` first would
   pack it into two and save about 22k gas per mint; it was not done because it changes the getter the
   renderer reads.
8. **Depth** is the deepest output, from `VM.depths`.

## Where §5.1's wording needed correcting

§5.1 step 3 says the seed "is fixed once the commit lands". It is fixed once block `commitBlock + 2`
exists: the committer does not know it when committing, and everyone does know it from then on. What
the plan means holds: the seed does not depend on when, or by whom, the reveal is made, so revealing
later cannot shop for inputs (`test_revealingLaterGivesTheSameSeed`). The NatSpec says it this way.

## For the owner (carried over from M1, now concrete)

- **Uniqueness is of the bytes.** `test_aBehaviourallyIdenticalVariantIsAnotherProgram` mints a SORT8
  solution and then a copy with one `MIN`'s operands exchanged. `test_theCollectionTopsOutAtThreeHundred`
  fills all 300 slots with such variants. Once any solution to a puzzle is public, anyone can mint the
  rest of its 50 slots the same way, in a few transactions.
- **"Solved" is 10 trials, not a proof**, and the seed is public from block `commitBlock + 2`. A
  committer can commit one program under several salts and reveal only the lucky one. The contract
  cannot tell a subtly wrong program that got lucky from a right one.

Neither is changed here: the plan says no extra features. Both bear on whether the leaderboard and the
"Optimal" trait mean what they appear to.

*Since then:* milestone 3.5 narrowed the second point (harder fixed cases for QUORUM7, GRID_PATH,
KNAPSACK3 and SORT8; see [M3.5-notes.md](M3.5-notes.md)). The first is unchanged, and so is the commit-grinding
cost.

## How §7 is covered

| §7 | Where |
|---|---|
| Supply ≤ 300, `solvedCount[p]` ≤ 50 | `invariant_supplyAndSlotsAreCapped`; `test_theCollectionTopsOutAtThreeHundred` reaches the cap for real |
| No two tokens share a program hash | `afterInvariant` |
| Every minted program validates and solves all 10 trials on its stored seed | `afterInvariant`; `test_theStoredSeedReplaysTheSolve` |
| `run` never reverts on a valid program, arbitrary inputs | `testFuzz_runNeverRevertsOnStructurallyValidPrograms` (M1) |
| A commit is bound to its sender | `test_aCommitIsBoundToProgramSenderAndSalt` |
| Reveal outside the window reverts; zero blockhash reverts | `test_revealIsTooEarly…`, `test_revealAfterTheWindowExpires…`, `test_revealWorksOnTheLastBlock…`, `test_revealWithAZeroBlockhashReverts` |
| `tokenURI` gas within budget | `RendererLimitsTest` (worst case, 6.4M gas), `test_tokenURIGasForTheLargestFixtureIsWithinBudget` |
| CEI, `_mint` not `_safeMint`, no external call but `withdraw` | `test_mintUsesMintNotSafeMint`, `test_aReentrantOwnerIsPaidExactlyOnce`, `test_theContractTakesNoStrayEther`; reveal's only call out is the SSTORE2 deployment, after all state is written |
| Slither | see "Results" |

The invariant handler submits real solutions only (operand-swapped and padded variants of the six
fixtures), from three accounts, waiting too little, the right time or too long, so the only reverts it
may see are `TooEarly`, `Expired`, `AlreadyMinted` and `PuzzleFull`; `invariant_everyRevertWasAnExpectedOne`
fails on anything else.

## Results

| Gate (§10, milestone 3) | Result |
|---|---|
| §5 and §7 tests and invariants | 185 Solidity tests pass. For `Proofkin`: 35 on commit, reveal and storage, 19 on admin, ERC721 and `tokenURI` through the real renderer, 4 invariants checked after every call plus a full replay of every token at the end of each run (32 runs of 120 calls), and a test that mints all 300 tokens |
| Coverage of `src/` | 100% of lines, 99.75% of statements, 98.7% of branches (gate: 95%). What is not reached: the renderer's buffer-overflow guard and `Proofkin._same`'s length check, neither of which a valid program can trigger |
| Mutation testing | 34 bugs planted one at a time in `Proofkin.sol`, each judged by the unit, admin and invariant tests separately: all caught. The first run missed two (outputs that are too small pass the check; only output slot 0 compared); both were gaps in the tests, now covered, and re-running those two shows them caught |
| Slither | 0 High, 0 Medium, 0 Low, after triage (below) |

Costs: `commit` about 44k gas. `reveal` costs 0.51M (MEDIAN5) to 1.07M (SORT8) gas for the fixtures, measured by
`test_revealGasPerFixture`. A `tokenURI` call is at most 6.4M gas (the worst-case program, M2).

### Slither triage

An earlier summary described Slither's output as informational only. By Slither's own classification four
of its detectors are Medium, so all of them were triaged, for every contract:

| Detector (impact) | Count | Resolution |
|---|---|---|
| `uninitialized-local` (Medium) | 10 | Accumulators now start with an explicit `= 0`. The two memory arrays (`Puzzles._gridPath.d`, `Renderer._dominantFamily.counts`) are zeroed by the language and carry a justified `slither-disable` |
| `divide-before-multiply` (Medium) | 4 | Intended: the ring spacing `240 / layers` and the square's half-side `3s / 4` are floors by specification. Suppressed with the reason beside each |
| `incorrect-equality` (Medium) | 2 | `committedAt == 0` ("no commit") and `blockHash == 0` ("no hash") compare a sentinel, not a balance. Suppressed with the reason |
| `unused-return` (Medium) | 2 | `VM.run`'s unused results are deliberate. Suppressed with the reason |
| `missing-inheritance` (Informational) | 1 | Fixed: `IRenderer` has its own file and `Renderer is IRenderer` |
| `assembly`, `cyclomatic-complexity`, `too-many-digits` (Informational) | 7 | Kept. The two assembly blocks (a `mcopy` into a pre-sized buffer, a length write) are reviewed and memory-safe; the complexity is in `validate`, `_eval` and `_fixed`, which are flat if-chains; the digits are the sine table |

`slither .` reads `slither.config.json`, which excludes `lib/` and the tests.
