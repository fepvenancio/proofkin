# F3a notes: the solve page, without the wallet

The first half of F3 (solve and mint): a page to read a puzzle, write a program for it, test it, and watch the contract
draw it. Nothing here needs a connected wallet or sends a transaction; the mint panel is F3b. How it looks is in
[DESIGN.md](DESIGN.md); the conventions are in [FRONTEND.md](FRONTEND.md).

## What there is

- **`/puzzles/[slug]/solve`**, with a `Solve` link on every puzzle row of the home page and on every puzzle's page.
- **The statement**: what the puzzle asks, its inputs as the lines that read them (`IN 0 to 7  x0 to x7, 0 to 255`), the
  answer, the rule, every fixed edge case, the GRID_PATH edge numbering with its diagram, and (when the chain can be
  read) the price, the slots left and the smallest solution.
- **The editor**: a plain text field in the monospaced setting of the one font. A status line says how big the program
  is or what is wrong, and a "line 7" link selects the line. A draft is kept per puzzle in the browser; "Start over"
  asks before it replaces the program. The thirteen operations are listed under it, folded away.
- **Test locally**: the puzzle's fixed edge cases and 100 random ones, on the TypeScript VM in the browser. A failure
  shows the case, the answer wanted and the answer given. A result belongs to the text it was run on and goes when the
  text changes.
- **The plate**: `Renderer.render(program, seed)` through the public client, redrawn as you write. The last picture
  stays, dimmed, while the next is drawn. "New seed" draws it again from another.
- **What the contract says about the exact program**: a sentence when it has already been minted or its puzzle is full.

## Corrections to F2, made first

The audit of F2 found that the art route and the token page decided whether a token exists from a cached supply that can
be a minute old, so a token minted a moment ago could be a 404 while the gallery already showed it. Confirmed from the
code and from F2's own measurement that the route and the pages held separate cache entries. Now:

- An id above 300 (6 puzzles of 50 slots) is refused without a read. Below that, **the contract says** whether the token
  exists. `parseTokenId` carries the bound, so every caller gets it.
- The art route no longer reads the collection at all (which also removes its separate copy of that read).
- A token the contract says does not exist is a 404 that is kept **five seconds**, by a CDN too: a stranger can ask for
  any id up to 300, and each unminted one costs the node a cheap call, but a token minted a moment later must not stay
  missing.
- Not yet fixed, and not a freshness matter: the token page's "Next" link uses the cached supply, so the newest token's
  neighbour link can lag a minute. It never 404s.

## How the page works

- **A server shell and one island.** The page is a server component that renders the statement from the cached collection
  and hands it to a client island as `children`, so only the editor, the test and the plate ship as client code.
- **A mount gate.** On the server, and while the browser hydrates that HTML, the island draws only its frame: the
  statement, the puzzle's starting point in a read-only editor, and an empty plate. Once mounted it swaps in the workbench,
  which reads the saved draft in its state's initialiser and chooses a random seed. That is what the lint rule against
  setting state in an effect asks for, and it removes a race: nothing can be written back before the draft was read. Two
  server-render tests hold it (the server sends the starting point and never a saved draft, no seed, no test).
- **Writing and testing need no chain.** If the chain cannot be read the statement is shown without its facts, the test
  works, and the plate says why it cannot draw.
- **Reads are keyed by program.** The preview and the on-chain check are TanStack queries keyed by the program's bytes
  (and seed), so editing a comment asks the node nothing. A drawing never goes stale and is kept for the visit; what the
  contract says about the program is kept for 15 seconds.

Measured in a browser against a local chain, with a counting proxy in front of the node:

| What the visitor did | The node saw |
|---|---|
| Opened the page with a saved valid program | 1 request carrying 3 calls (render, seen, solved count) |
| Changed the program | 1 request carrying 3 calls |
| Typed a program in four bursts | one set of 3 calls, for the last text |
| Changed only a comment (the same bytes) | nothing |
| Wrote a program that does not assemble | nothing |

## What the checks found

- **The status was asked about the wrong program.** After an edit the on-chain check briefly ran for the *previous*
  program (5 calls instead of 3), and its answer could show "already minted" against text that was not that program. The
  page now asks about, and speaks of, only the program on the screen. Found by counting calls in a browser; a test now
  fails if the note outlives the text it was about.
- **The browser's connection to the chain did not batch**, so three calls were three requests to a public node. It does
  now (`http(url, { batch: true })`, as the server's already did), and a test with a counting node holds it.
- **A phone had to scroll two screens to reach the editor** on GRID_PATH, because twelve inputs with the same range were
  twelve lines. A run of three or more alike inputs is now one line (`IN 0 to 11  edge 0 to edge 11, 0 to 15`), pure and
  tested for all six puzzles. No page scrolls sideways at 375px.

## Tests and mutants

Web 380 tests (263 before). The 75 web mutants of F2 are 112 now. No core change in F3a: the gate, the step resolver and
the typed error map belong to the mint (F3b). Lint, typecheck and Prettier pass. The run of the 112 mutants was still going
when this was committed; its result is in the pull request's description.

- **Test-first:** every module, component and page had a failing test before its code. Two exceptions worth saying: the
  island was first built with a state-setting effect, which the lint rule rejected, and was restructured behind the mount
  gate after server-render tests (red first) described it; and two of my own test expectations were wrong (SORT8 has four
  fixed edge cases, and the starting point passes the first and fails the second) and were corrected to the real,
  deterministic values.
- **In a browser:** the page against a local chain with the six fixture solutions minted. The real SORT8 solution is
  valid at 46 nodes and passes 104 cases, a broken line is pointed at and selected, the contract draws the plate, "already
  minted" shows for a minted program and not for a changed one, a draft survives a reload and is not shared with another
  puzzle, and the console shows nothing from the app.

## Not done, on purpose

- **No mint panel, no wallet.** That is F3b.
- **No syntax highlighting or line numbers** in the editor; a program is at most 64 lines.
- **No program of anyone else's is shown.** The token page still shows none.

## Not checked

- **A real public RPC.** A 64-node program's render is a heavy `eth_call`; a public node may refuse it or rate-limit the
  page. The page says why when it is refused and does not retry by itself, but the limits are unproven.
- **CPU and layout shift** on a real phone, and a keyboard-only or screen-reader pass. The browser pane here is a
  desktop engine at 375px.
- **The swap from the server's frame to the workbench** was not measured for layout shift; the frame has the same two
  columns, but the test panel and the operations reference appear after it.
