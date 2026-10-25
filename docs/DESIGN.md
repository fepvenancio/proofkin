# Design: the plate album

How `packages/web` looks, and why. The values here are tested (`src/app/design.test.ts` reads the stylesheet that
ships), so a change to the palette that breaks contrast fails the build.

## The idea

Every token is drawn by the contract as a dark, animated constellation: nodes joined by dashed edges, tinted in the hue
of its puzzle. The site is the album they are mounted in. The page is pale paper, each token is a dark plate on it, and
the art is the only light on the page. The six puzzle hues are the only colour.

Not chosen, and why: a dark page with one bright accent (the usual crypto-gallery look, and it would swallow dark
plates); a hero of one big number over a gradient; token cards with rounded corners and soft shadows.

## Palette

| Name | Value | Used for |
|---|---|---|
| Paper | `#eceef1` | The page |
| Plate | `#0a0d14` | The ground behind art, and the empty plate |
| Ink | `#171b2a` | Text, the wallet button |
| Graphite | `#586072` | Secondary text |
| Rule | `#cbd0d8` | Table rows, empty slots |
| Record | `#a87d12` | The ring on a puzzle's smallest solution |

The record gold was `#b98a1e` in the plan; the contrast test measured it at 2.69:1 on the paper and the rule is 3:1, so
it is `#a87d12` (3.22:1).

**A puzzle's hue** (190, 28, 265, 135, 340, 48: the hues the contract paints each puzzle with) is set on an element as
`--h`. Each use has its own saturation and lightness, because yellow and green need to be darker than cyan to be read on
paper:

| Use | Saturation, lightness | Held to |
|---|---|---|
| Text on paper (`text-puzzle`) | 70%, 28% | 4.5:1, all six hues |
| A slot mark on paper (`bg-puzzle-mark`) | 70%, 35% | 3:1, all six hues |
| Text on a plate (`text-puzzle-glow`) | 74%, 70% | 4.5:1, all six hues |

Ink on paper is 14.7:1 (held to 7:1), graphite 5.4:1 (held to 4.5:1), and a plate stands clear of the paper at 16.7:1
(held to 12:1), so the art reads as the light.

## Type

One family, Recursive, a variable font with a monospace axis. Prose uses its proportional setting (`MONO` 0, `CASL` 0,
linear). An address, which a person reads character by character, uses the monospaced one (`font-address`, `MONO` 1);
the same skeleton, so a line mixing the two does not lurch. F3's editor will use the same axis for program text.
Figures in running text are tabular. Loaded through `next/font` with the axes `MONO` and `CASL`, so it is self-hosted
with no request to Google from a visitor's browser. Checked in a browser: addresses render monospaced.

Sentence case throughout. No eyebrows, no all-caps labels (puzzle names are names, set as they are), no arrows on links.
Lines are held to about 46 to 70 characters.

## Layout

```
Home  /                                  Token  /token/3
header: name, Puzzles, Gallery, wallet   plate (large)        Proofkin #3
newest token as a large plate, beside:                         Solves SORT8
  what the collection is, in a sentence                        Puzzle, Nodes, Depth, Solved, ...
  "6 of 300 solved. Minting costs ..."                         Solved by, Owner
  Newest: Proofkin #6, ...                                     View on the explorer
six puzzle rows: name, summary,          Previous: #2     Next: #4
  50-slot strip, "1 of 50 solved. ..."
```

- **Home** is the newest solution as the largest thing on the page. Before the first solution it is an empty plate with
  one dotted ring for each puzzle (the same dotted rings sit behind every real creature).
- **Gallery** is plates with a caption each, no boxes or shadows: the name, the puzzle and its size, and a small ring
  and "Smallest so far" on a puzzle's smallest. Newest first, 24 to a page, filtered by puzzle with plain links.
- **A puzzle page** is the leaderboard: what the puzzle asks, its 50 slots, and the table of solutions smallest first.
- **A token page** puts the traits in a definition list, not badges: they are facts read top to bottom. The one live
  trait, "Smallest so far", says beside itself that it can change.
- On a phone everything is one column with 16px gutters, the navigation drops to its own row, and plates go two across.
  No page scrolls sideways at 375px.

**The slot strip** is the one structural device, because it shows a real quantity: a puzzle has 50 slots, a filled slot
is a solution, and its position is the order it was solved in. The ring goes on the slot of each solution that holds the
record. It is one picture with one description ("2 of 50 solved, smallest 17 nodes"); the sentence under it says the
same in words.

## The workbench

The solve page keeps the album's look and puts the plate to work. On a wide screen the statement, the editor, the test
and the operations reference run down the left, and the plate sits on the right and stays in view as the page scrolls, so
the picture the contract draws is always beside the program that makes it. The plate is the one moving part: it redraws
as you write, and while the next picture is drawn the last one stays, at half strength, so it does not blink out.

- **The statement** reads as a list of terms: inputs, answer, rule, edge cases. An input is shown as the line that reads
  it (`IN 0 to 7`), because that is what the player types, and a run of alike inputs is one line, so a phone reaches the
  editor without two screens of repetition.
- **The editor** is an ordinary text field in the monospaced setting of the one font, on the paper with a rule round it:
  no dark code theme, since the plates are the only dark things on the site. The line under it says in words how big the
  program is or what is wrong, and the line number in an error is a link that selects that line.
- **The test** is a heading, a button and a sentence. A failure shows the case as three terms (inputs, expected, got).
- **Buttons**: the primary action is ink on paper, like the wallet button; everything else is an underlined link.
- **On a phone** the plate follows the editor, since it is what editing is for but should not push the editor down.

### The mint panel

The mint sits under the test and is the one place the page asks for money, so it is plain. Before a mint it is a button,
the reason it is closed when it is (a sentence beside it, not a tooltip), and one sentence saying a mint is two
transactions and how long the wait is. Once a commit exists it is a numbered list, because a mint is a sequence: each step
has a dot in the puzzle's hue, filled when it is done, ringed when it is the one the mint is at, and hollow when it is still
to come. The salt is shown in the monospaced setting with what losing it means, and the countdown says blocks and time
("2 more blocks to go (4 s)"). The only button that moves money is ink on paper, like the wallet's; "Forget" is the one
destructive link, and asks first. The finished panel ends on the token with a link to it.

### The console

`/admin` is the back room of the same album: the same paper, ink and graphite, no new colour, and no link to it in the
navigation. It is for whoever launches and looks after the collection, and it is not for search engines (`noindex`).

- **Before a collection exists** it is a numbered list, because a launch is a sequence: the owner, the renderer, the
  collection, and the settings to give the site. It reuses the mint panel's step marker (filled when done, ringed when it
  is the one the launch is at, hollow when still to come). The one button that moves money is ink on paper, with the reason
  it is closed beside it as a sentence, never a tooltip.
- **The owner is a field, not a default.** It can be the connected wallet ("Use my wallet"), but it has to be named, because
  who administers the collection must never be a side effect of whichever key sends the deployment. A wrong checksum is
  refused, since that is what a mistyped character looks like.
- **Base mainnet is said once, plainly**, with a hardware wallet recommended, and asks for the last six characters of the
  owner's address before the button opens.
- **A launch under way shows its owner in place of the form**, so it cannot be changed halfway, and its next step is a
  "Continue deploying" button with the same gates.
- **When it is done** the page gives the four lines the site reads, in the monospaced setting with a "Copy settings" link,
  one sentence on where they go and why, links to both contracts on the explorer, and the commands that publish the
  source, marked as not yet tried against a real explorer.
- **The collection** is a definition list (chain, address, owner, renderer and whether it is locked, price, how much is
  solved, fees held), with the addresses whole, since a person is meant to check them character by character. Anyone can
  see it; who may change anything is the owner's wallet, and the contract decides that.

## Motion

The art animates itself and nothing else does. A hover brightens a plate's edge in its puzzle's hue, which answers a
pointer. Keyboard focus is a 2px ink outline everywhere. There is no loading skeleton and no entrance animation.

## Accessibility

- Contrast is tested, for all six hues in each of its three uses.
- A plate in a captioned link is decorative (`alt=""`) and the link is named by the caption; the large plate on a token
  page says what it is ("Proofkin #3, a SORT8 solution of 19 nodes").
- The record is marked twice, with the ring and in words.
- The current page is marked in the navigation, the gallery filter and the pager's position.
- The wallet button is ink on paper (7:1 or better), not RainbowKit's default blue.

## Not done

- A dark theme. The art is dark already, so the tokens would swap cleanly, but it is a second design to check.
- Open Graph images: most consumers do not accept SVG.
- A measurement of CPU with a page of animated plates (see `docs/F2-notes.md`).
