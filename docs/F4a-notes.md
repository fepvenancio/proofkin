# F4a notes: the admin console, deploying

The first half of F4: a page, `/admin`, where a connected wallet deploys the renderer and the collection, the code on
the chain is checked against what was built, and the settings that make the site show the collection are handed over.
How the collection is looked after (replacing the renderer, locking it, withdrawing, handing ownership on) is F4b. How it
looks is in [DESIGN.md](DESIGN.md); the rules are in [FRONTEND.md](FRONTEND.md).

## What there is

- **`/admin`**, with no link in the navigation and `noindex`. Before any collection exists it is a numbered list: the
  owner, the renderer, the collection, and the site's settings. The owner is a field to fill in (or "Use my wallet"),
  never a default. Base mainnet asks for the last six characters of the owner's address and recommends a hardware wallet.
- **A launch that survives a closed tab.** The record is saved when the owner is named and after each transaction is sent,
  before it is waited for. "Continue deploying" picks it up from the chain and never sends a second renderer.
- **A check against the build.** The collection's code must equal the compiled code with the launch price written into
  the two places the compiler left for it, byte for byte, and the renderer's must equal the compiled renderer; then the
  owner, the renderer it points at and the price are read back.
- **The settings**: the four `NEXT_PUBLIC_*` lines Deploy.s.sol prints, a "Copy settings" link, explorer links, and the
  `forge verify-contract` commands (marked as not tried against a real explorer).
- **How the collection stands**: owner, renderer and whether it can still be replaced, price, how much is solved, fees held.
  For anyone, from the site's own settings, or from the launch this browser made.

## Changes to what was planned

- **No `NEXT_PUBLIC_DEPLOYER`, no dry run in the console, and the receiving side of the ownership handover is in F4b**:
  the three changes put to you, which you confirmed. The collection is administered by whoever `owner()` says.
- **`app/admin/`, not `app/(admin)/admin/`.** A group with one route says nothing. The root layout keeps the chrome
  (header, providers) and checks the chain only (`readChainConfig`); `(site)/layout.tsx` checks the contracts. Seen from
  outside, one thing changed: a deploy whose contracts are not set now shows its list of problems under the site's
  header, where it showed nothing else. A 404 is unchanged.
- **Only `programStatus` is ended after a reveal, not `latestBlock`.** The latest block only decides whether an
  unfinished commit's window has closed; a value ten seconds old there costs nothing, since resuming reads the chain.

## Step 0: the two fixes from the audit of F3b, on PR #1's branch

Both were confirmed against the code first (see the conversation), and fixed test-first:

- After "Mint another" with the same program, "Commit solution" stayed enabled, because nothing ended the cached
  `programStatus`: the commit would have been sent and the reveal refused with `AlreadyMinted`. `onRevealed` now ends
  every `programStatus` of this collection (`queryKeys.programStatuses`).
- A new commit's salt read "Copied" because the last one had been copied. The panel now remembers which salt was copied.

## What it is made of

- **`@proofkin/core/launch`**, a second entry of core, because the contracts' creation code is about 64 KB of hex that
  no visitor's page should carry. `pnpm gen:abi` now also writes `src/launch/bytecode.ts` from `out/`, and a test fails when
  it is stale. The generator refuses a contract that gains a library to link, a second immutable, or a renderer with an
  immutable, so the check cannot silently stop meaning what it says.
- **Core owns the money logic**, as with the mint: `prepareDeploy`, `sendRenderer`, `sendProofkin`, `runDeploy` and
  `verifyDeployment`, tested against a real Anvil chain. Each step is resumable. Before sending, the node is asked to
  estimate the gas, so a creation that would revert is refused with its reason before any gas is spent. After the receipt,
  code is read at the receipt's block, so a node that has not caught up answers with an error rather than an empty account.
- **Pure decisions**: `deployGate` (what closes the button, in the order a person fixes it), `ownerInput` (an address with
  a bad checksum is not one), `confirmationTail`/`isConfirmed`, `envBlock`, `verifyCommands`, and `LAUNCH_MINT_PRICE` and the
  three chains, which tests pin to Deploy.s.sol's own constants.
- **`parseChainConfig`**, the chain half of `parseConfig` with the same messages, so the page can draw before a contract
  exists. `createWagmiConfig` and `useWallet` need only the chain.
- **`collectionFromEnv`**: one collection, none, or an attempt that does not add up. A collection named in part, or with a
  typo, is reported as an error and not taken for an absence.
- **The step list of the mint panel became a component** (`Step`), since the console is its second user.
- **The architecture checker has a fourth rule**: only `src/app/admin` and `src/features/admin` import
  `@proofkin/core/launch`, and nothing else imports the console.

## Measured

Against a local Anvil chain, in a browser, through the real RainbowKit modal with a wallet shim (Anvil's first account,
whose key is public, answering the wallet's calls itself and forwarding the rest to the node):

| What was done | What happened |
|---|---|
| Deployed with another account as the owner | Two transactions with no recipient, 17,549 and 14,518 bytes; the collection's owner is the named account; `cast` reads back the same owner, renderer, price and `rendererLocked` false, and the code's length is the build's 14,003 bytes |
| Reloaded with no wallet | "Deployed from this browser": the settings and the collection's state |
| The wallet refused the second transaction | "You rejected the request in your wallet.", the renderer shown as deployed, "Continue deploying" offered |
| Reloaded, reconnected the same account, continued | Exactly one transaction sent (14,518 bytes), to the same renderer; done and checked |
| Rebuilt the site with the printed settings | `/` says "0 of 300 solved. Minting costs 0.01 ETH", and `/admin` shows the collection "named by this site's settings", with no deploy form |
| Only the chain configured | `/` shows the list of problems under the header, `/nonsense` is a 404, `/admin` draws |
| 375 px wide | No page scrolls sideways; the settings block scrolls inside itself |
| The chunk with the bytecode | 148 KB (43 KB gzipped); only `/admin` loads it, and `/` and the solve page do not |

## Tests and mutants

Web 600 tests (496 at F3b), core 244 (181), playground 15. Typecheck, lint and Prettier pass for the web package; the core
package is not Prettier-formatted, as before.

- **Test-first, with exceptions.** Red was seen first for the audit fixes, `parseChainConfig`, the environment readers,
  the chain-only wallet configuration, both layouts, the launch module, the deploy flow, the collection reader,
  `collectionFromEnv`, `Step`, the hook and every component. Not seen red first: `deployGate` and `ownerInput` were written
  beside their tests (one of the tests then found the owner check accepting a bad checksum, now strict), and the architecture rule's tests were shown to fail
  afterwards by taking the rule away.
- **Mutants**: a new `launch` suite of 34 for core's launch code, and 22 new web mutants (the 17 existing mutants whose files
  moved into `(site)/` were repointed, and every target path in the tool was checked to exist). Of the 56 new ones, 48 were
  killed at once and 8 survived:
  - seven were real gaps in the tests, now closed: the renderer's code being checked before the collection is sent (the
    test now also checks that nothing more was sent); a collection with the wrong code, on its own, being called done (two
    mutants); a collection pointing at a different but perfectly good renderer; a chain with a valid name and a bad block
    time; the console showing another account's launch after the wallet switches; and a finished launch being hidden by a
    newer unfinished one;
  - one is equivalent and was removed from the suite (33 remain): the early return in `sendRenderer` when the renderer is
    already on record, since the recorded transaction hash already stops a resend;
  - the seven were re-run against the new tests and all die. The 150 existing web mutants and 36 core ones were not re-run.
- **Not every kill is an assertion.** The tool counts any failing exit as a kill. Two behavioural mutants were applied by
  hand ("a transaction already sent is sent again", "a creation that would revert is sent anyway"), and each fails on the
  named test.

## Not done, on purpose

- **No configuring** (replacing the renderer, locking it, withdrawing, the handover): F4b. The status block is read-only.
- **The playground is not retired**: its `dev-chain` and dry-run scripts still need a new home.

## Not checked

- **A real wallet.** Only the shim was used: a real extension's confirmation screen for a 17 KB contract creation, a hardware
  wallet, and WalletConnect (no project id exists yet).
- **A real public RPC and a real network**: only a local chain and Base mainnet in unit tests, not in a browser. The typed
  confirmation for Base is tested as a function and in the panel, never against Base.
- **Base's L1 data fee.** The gas estimate does not include it; the wallet shows the full cost.
- **A transaction that never mines.** The page waits for viem's default of three minutes and then shows its error; the
  record keeps the hash, so "Continue deploying" waits again, but a transaction that was dropped from the mempool
  would need "Forget this deployment" and a new launch. Not tried.
- **The `forge verify-contract` commands**, on any explorer. The mainnet Blockscout address in them was not checked.
- **Two tabs deploying at once** from the same account.
- **Anvil's chain is called "Foundry"** on the page, which is viem's name for it.
