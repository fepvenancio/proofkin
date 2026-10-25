# F3b notes: the wallet and the mint

The second half of F3: on the solve page, connect a wallet, commit, wait, reveal, and end on the token. Also picking a
mint up again after a closed tab, and making the site's caches fresh at once. The first half is in
[F3a-notes.md](F3a-notes.md); how it looks is in [DESIGN.md](DESIGN.md).

## What there is

- **The mint panel**, under the local test on `/puzzles/[slug]/solve`: the wallet's connect button, "Commit solution",
  and then a numbered list of the steps of the mint: salt saved, commit, wait 3 blocks, reveal and mint, and the token.
- **The wallet**: RainbowKit's button, in the page's ink (F2). A wallet that is still reconnecting after a page load is
  "connecting", not "none". A wallet on another network gets a "Switch network" button and no client, so nothing can be
  sent to the wrong chain.
- **Resuming**: commits saved in this browser for the connected account are listed under "Unfinished mints". "Continue"
  picks one up from the chain; one for another puzzle links to that puzzle's page, where its program is; "Forget" asks
  first, since it deletes the salt. A commit older than its 250-block window is called dead and can only be forgotten.
- **A server action, `refreshAfterMint`**, called after a reveal: it makes the home page, gallery and counts fresh at once.

## What it is made of

- **The flow is core's.** `prepareCommit`, `sendCommit`, `reconcile` and `sendReveal` were written and tested against a
  real chain in milestone 4. wagmi's public and wallet clients fit them unchanged (checked with a throwaway type check
  before any of this was written), so F3b adds what a page needs around them and does not rewrite the money logic.
- **Pure, tested decisions in core**: `mintGate` (gains "connecting"), `stepGate` (may the next step of a commit in flight be
  sent: busy, wallet, network, and the account that committed, compared without regard to letter case), and
  `resolveMintStep` (idle, unsent, checking, waiting, ready, expired, revealed, from the commit and the block). The panel
  decides nothing; it places the words.
- **The error map is exhaustive.** The contract has 36 errors; 20 are explained to a minter and the other 16 are listed
  as not on the mint path (the owner's, the token standard's, and ones that cannot happen once a program validated). A
  test fails when the contract gains an error that is in neither list, so a new revert cannot reach a player as a raw name.
- **`useMintFlow`** holds the commit in flight, whether a step is being sent, the sentence for a refusal and the
  block the countdown is measured against. The salt is written down and shown before the commit is sent, and blocks are
  watched only while a commit is waiting to be revealed.
- **The panel's countdown changes text, never structure**, so a block that arrives between the pointer going down and
  coming up does not replace the button under it (the playground's one browser-only bug); a test holds it.

## The server action

A server action is a public endpoint, so it believes nothing it is told.

- The server reads the transaction's receipt itself (`verifyReveal`) and needs it to have succeeded and to carry a `Solved`
  event emitted by this collection's contract. An event from another address that merely looks right does not count.
- Each hash is acted on once, and only after it has been proven: a hash that is not mined yet must not be used up, and a
  replayed public hash must not keep the caches cold.
- Beyond 20 real checks a minute it refuses outright, so the endpoint cannot be used to spend the node's allowance. All of
  this lives in the memory of one server process, which is all a courtesy needs: the caches expire by themselves.
- It expires two cache tags (`collection`, `solved`) with `updateTag`, which Next.js documents for caches made with `fetch`
  and `use cache`. `unstable_cache` entries are the same kind of tagged entry (read in Next's source), and the browser run
  below shows it working.
- The architecture checker learned the one legitimate way a client component reaches the server: a module beginning
  with `"use server"` is a boundary it may import, and its own imports are not followed. Only the directive makes the
  boundary, and only at the top of the file, not in a comment.

## Measured, in a browser, against a local chain

A wallet shim in the page (Anvil's first account, which has a public key, answering wallet calls itself and forwarding
the rest to the node), used through the real RainbowKit modal and the built app.

| What was done | What happened |
|---|---|
| Connected, committed, waited, revealed | Token #1 in **4.6 seconds** from the reveal click; both transactions sent (`commit`, `reveal`) |
| Home page and gallery read at zero tokens, then the mint, 17 seconds later | **1 of 300 solved**, "1 token", `/token/1` a 200 with its art |
| Control: the same, but minted by a script outside the site | still **2 of 300** inside the minute, and again on the first visit after it; **7 of 300** on the next |
| Committed, reloaded the tab, reconnected | the commit was listed, "Continue" landed on the reveal step, the reveal made token #2 |
| Committed, then mined 300 blocks | "The 250-block window for this commit has closed", no reveal offered |
| The wallet moved to another network | "Switch your wallet to the right network" and a button that switched it back |
| The first program again | "This exact program has already been minted", the button closed |

So a mint made through the site is fresh at once, and one made anywhere else takes up to a minute and one visit (the first
request after the minute is answered with the old value while it refreshes, which is how the cache is meant to work).

## What the checks found

- **A dead commit was still offered "Continue".** After the window closes the list kept offering a commit that can only
  lead back to the expired alert. The panel now knows the chain's newest block and offers such a commit only "Forget".
- **Two of my test setups were wrong** (a stub that read React state before React had drawn it; an element React
  skipped because it was the same one), and were corrected, not the code.

## Tests and mutants

Web 496 tests (384 before); core 181 (153); playground 15. Lint, typecheck and Prettier pass. The full-flow tests drive
the real core flow through a small in-memory chain (`test/fakeChain.ts`) that answers exactly the calls the flow makes.

- **Test-first, with two exceptions.** `useWallet` was written beside its test in one step, so that test was never seen
  failing; and the solve page's hand-over of the facts to the island was coded before its test. Mutants cover both.
- **Mutants**: this step added 38 web and 9 core mutants, and the run covered those and the older ones aimed at code this
  step changed: core 18 of 36 (all killed) and web 50 of 150. Of the 68, 67 were killed and one survived: forgetting the commit
  that is in flight left it on screen. The UI cannot reach that case (the list excludes the commit in flight), but the hook
  can be asked, so it now has a test, and the mutant dies. The other 18 core and 100 web mutants target code this step did
  not touch and were not re-run. Every source file was compared with the hashes taken after the gates passed (186 of 186
  identical).
- **Not every kill is an assertion.** The tool counts any failing exit as a kill, so six behavioural mutants were applied by
  hand: five fail on a named assertion, and one ("a failed refresh is an error to the player") is caught by vitest reporting
  an unhandled rejection, not by a test about the notice.

## Not done, on purpose

- **No admin console** (F4), and no automated end-to-end run (F5): the browser run above used a shim by hand.
- **The playground is not retired.** Its `dev-chain` and dry-run scripts, which this step used, need a new home first.

## Not checked

- **A real wallet.** Only the shim was used. A real extension's confirmation screen, a hardware wallet, a mobile wallet
  and WalletConnect (no project id exists yet) are untested, and so is how a real wallet words a refusal.
- **A real public RPC**, and two tabs minting at once (the second reveal of one commit would be refused by the contract).
- **The salt in storage**: a browser that blocks storage is handled and tested, but not seen.
