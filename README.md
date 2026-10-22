# proofkin

A fully on-chain NFT collection on Base where you cannot buy a token: you solve one. Each mint is a
tiny program that solves an on-chain puzzle. The contract checks it by running it on seeded inputs,
mints the token, and renders an animated SVG from the program's structure and its execution.

Working title. The specification is [PLAN.md](PLAN.md); notes on each milestone are in [docs/](docs/).

**Status:** the VM, the six puzzles, the renderer and the mint contract (`Proofkin.sol`) are done
(milestones 1 to 3). The playground is next.

## Layout

| Path | What |
|---|---|
| `contracts/` | Solidity (Foundry): `VM`, `Puzzles`, `Renderer`, `Proofkin`, and their tests |
| `packages/vm/` | TypeScript reference VM, assembler and fixture generator |
| `fixtures/` | Differential test vectors, the solution circuits, SVG snapshots |
| `tools/` | Mutation testing and fixture helpers |

## Develop

```bash
git clone --recurse-submodules git@github.com:fepvenancio/proofkin.git
cd proofkin
pnpm install

forge test        # Solidity: units, fuzz, differential replay, renderer budgets
pnpm test:ts      # TypeScript reference, and the SVG snapshots re-checked against it
```

Needs Foundry and Node 22 or later.
