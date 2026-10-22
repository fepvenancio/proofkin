# proofkin

A fully on-chain NFT collection on Base where you cannot buy a token: you solve one. Each mint is a
tiny program that solves an on-chain puzzle. The contract checks it by running it on seeded inputs,
mints the token, and renders an animated SVG from the program's structure and its execution.

Working title. The specification is [PLAN.md](PLAN.md); notes on each milestone are in [docs/](docs/).

**Status:** the VM, the six puzzles, the renderer and the mint contract are done (milestones 1 to 3). The
playground (milestone 4) works end to end against a local chain; running it on Base Sepolia waits for the
deployment in milestone 5.

## Layout

| Path | What |
|---|---|
| `contracts/` | Solidity (Foundry): `VM`, `Puzzles`, `Renderer`, `Proofkin`, and their tests |
| `packages/vm/` | TypeScript reference VM, assembler and fixture generator |
| `packages/playground/` | The web app: write a program, test it, watch it drawn, mint it, browse the gallery |
| `fixtures/` | Differential test vectors, the solution circuits, SVG snapshots |
| `tools/` | Mutation testing and fixture helpers |

## Develop

```bash
git clone --recurse-submodules git@github.com:fepvenancio/proofkin.git
cd proofkin
pnpm install

forge test        # Solidity: units, fuzz, differential replay, renderer budgets
pnpm test:ts      # TypeScript: the reference VM, and the playground against real contracts on Anvil
```

Try the playground on a local chain (needs a browser wallet pointed at `http://127.0.0.1:8545`, chain id 31337):

```bash
forge build             # the local deploy reads the compiled contracts from out/
pnpm dev:chain          # Anvil with a block a second, both contracts deployed, .env.local written
pnpm dev:playground     # then open http://localhost:5173
```

More in [docs/M4-notes.md](docs/M4-notes.md).

Needs Foundry and Node 22 or later.
