# F2 notes: the read-only gallery, token page and leaderboards

The first real pages of `packages/web`, built from the chain on the server. Nothing here sends a transaction or depends
on a connected wallet. How it looks is in [DESIGN.md](DESIGN.md); the conventions are in [FRONTEND.md](FRONTEND.md).

## What there is

| Address | Page |
|---|---|
| `/` | The newest solution as a large plate, what the collection is, and the six puzzles with their 50 slots |
| `/gallery` | Every token, newest first, 24 to a page; `?puzzle=sort8` and `?page=2` |
| `/puzzles/[slug]` | One puzzle: what it asks, its 50 slots, and its solutions smallest first (the leaderboard) |
| `/token/[id]` | One token: its art, the contract's traits, who solved it, who owns it, the previous and next token |
| `/token/[id]/art` | The token's SVG as an image, with its own cache headers |

Plus a header with the wallet button and the main navigation, and not-found and error pages.

## How it reads the chain

- **The gallery, the leaderboards and the slot strips are built from the `Solved` events** (one read, shared), so no
  token is rendered to draw a page. The art loads separately, one image per plate, as the plates scroll into view. The
  contract renders each token on demand (up to 3.4M gas), so this is what keeps a page of 24 cheap. `tokens(id)` was
  planned for the cards and not needed: the events carry the puzzle, the size and the solve order.
- **Every read is cached for a minute** (`chain/cache.ts`, `unstable_cache`) and is plain JSON, so the types refuse a
  `bigint` (the price is a string of wei). A read that throws is not stored.
- **Reads made at the same moment go to the node as one batch** (`http(url, { batch: true })`): the collection alone is
  fourteen calls.
- **The history is checked against the supply.** If it holds fewer solutions than there are tokens (the deploy block in
  the settings is too late) the page says so instead of showing a short list as a complete one.
- **A failure is a value.** `settle` turns a read of one token into found, missing (the contract's `TokenDoesNotExist`)
  or unavailable. Missing is a not-found page; unavailable is a sentence naming the chain, with the cause in the server
  log, never the node's URL.

Measured against a local chain holding the six fixture solutions, with a counting proxy in front of the node, from a
cold cache:

| Request | Node saw |
|---|---|
| `/` | 2 requests: the 14 collection calls batched, and the block number with the events |
| `/` again, `/gallery`, `/puzzles/sort8` | 0 |
| `/token/3` | 1 request, 2 calls (`tokenURI` and `ownerOf`) |
| `/token/3` again | 0 |
| `/token/3/art` | 2 requests, 15 calls: the token's, and the collection again (see below) |
| `/token/99/art`, beyond the supply | 0, and a 404 |

**The cache key includes the text of the function that reads.** Next.js builds it from the callback's source as well as
the key parts, so the same read compiled into the art route and into a page has two entries. It costs one more batch of
14 calls a minute and nothing else; it also means every deploy starts with a cold cache. Noted, not worked around.

## What the checks found

- **A page that said "not found" answered 200.** With a `loading.tsx` above them, Next.js sends the page's shell before
  the page has read anything, so a later `notFound()` becomes a 200 with `noindex`, even for a crawler. Seen in a real
  server. The loading page was dropped (the data is cached, so there is little to wait for), and
  `test/status.test.ts` fails if one comes back. Unknown tokens, puzzles and gallery pages now answer 404, to a browser
  and to a crawler.
- **The plan's record gold failed its own contrast rule** (2.69:1 against a rule of 3:1) and three of the six hues were
  too light for text at the planned lightness. The contrast test caught both; the values are in `DESIGN.md`.
- **RainbowKit's button was bright blue**, the one colour on the page that is not a puzzle's. It now wears ink on paper
  (`config/walletTheme.ts`), and a test ties its two colours to the stylesheet's.
- **The token page's traits were squeezed** at tablet width; the plate column is narrower there.

## Checked in a browser

Against a local chain with a block a second, the six fixture solutions minted through the dry run, and the built app:

- Home, gallery, a puzzle's page and a token's page render with real art; the console is empty.
- At 375px no page scrolls sideways (measured on all four).
- Addresses render in Recursive's monospaced setting; prose in its proportional one.
- All six plates of the gallery load lazily and animate.
- `/token/0`, `/token/99`, `/puzzles/chess` and `/gallery?page=9` answer 404.

## Tests and mutants

Written test-first; the exceptions are named here. Web 263 tests (47 before), core 153 (149), playground 15. Lint,
typecheck and Prettier pass in web, core and playground typecheck, and the app builds with no environment and against a local
chain.
The Solidity and `vm` suites were not touched and not re-run.

- **Mutants:** the 75 web mutants (26 before) and the new core one are all killed, none survive, and every source file
  was compared by hash afterwards (135 of 135 identical). The tool counts any failing exit as a kill, and the machine was
  busy, so ten of the more important mutants were applied again by hand: each fails the assertion meant for it, with no
  timeout. One of them ("the art route skips the supply check") fails on a `TypeError` after the mutant makes the route
  call a reader it should not have reached, rather than on the assertion that says so.
- **Test-first, with two exceptions.** Every other module, component and page had a failing test before its code. The
  trait wording (`model/traits.ts`) and its first test were created together, so that test was never seen red (the label
  change after it was, and the mutants cover it). `test/status.test.ts` was written after the 404 problem was found in a
  browser, and shown to fail by putting a loading file back.

## Changes outside `packages/web`

- `@proofkin/core`: `ordinal` moved here from the playground's gallery (the playground imports it); `leaderboards`
  accepts rows without a block number, so cached rows can be passed to it.
- `tools/mutate.py`: the web suite is 75 mutants (26 before), the core suite 27.
- The two placeholder fonts F1 added are gone, and so are their dependencies.
- Vitest resets mocks between tests (`mockReset`), because a value queued by a test that threw `notFound()` first
  answered the next test.

## Not done, on purpose

- **No program is shown on the token page.** The puzzles are the game.
- **No dark theme, no Open Graph images, no search.**
- **A puzzle's page lists its solutions but not their plates**; it links to the gallery filtered to that puzzle.

## Not checked

- **CPU with a page of animated plates.** The browser pane was hidden, so no animation frames ran and a frame-rate
  measurement cannot be trusted. The art is small (at most 15 animated elements and one keyframe each), so 24 plates is
  a few hundred; that bounds the work but does not measure it. Worth a look in a visible window.
- **A real public RPC.** `eth_getLogs` range limits, `eth_call` gas caps and rate limits are unproven, as they were for
  the playground. The history is read in slices of 9,000 blocks, which is cheap at launch and a request per slice for an
  old deployment; a stored high-water mark would fix it later.
- **`Providers` holding its wagmi configuration in `useState`**, and a real wallet connecting, as in F1.
- **The pager and a second page of the gallery in a browser**: there were six tokens. The pages are covered by tests with
  30 solutions.
