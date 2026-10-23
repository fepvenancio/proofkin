# PLAN.md — Proofkin (working title)

A fully on-chain NFT collection on Base. You **cannot buy** a token: you **solve** one. Each mint is a tiny program that solves an on-chain puzzle. The contract verifies the program by executing it on random inputs, mints the token, and renders an animated SVG creature derived from the program's structure and its execution.

> Working title only. Do not use the name "Quinelings", any assets from that repo, or its visual style.

---

## 0. Instructions for Claude Code

- Work milestone by milestone (§10). Do not start the next milestone until the current milestone's acceptance criteria pass.
- Write tests alongside code. Every rule in §3–§6 must have at least one positive test and one negative test.
- Implement exactly this spec. Do not add features, upgradeability, allowlists or a backend. If something is ambiguous or seems wrong, stop and ask rather than guess.
- No unsolicited refactors of code outside the current milestone.
- Keep the TypeScript reference VM (§8) semantically identical to the Solidity VM. Differential tests enforce this.

---

## 1. Stack

| Concern | Choice |
|---|---|
| Contracts | Solidity, latest stable 0.8.x, Foundry |
| Libraries | Solady (`ERC721`, `SSTORE2`, `LibString`, `Base64`, `Ownable`) |
| Chain | Base Sepolia (test), Base mainnet (launch) |
| Off-chain | TypeScript (Node ≥ 22), viem, Vite for the playground |
| Static analysis | Slither, `forge fmt`, `forge coverage` |

Repo layout:

```
contracts/
  src/
    VM.sol            # library: validate + run
    Puzzles.sol       # library: puzzle specs, input generation, reference solvers
    Proofkin.sol      # ERC721, commit/reveal, storage, traits
    Renderer.sol      # tokenURI + render(program, seed, traits) -> SVG/JSON
  test/
  script/Deploy.s.sol
packages/
  vm/                 # TS assembler, VM, puzzles (reference implementation)
  playground/         # static web app
fixtures/             # generated differential test vectors (JSON)
```

---

## 2. Concepts

- **Program**: a straight-line DAG of at most 64 nodes. Each node computes one value from earlier nodes. There are no loops and no jumps, so gas is bounded by construction.
- **Puzzle**: a defined input→output function. The contract holds a reference solver and an input generator.
- **Solve**: the program's outputs equal the reference outputs on every trial of its puzzle: 2 fixed edge cases, 8 random trials, and for GRID_PATH, KNAPSACK3 and SORT8 some further fixed cases (§4.1).
- **Token**: one valid, unique solution. Its traits come from the program (size, depth, op mix) and its solve order.

---

## 3. Program encoding (bytes)

```
offset 0      : version     uint8   == 1
offset 1      : puzzleId    uint8   0..5
offset 2      : nodeCount   uint8   1..64
offset 3      : outCount    uint8   == Puzzles.outputCount(puzzleId)
offset 4      : nodes       nodeCount × 4 bytes  [op, a, b, c]
offset 4+4n   : outputs     outCount × 1 byte    (node index per output slot)
```

The total length must be exactly `4 + 4*nodeCount + outCount`.

### 3.1 Values

- All values are `uint32`, held in a `uint256[]` memory array during execution.
- Arithmetic failure (overflow, underflow, divide by zero) does **not revert**. `run` returns `ok = false`, and a program with `ok = false` on any trial fails the solve.

### 3.2 Opcodes

Notation: `v[i]` is the value of node `i`. Operands `a`, `b`, `c` are node indices unless stated otherwise. **Unused fields must be 0** so that each program has exactly one encoding.

| op | name | fields used | result |
|---|---|---|---|
| 0 | IN | c = input index | `inputs[c]` |
| 1 | CONST | a, b as literal | `(a << 8) \| b` (0..65535) |
| 2 | ADD | a, b | `v[a] + v[b]`; fail if > 2³²−1 |
| 3 | SUB | a, b | `v[a] − v[b]`; fail if `v[a] < v[b]` |
| 4 | MUL | a, b | `v[a] * v[b]`; fail if > 2³²−1 |
| 5 | DIV | a, b | `v[a] / v[b]` (floor); fail if `v[b] == 0` |
| 6 | MIN | a, b | `min(v[a], v[b])` |
| 7 | MAX | a, b | `max(v[a], v[b])` |
| 8 | LT | a, b | `v[a] < v[b] ? 1 : 0` |
| 9 | EQ | a, b | `v[a] == v[b] ? 1 : 0` |
| 10 | AND | a, b | `(v[a] != 0 && v[b] != 0) ? 1 : 0` |
| 11 | OR | a, b | `(v[a] != 0 \|\| v[b] != 0) ? 1 : 0` |
| 12 | SEL | a, b, c | `v[a] != 0 ? v[b] : v[c]` (both branches are already computed) |

Ops 13–255 are invalid.

### 3.3 Validation rules (`VM.validate`, enforced at reveal)

1. The version, puzzleId and length rules from §3 hold.
2. `1 ≤ nodeCount ≤ 64` and `outCount == outputCount(puzzleId)`.
3. Every op is valid, and every unused field is 0.
4. For node `i`, every node-index operand is `< i`, so the graph is acyclic by construction.
5. For IN, `c < inputCount(puzzleId)`.
6. Every output index is `< nodeCount`.
7. **No dead code**: every node must be reachable backwards from at least one output.
8. `keccak256(program)` has not been minted before (global `seen` mapping).

`validate` reverts with a specific custom error per rule.

### 3.4 Execution (`VM.run`)

```
run(bytes program, uint256[] inputs) -> (bool ok, uint256[] outputs, uint256[] values)
```

- Evaluate nodes in index order.
- Return all node values; the renderer uses them.
- `run` may assume the program is valid.

### 3.5 Human assembly syntax (TS assembler only)

```
puzzle SORT8
x0 = IN 0
...
lo = MIN x0 x1
hi = MAX x0 x1
k  = CONST 300
out lo hi ...        # output slots in order
```

- Names map to node indices in declaration order.
- `CONST n` splits `n` into `a = n >> 8`, `b = n & 0xff`.
- The assembler is off-chain only. It must also disassemble bytes back to text.

---

## 4. Puzzles (`Puzzles.sol`)

There are 6 puzzles with 50 slots each, so supply is 300.

| id | name | inputs | input ranges | outputs | reference |
|---|---|---|---|---|---|
| 0 | QUORUM7 | 7 votes + threshold t | votes 0..1, t 1..7 | 1 | `sum(votes) >= t ? 1 : 0` |
| 1 | MEDIAN5 | 5 values | 0..255 | 1 | median |
| 2 | SORT8 | 8 values | 0..255 | 8 | ascending sort |
| 3 | GRID_PATH | 12 edge weights (3×3 grid; moves right/down only) | 0..15 | 1 | min path cost from top-left to bottom-right |
| 4 | KNAPSACK3 | w0,v0,w1,v1,w2,v2,cap | w 1..20, v 0..50, cap 1..40 | 1 | max total value over subsets with total weight ≤ cap |
| 5 | FAIR_SPLIT4 | budget B, requests r0..r3 | B 1..4000, r 1..1000 | 4 | if `sum(r) ≤ B` then `r_i`, else `floor(r_i*B / sum(r))` |

**GRID_PATH edge order**:
- Inputs 0..5 are the horizontal edges, row by row: `(r,0)→(r,1)` then `(r,1)→(r,2)` for r = 0, 1, 2.
- Inputs 6..11 are the vertical edges, row by row: `(0,c)→(1,c)` for c = 0, 1, 2, then `(1,c)→(2,c)` for c = 0, 1, 2.
- Document this in NatSpec and in the playground.

### 4.1 Input generation

- Trials 0 and 1 are fixed edge cases per puzzle:
  - QUORUM7: all zero votes with t = 1, and all one votes with t = 7. Each sits exactly on the threshold, one from each side, so a program that ignores a voter, or compares with `>` or `t - 1`, cannot pass.
  - MEDIAN5 / SORT8: all equal, and strictly descending.
  - GRID_PATH: all zero, and all 15.
  - KNAPSACK3: every weight > cap, and every weight 1 with cap 40.
  - FAIR_SPLIT4: sum == B exactly, and sum > B with all r = 1000.
- Trials 2..9 are random: `inputs[i] = lo + uint256(keccak256(abi.encode(seed, trial, i))) % (hi - lo + 1)`.
- Trials 10 and up are further fixed cases, for the puzzles with many separate branches that a random trial rarely forces. They ignore `seed`, and a puzzle without any treats trial 10 and up as random again. `trialCount(puzzleId)` is the number of trials a solution must pass: 10 for QUORUM7, MEDIAN5 and FAIR_SPLIT4, 12 for SORT8, 16 for GRID_PATH and KNAPSACK3.
  - GRID_PATH, trials 10..15: one case per monotone path, in the order RRDD, RDRD, RDDR, DRRD, DRDR, DDRR (R right, D down). The four edges of that path weigh 1, 2, 3, 4 in the order travelled and every other edge 15, so that path is the single cheapest.
  - KNAPSACK3, trials 10..12: each single item is the unique best set, with weight equal to the cap (all weights 10, cap 10, the item's value 50 against 20 and 30). Trials 13..15: each pair is the unique best set, with weight equal to the cap (all weights 10, cap 20, the pair's two items worth 30 each and the third item 10, in the order {0,1}, {0,2}, {1,2}).
  - SORT8, trials 10 and 11: the permutations `[0,64,96,160,32,192,128,224]` and `[0,96,32,160,64,128,192,224]`. Together with trials 0 and 1 they expose the removal of any one comparator from the usual 19-comparator network.
  - Why: with only two fixed cases a program that ignores a QUORUM7 voter, misses a GRID_PATH path or forgets a KNAPSACK3 subset passed all trials about half of the time, and a committer could try several salts. Each of these cases makes one such omission fail on every seed.
- Expose this as `inputs(puzzleId, seed, trial) -> uint256[]` and `trialCount(puzzleId)`. The TS port must match byte-for-byte.

### 4.2 Solvability (must be proven in tests)

Add a hand-written solution fixture for every puzzle under 64 nodes, and assert it solves on 1,000 random seeds. Known feasible solutions:
- SORT8: the 19-comparator sorting network, at 8 IN + 38 MIN/MAX nodes.
- MEDIAN5: a comparator network.
- KNAPSACK3: enumerate the 7 subsets with ADD, LT and SEL, then a MAX chain (about 36 nodes).
- GRID_PATH: dynamic programming with ADD and MIN.
- QUORUM7: an ADD chain, then LT, then EQ against CONST 0.
- FAIR_SPLIT4: the sum, an LT overflow flag, MUL/DIV per item, and SEL. Requests are ≥ 1, so DIV never divides by zero.

---

## 5. Minting (`Proofkin.sol`)

### 5.1 Commit–reveal

The commit step prevents mempool copying.

```solidity
function commit(bytes32 h) external;
// h = keccak256(abi.encode(program, msg.sender, salt))
// stores commitBlock[h] = block.number; reverts if h already committed

function reveal(bytes calldata program, bytes32 salt) external payable;
```

`reveal` must:

1. Recompute `h` and require that a commit exists.
2. Require `block.number > commitBlock + REVEAL_DELAY` (`REVEAL_DELAY = 2`) and `block.number <= commitBlock + 250`, because `blockhash` is only available for 256 blocks.
3. Compute `seed = keccak256(abi.encode(blockhash(commitBlock + REVEAL_DELAY), h))`. Require the blockhash to be non-zero.
   - The seed is fixed once the commit lands, so revealing later cannot be used to grind for favourable inputs.
   - The sequencer could still influence the seed. That is acceptable for an art project, and the NatSpec must say so.
4. Require `msg.value == mintPrice` (an immutable set at deploy; it may be 0).
5. Validate the program (§3.3), and require `solvedCount[puzzleId] < 50`.
6. Run all `trialCount(puzzleId)` trials and require `ok` and outputs == reference on every one.
7. Store the program with `SSTORE2.write`, and record the token data (§5.2).
8. Delete the commit, update the counters and best scores, mark `seen`, and `_mint` (not `_safeMint`) to `msg.sender`.
9. Emit `Solved(tokenId, puzzleId, author, nodeCount, rank)`.

On any failure, revert with a custom error. A failed reveal can be retried after fixing the program, but only with a new commit, because the hash includes the program.

### 5.2 Token data (packed)

```solidity
struct Token {
    bytes32 seed;       // render + replay seed (slot 0)
    address program;    // SSTORE2 pointer; with the fields below it fills slot 1
    uint8   puzzleId;
    uint8   nodeCount;
    uint8   depth;      // longest path from any IN/CONST (which have depth 0) to an output
    uint16  rank;       // 1-based solve order within the puzzle
    bool    recordAtMint; // nodeCount < previous best for that puzzle
}
```

Also store `bestNodes[puzzleId]`, which starts at 255, and `solvedCount[puzzleId]`.

### 5.3 Traits (computed in `tokenURI`)

- Puzzle
- Nodes
- Depth
- Solve rank
- First Solver (`rank == 1`)
- Record Setter (`recordAtMint`)
- Optimal: live, `nodeCount == bestNodes[puzzleId]`, so it can change after mint
- Dominant op family: arithmetic, compare, logic or select, by count

### 5.4 Admin (`Ownable`)

- `setRenderer(address)` works only while `!rendererLocked`.
- `lockRenderer()` is one-way.
- `withdraw()` sends the contract balance to the owner.
- There is nothing else: no pause, no upgrade, no owner minting.

---

## 6. Renderer (`Renderer.sol`)

```solidity
function tokenURI(uint256 id) external view returns (string memory);   // called by Proofkin
function render(bytes calldata program, bytes32 seed) external pure returns (string memory svg); // used by the playground for previews
```

- `tokenURI` returns `data:application/json;base64,…` with `name`, `description`, `attributes` (§5.3), and `image` as `data:image/svg+xml;base64,…`.
- The SVG is animated with SMIL/CSS only. No JavaScript, so it works on marketplaces.
- The output must be deterministic and fully on-chain, and stay **under 40 KB** per SVG.
- **Gas budget**: `tokenURI` must use under 25M gas in `eth_call`. Add a test that asserts this for the worst-case 64-node program.

### 6.1 Deterministic layout algorithm

1. **Canvas**: 600×600, with a background radial gradient from the puzzle palette.
2. **Values**: run the program on `inputs(puzzleId, seed, trial = 2)` and use the node values.
3. **Depth layout**: node depth is IN/CONST = 0, otherwise 1 + max operand depth.
   - Layer `d` is a ring of radius `r = 40 + d * (240 / (maxDepth + 1))` around the centre.
   - Nodes in a layer are evenly spaced, with the angle offset by `uint8(seed[d]) * 360 / 256`.
4. **Edges**: draw a quadratic Bézier from operand to node, with its control point pulled 30% toward the centre. Use `stroke-dasharray` plus an animated `stroke-dashoffset` so the edges appear to flow.
5. **Glyph by op family**:

   | Family | Ops | Glyph |
   |---|---|---|
   | Input | IN | small dot |
   | Constant | CONST | square |
   | Arithmetic | ADD, SUB, MUL, DIV | circle |
   | Compare | MIN, MAX, LT, EQ | diamond |
   | Logic | AND, OR | ring |
   | Select | SEL | triangle |

6. **Size**: `4 + log2(value + 1)` px, using an integer log.
7. **Palette**: 6 fixed palettes, one per puzzle. The hue shifts by `uint8(seed[31]) % 30` degrees.
8. **Motion**: each ring rotates slowly with `animateTransform`, alternating direction by layer, with a period of `20 + d*7` seconds. Output nodes pulse with an `r` animation.
9. **Markers**: output nodes get a highlight halo. "Optimal" tokens get a subtle gold outer ring.

Art direction may be refined in milestone 2, but it must stay deterministic and within the budgets above.

---

## 7. Security and invariants (Foundry invariant tests)

- Total supply ≤ 300, and `solvedCount[p] ≤ 50` for every puzzle.
- No two tokens share `keccak256(program)`.
- Every minted program passes `validate` and solves all `trialCount` trials when re-run on its stored seed.
- `run` never reverts on any valid program and arbitrary inputs; arithmetic failures return `ok = false`. Fuzz this.
- A commit is bound to its sender: another address cannot reveal it.
- A reveal outside the window reverts, and so does a reveal with a zero blockhash.
- `tokenURI` gas stays within budget for the worst case.
- Mint uses CEI ordering and `_mint`; there are no external calls except `withdraw`.
- Run Slither with no high or medium findings left unaddressed.

---

## 8. TypeScript reference (`packages/vm`)

- `assemble(text) -> Uint8Array` and `disassemble(bytes) -> text`.
- `validate(bytes)` returns the same rule identifiers as the Solidity custom errors.
- `run(bytes, inputs) -> { ok, outputs, values }`.
- `inputs(puzzleId, seed, trial)` and `reference(puzzleId, inputs)`.
- **Differential fixtures**: a script writes `fixtures/diff.json` containing about 2,000 random valid programs and about 500 invalid programs, each with inputs and expected results. Foundry reads it with `vm.readFile` and asserts identical results.

---

## 9. Playground (`packages/playground`)

This is a static site (Vite + TS + viem) with no backend.

- An editor for the assembly syntax, with puzzle selection and a puzzle description that includes the GRID_PATH edge-order diagram.
- **Test locally**: run against every fixed case of the puzzle (§4.1) and 100 random inputs using the TS VM, and show the first failing case.
- **Preview**: call `Renderer.render(program, randomSeed)` via `eth_call`.
- **Mint flow**:
  1. Connect wallet.
  2. Generate a salt and save it, with the program, to localStorage. Warn the user to keep the salt.
  3. `commit`, then wait for `REVEAL_DELAY + 1` blocks.
  4. `reveal`.
  5. Show a countdown to the 250-block deadline.
- A gallery page that reads `tokenURI` for minted tokens, plus a per-puzzle leaderboard (best node count).

---

## 10. Milestones and acceptance criteria

| # | Scope | Done when |
|---|---|---|
| 1 | `VM.sol`, `Puzzles.sol`, TS VM/assembler, solution fixtures, differential fixtures | All §3–§4 tests pass; the differential suite matches 100%; every puzzle has a fixture solution that solves 1,000 random seeds |
| 2 | `Renderer.sol` | Renders all fixtures; SVG < 40 KB; `tokenURI` worst case < 25M gas; snapshot tests of the SVG output |
| 3 | `Proofkin.sol` with commit/reveal, storage, traits, admin | All §5 and §7 tests and invariants pass; Slither is clean; coverage > 95% on `src/` |
| 4 | Playground | A full commit→reveal→view flow works on a local anvil chain and on Base Sepolia |
| 5 | Launch | Deployed and verified on Base Sepolia; a dry-run mint for each puzzle; then mainnet deploy, verification and `lockRenderer()` after a final art review |

---

## 11. Open decisions (owner)

- Final name and description text.
- `mintPrice`: free or a small fee.
- Whether to add ERC-2981 royalty info (not enforceable; optional).
- Whether puzzle descriptions and hints are stored on-chain or only in the playground.

## 12. Pre-launch checklist (owner, not Claude Code)

- Confirm the employer's outside-activity and IP policy allows this project.
- Do a final review of the art across all 6 palettes, at minimum and maximum node counts.
- Set the deploy key via a hardware wallet; transfer ownership after deploy if needed.

## 13. Out of scope

Upgradeable proxies, allowlists, owner or reserved mints, off-chain metadata or IPFS, a backend or indexer, token-gated features, and cross-chain deployment.
