# Milestone 1 notes

## Commands

```bash
forge test            # Solidity: units, fuzz, differential replay, on-chain solution checks
pnpm test:ts          # TypeScript reference (packages/vm)
pnpm gen:fixtures     # rewrite fixtures/diff.json and fixtures/solutions.json

python3 tools/mutate.py vm|renderer   # plant one bug at a time; each must make a test fail
node tools/gen_solutions.mjs          # how fixtures/solutions/*.pk were written (they stay the source of truth)
tools/known_answers.sh <seed> <trial> <lo,hi>...   # independent `cast` vectors for Puzzles.inputs
```

Run `pnpm gen:fixtures` after touching `packages/vm/src/{puzzles,vm,asm,fixtures,rng}.ts` or
`fixtures/solutions/*.pk`. The TS tests fail if the committed JSON is stale. Generation is
deterministic (fixed PRNG seed).

## Where PLAN.md was silent, and what was chosen

**Trials 0 and 1** (§4.1 named the shape, not the numbers). Inputs are in the puzzle's own order.

| Puzzle | Trial 0 | Trial 1 |
|---|---|---|
| QUORUM7 | votes all 0, t = 7 → 0 | votes all 1, t = 1 → 1 |
| MEDIAN5 | all 128 → 128 | 200,150,100,50,0 → 100 |
| SORT8 | all 128 | 224,192,…,32,0 → ascending |
| GRID_PATH | all 0 → 0 | all 15 → 60 |
| KNAPSACK3 | (w,v) = (6,50) (10,40) (20,30), cap 5 → 0 | (1,10) (1,20) (1,30), cap 40 → 60 |
| FAIR_SPLIT4 | B = 1000, r = 100,200,300,400 → r | B = 3999, r = 1000×4 → 999×4 |

**Hash input types** for random trials: `abi.encode(bytes32 seed, uint256 trial, uint256 i)`.
`inputs()` accepts any `trial ≥ 2` (the playground needs 100 random cases); the 10-trial rule belongs
to the minting code.

**Validation errors** (one per rule, same names in `VM.sol` and `vm.ts`). Node-level errors carry the
node as a `uint256`; `BadOutputIndex` carries the output slot; header errors carry nothing.

| Rule | Error |
|---|---|
| 1 | `BadLength`, `BadVersion`, `BadPuzzle` |
| 2 | `BadNodeCount`, `BadOutCount` |
| 3 | `BadOpcode(node)`, `UnusedFieldNotZero(node)` |
| 4 | `OperandNotEarlier(node)` |
| 5 | `BadInputIndex(node)` |
| 6 | `BadOutputIndex(slot)` |
| 7 | `DeadNode(node)` |

When several rules are broken the first failure in this order wins: length < 4, version, puzzleId,
nodeCount, outCount, total length; then nodes in index order (opcode, unused fields, operands, IN
index); then output slots in order; then the lowest dead node. The differential suite pins this.

**Rule 8** (uniqueness) needs storage, so it is checked in `Proofkin.sol`, not in `VM.validate`.

**`run` on failure** halts at the first failing node: `ok = false`, `outputs` empty, `values` has
`nodeCount` entries with the failing node and all later ones left at 0. **Preconditions** (not
checked, as §3.4 allows): the program is valid, `inputs` has `inputCount(puzzle)` entries, each
≤ `2³²−1`. Dead code does not affect `run`, which is why the fuzz test only needs rules 1–6.

**`Puzzles.referenceOutputs`**: `reference` is a reserved word in Solidity, so the Solidity function
has this name. The TS function stays `reference(puzzleId, inputs)` as §8 names it.

**Toolchain**: solc 0.8.38 (latest stable at the time of writing), `evm_version = "cancun"`,
`gas_limit` raised in `foundry.toml` because the 1,000-seed solution checks and instrumented
coverage runs exceed Foundry's default 2³⁰ per-test cap.

**Fixture format** (`fixtures/diff.json`): programs are JSON byte arrays, not hex strings, because
Foundry guesses types from hex strings and misreads some byte lengths. Object keys are alphabetical,
which is how Foundry maps JSON onto Solidity structs; the error identifier is `rule` (a field named
`error` is a future Solidity keyword). Solidity replays it in slices, one test per slice, because a
single transaction's memory only grows. `DifferentialTest.test_chunksCoverTheWholeFixture` fails if
a regenerated fixture has rows no slice covers.

## For the owner to weigh before M3 (not acted on, no code depends on them)

1. **"Unique solution" is structural, not semantic.** `keccak256(program)` differs when two
   operands of a commutative op are swapped, or nodes are reordered, so once one solution to a
   puzzle is public anyone can mint variants of it into the remaining slots. Canonical-form rules
   (e.g. `a ≤ b` for commutative ops) would narrow this but cannot close it.
2. **"Solved" is probabilistic.** A program passes if it matches on 2 known + 8 seeded trials. The
   seed depends on the commit hash, so a near-correct program can be committed under several salts
   and only the lucky one revealed. With a node-count leaderboard and an "Optimal" trait, this
   rewards programs that are small and subtly wrong. Raising the trial count raises gas linearly.
