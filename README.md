# proofkin

A fully on-chain NFT collection on Base where you cannot buy a token: you solve one. Each mint is a
tiny program that solves an on-chain puzzle. The contract checks it by running it on seeded inputs,
mints the token, and renders an animated SVG from the program's structure and its execution.

Working title. The specification is [PLAN.md](PLAN.md); notes on each milestone are in [docs/](docs/).

**Status:** the VM, the six puzzles, the renderer and the mint contract are done (milestones 1 to 3), and the
fixed test cases were hardened before launch ([docs/M3.5-notes.md](docs/M3.5-notes.md), then
[docs/M3.6-notes.md](docs/M3.6-notes.md)). The playground
(milestone 4) works end to end against a local chain; running it on Base Sepolia waits for the deployment in
milestone 5, which is prepared and rehearsed on a local chain ([docs/M5-notes.md](docs/M5-notes.md)): the
deploy script and `pnpm launch:dry-run`.

## Layout

| Path | What |
|---|---|
| `contracts/` | Solidity (Foundry): `VM`, `Puzzles`, `Renderer`, `Proofkin`, and their tests |
| `packages/vm/` | TypeScript reference VM, assembler and fixture generator |
| `packages/core/` | What the apps share: config, chain reads, the mint flow, phases, storage, puzzle texts, the generated ABI |
| `packages/playground/` | The first web page, with no framework: write a program, test it, watch it drawn, mint it, browse the gallery |
| `packages/web/` | The Next.js app (in progress): server components read the chain, RainbowKit connects wallets |
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

The Next.js app reads the same local chain (`pnpm dev:chain` writes its `.env.local` too): `pnpm dev:web`, then open
http://localhost:3000.

More in [docs/M4-notes.md](docs/M4-notes.md). Launching, and what it needs from the owner: [docs/M5-notes.md](docs/M5-notes.md).
The frontend: [docs/FRONTEND.md](docs/FRONTEND.md) (conventions) and [docs/F1-notes.md](docs/F1-notes.md).

Needs Foundry and Node 22 or later.
