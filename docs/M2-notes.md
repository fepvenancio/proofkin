# Milestone 2 notes

## What is here

- `contracts/src/Renderer.sol`: `render(program, seed)` for previews and `tokenURI(id)` for the collection.
- `contracts/src/IProofkin.sol`: the two views of the collection the renderer reads back (see "For M3").
- `VM.depths(program)`: per-node depth, shared by the renderer's layout and (later) the token's `depth`.
- `fixtures/renders/*.svg`: byte-exact snapshots of the six fixture circuits at one fixed seed.

```bash
forge test                                                       # everything, including snapshots and budgets
UPDATE_SNAPSHOTS=true forge test --match-contract RendererSnapshotTest   # after an intended art change
pnpm test:ts                                                     # re-checks the snapshots against the TS VM
```

After changing the art: regenerate the snapshots, run `pnpm test:ts` (it recomputes every position,
size, edge and ring from the TS VM and fails if the SVG disagrees), then look at the SVGs.

## Budgets (PLAN.md §6) and what was measured

| | Measured | Limit |
|---|---|---|
| SVG, worst case (61 SELs, 183 edges, 62 rings, 8 halos) | 20,595 B | 40,000 B |
| SVG, largest of the 2,000 fixture programs | 15,826 B | 40,000 B |
| `tokenURI`, same worst case, as an optimal token | 6.40M gas, 37,689 chars | 25M gas |
| `render`, worst case | 3.39M gas | |
| Renderer runtime size | 16,694 B | 24,576 B |

The SVG is bounded by structure, not just by tests: at most 183 edges (37 B), 64 rings (150 B),
64 glyphs (56 B), 8 halos (160 B) and ~1.2 KB of header and style come to about 22 KB even with every
coordinate at three digits. The 48,000-byte output buffer therefore cannot fill; its overflow guard
is the one branch the tests do not reach.

## Where §6 was inconsistent or silent, and what was chosen

1. **Rings rotate; the graph does not.** §6.1(8) turns every ring at its own speed and §6.1(4) draws
   each edge once between two nodes. Both cannot hold: two rings turning at different rates tear
   every edge between them off its endpoints. The orbit *tracks* (dotted circles) rotate as specified
   (`animateTransform`, alternating direction, period 20 + 7d s) and the nodes and edges stay put, so
   edges stay attached while the rings still visibly turn. Alternatives, if the art direction
   changes: rotate the whole graph rigidly (simple, loses per-layer motion), or animate every edge's
   `d` through keyframes (attached edges and per-ring motion, but ~3x the bytes and still not exact
   for rings with unrelated periods).
2. **`seed[d]` for d ≥ 32.** A `bytes32` has no byte 40, and programs reach 64 layers; layer d uses
   `seed[d % 32]`.
3. **Glyph size is capped at 16 px.** `4 + log2(value + 1)` reaches 36 for large products, which
   would bury the ring spacing (as little as 3 px). Values up to 4,095 are unaffected.
4. **Glyph geometry**: the IN dot has radius `(s+1)/2`, a CONST square has half-side `3s/4`, circle and
   ring have radius `s`, diamond and triangle have half-height `s`.
5. **A repeated operand is drawn once** (`ADD x x`, `SEL a b b`).
6. **`render` validates**, so a preview of an invalid program reverts with the `VM` error naming the
   rule. A valid program that fails on trial 2 (overflow etc.) still renders, with zero values.
7. **Palettes**: (base hue, hue step, saturation, lightness) per puzzle, family colours at
   `base + k * step`, everything shifted by `seed[31] % 30`. The numbers are a first pass for the
   final art review (§12).
8. **Traits** are emitted in §5.3's order. The three flags are "Yes"/"No". "Dominant op family" counts
   arithmetic, compare, logic and select; a tie goes to the earlier of those in that order, and
   "None" means the program has only IN and CONST nodes.
9. **Name and description** are working text (`"Proofkin #<id>"` and one sentence): PLAN.md §11 leaves
   them to the owner. Both are constants in `Renderer.sol`.

## For M3

`Renderer.tokenURI(id)` reads the token back from `msg.sender`, so `Proofkin.tokenURI(id)` should just
forward to `renderer.tokenURI(id)`. It needs these two getters, which are what the natural
declarations generate, and the mock in `contracts/test/helpers/MockProofkin.sol` is written that way:

```solidity
mapping(uint256 => Token) public tokens;   // Token is the §5.2 struct, fields in that order
uint8[6] public bestNodes;                 // 255 until the first solve of each puzzle
```

`Token.depth` should be the deepest node of `VM.depths(program)`. The renderer trusts the stored
`nodeCount`, `depth`, `rank` and `recordAtMint`, and compares `nodeCount` with `bestNodes` live for
"Optimal".

## Other things worth knowing

- The SVG's classes and ids (`.e`, `#nodes`, ...) are global if it is pasted inline into an HTML page;
  show it through `<img>` (as marketplaces do) so styles cannot leak between tokens.
- A program with one node per layer takes its spread entirely from the seed's bytes; a seed with
  mostly zero bytes stacks such nodes on one ray. Real seeds are `keccak256` hashes.
- Why the output is built in a buffer: appending with `string.concat` allocates a fresh copy each
  time, total memory grows quadratically and memory-expansion gas with it (this design would cost
  hundreds of millions of gas).
