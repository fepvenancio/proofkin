# Milestone 4 notes

*Since the frontend's first step ([F1-notes.md](F1-notes.md)) the framework-free modules listed below live in `packages/core`, with their tests; the playground keeps its UI, the wallet connection, `dev-chain` and the dry run. File names in this record are as they were.*

The playground (PLAN.md §9): `packages/playground`, a static site built with Vite, TypeScript and viem. No
backend, no framework.

## Run it

```bash
forge build             # the local deploy reads the compiled contracts from out/
pnpm dev:chain          # Anvil with a block a second, both contracts deployed, .env.local written
pnpm dev:playground     # http://localhost:5173
pnpm build:playground   # static files in packages/playground/dist, to host anywhere
```

You need a browser wallet on `http://127.0.0.1:8545` (chain id 31337) using one of Anvil's public test accounts.
The page picks its chain and contracts from `packages/playground/.env.local` (see `.env.example`); a missing or
wrong setting is listed on the page itself, all at once.

**Base Sepolia** is the same page with a different `.env.local` (`VITE_CHAIN=baseSepolia`, the two addresses,
`VITE_DEPLOY_BLOCK`). It needs the contracts to be deployed there first, which is milestone 5. That run has not
happened yet, so milestone 4's "works on Base Sepolia" is not demonstrated.

## What is where

| File | Job |
|---|---|
| `src/puzzleInfo.ts` | What each puzzle says (ranges, edge cases, rule), the GRID_PATH edge numbering and diagram, each puzzle's hue |
| `src/analyze.ts` | Editor text to a program, or to an explanation naming the player's own node and line; the starting program |
| `src/localTest.ts` | The test run: every fixed edge case of the puzzle (2, or more since milestone 3.5) and 100 random ones on the TS VM, first failing case reported |
| `src/commitment.ts`, `src/storage.ts` | The commit hash (the contract's layout), the salt, and the saved commits that survive a closed tab |
| `src/phase.ts`, `src/mintGate.ts` | Where a commit is in its reveal window; when the Mint button may be pressed |
| `src/mint.ts` | Prepare, commit, reconcile, reveal; every transaction simulated first; revert reasons in plain words |
| `src/chain.ts`, `src/gallery.ts` | Reads: collection state, `Renderer.render` previews, token decoding, `Solved` events, leaderboards |
| `src/wallet.ts`, `src/config.ts` | Connecting an EIP-1193 wallet and switching or adding the network; the environment |
| `src/ui/` | The DOM: the solve page, the gallery |
| `scripts/` | `gen-abi.ts` (ABIs from the Foundry artifacts), `local-chain.ts` and `dev-chain.ts` (Anvil plus both contracts) |

## How it was checked

- **144 tests** in the playground, 348 TypeScript tests in all. The chain tests deploy the real `Renderer` and
  `Proofkin` to a private Anvil chain per test file and drive the app's own code: commit, wait, reveal, resume
  from storage, a refusing wallet, an expired window, a stolen commit, a duplicate program, a wrong solution,
  all 50 slots of a puzzle. `Renderer.render` read over `eth_call` is compared byte for byte with the SVG
  snapshots the Solidity tests pin.
- **ABIs** are generated from the compiled contracts and a test fails if `src/abi.ts` is stale. The page's tint
  for each puzzle is compared with the hue `Renderer.sol` paints it with.
- **In a real browser** (Chrome engine, against Anvil with a block a second): pick a puzzle, load a program, see it
  drawn by the contract, run the local test, connect, commit, reload the page mid-flow, resume, reveal, find the
  token in the gallery with its eight traits and gold "smallest" ring, and an empty puzzle's leaderboard. The
  console stayed clean. A 375px phone viewport has no horizontal overflow.
- Mutation testing of the money-and-salt logic: see "Results" below.

## Results

`python3 tools/mutate.py playground` changes the playground's source in 21 places, one at a time, and runs the
suite after each: the reveal window's edges, the commit hash, saving the salt before sending, the payment, the
guard against an expired window, the mint gate, storage, the block-number cache, token decoding, the
leaderboard order, the wallet's network switch and the config check.

First run: 18 killed, **3 survived**. Each pointed at a missing test, not at a bug:

| Survivor | Missing test | Added |
|---|---|---|
| The edge-case wording switched at trial 2 instead of trial 1 | Only trial 0 was ever checked | `friendlyError` on a real encoded `SolveFailed` for trial 1 and trial 2 |
| Leaderboard ties no longer broken by solve order | Every test fed rows already in order, and a stable sort hid it | Equal sizes arriving out of order. In the page the rows are already in token order, so this pins what `leaderboards` promises rather than a bug a visitor could meet |
| Any wallet error sent the page to "add this network" | Only the unknown-chain error (4902) was ever thrown | A wallet that refuses the switch (4001) must not be asked to add the network |

After those three tests: **21 of 21 killed** (each of the three re-run on its own, and the pattern check
confirms no source file was left mutated). The tests that killed them were also run on the unmutated source and
pass.

## Choices

1. **The starting program is valid but wrong** (one input wired to the output). The preview and the first failing
   test case appear at once, so the player iterates from a working loop instead of from an error.
2. **Only the creature is sticky.** It stays beside every step. A whole sticky column taller than the screen cannot
   pin, which the first browser run showed.
3. **No example solutions are shipped** in the page. The six solutions are in the repository's fixtures, but the
   playground does not offer them.
4. **The reveal countdown is measured against the block the reveal will land in**, not the latest block, so the page
   never tells a player to send something the contract is certain to refuse.
5. **Mint needs a passing local test**, and says so. The contract still draws its own 8 random cases at reveal, and
   the page says that a pass here is a rehearsal.
6. **Drafts** are kept per puzzle in the browser, and the salt of every commit is written down before the commit is
   sent. If the browser will not store anything, the page says to copy the salt.
7. **Wallets**: whatever is at `window.ethereum`. No wallet picker (EIP-6963) and no WalletConnect.
8. **The gallery grid** follows `totalSupply`; the leaderboard follows `Solved` events read in 9,000-block slices
   (public nodes cap `eth_getLogs` ranges). If the events found are fewer than the supply, the page says the
   deploy block is probably too late.

## Bugs found while building, and what guards them

| Bug | Guard |
|---|---|
| Measured the window against the latest block: at `commit + 250` the page said "ready, 0 blocks left", but a reveal sent then is mined at `+ 251` and reverts | `phase.test.ts` checks every block offset; two chain tests at the boundary |
| viem answers `getBlockNumber` from a 4-second cache, so a countdown could show a stale block | `cacheTime: 0`; a chain test mines blocks and reads them back |
| Test files shared one Anvil chain; one file's snapshot/revert broke another's transactions (a 5-minute hang) | Each test file starts its own chain |
| The mint panel was rebuilt on every new block, replacing the button under the pointer, so a click spanning a block was lost | The countdown now updates in place and the panel is rebuilt only when its shape changes. **Checked in the browser only**: `src/ui/` has no unit tests |
| The starter program, an unreadable `Fix the program` error | Replaced by a valid starting program; its test requires it to validate and to fail |

## Not covered

- **Base Sepolia**, as above. Also unproven against a public RPC: `eth_getLogs` range limits, `eth_call` gas
  caps (the worst-case render is 3.4M gas), and polling rates.
- **Real wallet extensions.** The browser run used a small EIP-1193 shim that forwards to Anvil's unlocked
  account, so connecting, network switching and transaction prompts have been exercised only against fakes and
  that shim.
- **`src/ui/`** has no automated tests. The logic it uses does; the page itself was checked by hand.
- **Accessibility** beyond the basics (focus rings, roles, labels, keyboard use of the tabs and the dialog) has had
  no screen-reader pass.
- Hosting needs a content security policy chosen for the real RPC; the page sets some styles through attributes,
  so a strict `style-src` would need adjusting.
