# Frontend conventions

How `packages/web` is built, and the rules that keep it that way. How it looks is in [DESIGN.md](DESIGN.md). Most of the rules are tests, so they cannot
quietly stop being true. Where they came from: a study of `kam-frontend` (what to keep, what not to), and the NatSpec
the `kam` contracts are documented with.

## Packages

| Package | What | Runs in |
|---|---|---|
| `@proofkin/vm` | The reference VM, assembler and puzzles | anywhere |
| `@proofkin/core` | What the apps share: config, chain reads, the mint flow, phases, the mint gate, storage, puzzle texts, the generated ABI. `@proofkin/core/testing` adds the Anvil harness | browser and server (`/testing`: Node only) |
| `@proofkin/web` | The Next.js app | server components, and client islands |
| `@proofkin/playground` | The first, framework-free page. Retired once `web` reaches parity | browser |

## Layout of `packages/web/src`

```
app/          routes. Server components by default; the root layout and the providers are the only wiring.
components/   presentation. No data fetching: they take what was already read.
config/       the one place settings are read (env.ts), and the wagmi configuration.
chain/        server-only reads of the chain. Every file here says `import "server-only"`.
features/     one folder per flow (`features/solve/`): its hooks, pure view functions and components, and the one island that
              joins them. A page imports the island and the statement, nothing deeper.
model/        the shapes the pages share (JSON-safe `type`s) and pure wording, kept out of `chain/` so a component can use them without reaching a server-only module.
```

Added when first needed, not before: `contracts/`. (`features/solve/` and `config/queryKeys.ts` came with F3a.)

## The server/client rule

- **Server components are the default.** They read the chain through `chain/`, using `RPC_URL`, which may carry a
  provider key and is never a `NEXT_PUBLIC_` name. The gallery, token pages, the leaderboard and the puzzle pages
  render there.
- **Client islands are leaves**: the wallet button, the editor and local test, the mint flow with its block
  countdown, the admin console. A wallet exists only in a browser, so nothing above an island needs to be a client
  component.
- `layout.tsx` reads the wagmi cookie on the server and passes it to the providers, so the first paint already knows
  whether a wallet is connected.

Enforced by `test/architecture.test.ts`, over the real `src/`:

1. A client component, and everything it imports however deep, never reaches a module that imports `server-only`.
2. Every module in `src/chain/` imports `server-only`, so rule 1 has something to catch.
3. The environment is read in `src/config/env.ts` and nowhere else, and there only as `process.env.NAME`: Next.js
   replaces exactly those expressions, and in the browser `process.env` itself is empty.

`env.test.ts` checks the list of public variables against `.env.example`, so neither can drift.

More rules, each pinned by its own tests:

- **The wagmi configuration is built per request on the server** (`getWagmiConfig`), and once in the browser. A
  server never counts as hydrated, so each request's cookie overwrites the connection state of a configuration shared
  between requests, and a visitor could be rendered with the wallet of whoever rendered after them.
- **A failed read is a value, and its cause goes to the server log** (`chain/collection.ts`). The log carries viem's
  `shortMessage` and `details`, never its `message`: that repeats the request's URL, which is `RPC_URL` and may hold a
  provider key. The page says which chain it could not reach and nothing about how.
- **Reads of the chain go through `cachedRead`** (a minute, keyed by what was asked, the chain and the collection) and
  return JSON: the types refuse a `bigint`, so the price travels as a string of wei. Reads made at the same moment are
  one JSON-RPC batch. Pages build every list from the `Solved` events and never render a token to draw a list; the art is
  its own address (`/token/[id]/art`), loaded as the plates scroll into view.
- **Browser-only state is read after hydration, behind a mount gate** (`useMounted`). A client component that needs
  storage or randomness draws only its frame on the server and while the browser hydrates, and mounts the part that needs
  them afterwards, so the first browser render matches the server's and nothing sets state in an effect to get there. The
  solve island's server-render tests hold it.
- **A result belongs to what it was about.** A test result is kept with the text it was run on and compared to the text on
  screen, not cleared by an effect, and the page speaks only of the program on the screen: until an edit has settled, a
  query's answer is about an earlier one and is not shown.
- **A token that does not exist is a 404, not a 200.** No route that can say "not found" has a `loading` file above it:
  it would make Next.js send the shell before the page has read anything, and `notFound()` would then be a 200 with
  `noindex`. `test/status.test.ts` holds it.
- **What a page serves from the contract is checked first.** The art route serves the SVG from the site's own address
  only if it is one whole document with nothing that runs, embeds, links or loads from elsewhere, with a policy that
  stops anything running if the address is opened directly.

## Documentation: NatSpec, as TSDoc

The contracts put the full documentation on the interface and use `@inheritdoc` on the implementation. The frontend
does the same with the same shape:

```ts
/**
 * @notice What it is or does, for someone who has not read the code. One sentence.
 * @dev Why it is this way: the decisions, numbered when there are several. (1) ... (2) ...
 * @param name - What it is and what is allowed.
 * @returns What comes back, and when it does not.
 */
```

- `@notice` and `@dev` are declared in `tsdoc.json`; `@param` needs the hyphen (TSDoc), and no dotted names, so a
  component's props go in one `@param props - ...`.
- Types and interfaces carry the documentation of what they are; a hook or function that implements one points at
  it with `{@inheritDoc}`.
- Sections of a long file use the contracts' banner:
  `/* ///// NAME ///// */`.
- Comments say **why**, as in the contracts ("check the cap before building the request ID, to save gas"), not what.
- Errors get one catalogue. When the contract's custom errors are mapped to sentences, the map is typed
  `satisfies Record<ErrorName, ...>` against the ABI, so a new contract error breaks the build until it has words.
- `eslint-plugin-tsdoc` checks the syntax (`pnpm lint`).

## Patterns from kam-frontend worth keeping

- **One hook per contract function**, each guarded by a context check, in `features/<flow>/hooks`.
- **Pure, ordered status resolvers**: `resolveXStatus(inputs) -> status` is a chain of checks where the first that
  holds wins, as a contract's guards are, with the order tested. `core` already works this way (`revealPhase`,
  `mintGate`).
- **Central query keys** and stale/refetch constants.
- **Test ids in one file**, and e2e that reuses the same status-to-text functions as the UI.

## Not to copy

- Every page a client component, with the server doing nothing but a cookie. Here the server reads the chain.
- A private key in a `NEXT_PUBLIC_` variable (it ships to the browser). End-to-end tests inject `window.ethereum`
  with `page.addInitScript`, so no test connector or key exists in the app.
- `catch { throw new Error("Error") }`. Revert reasons are the user's explanation.
- Wallet configuration spread over five overlapping files, and one chain's RPC variable used for another.
- Hand-copied ABIs (ours are generated from the Foundry artifacts and a test fails when they go stale), `any`
  (an error here), and lorem ipsum in shipped copy.

## Versions, and why they are pinned

- **wagmi 2.19, not 3**: RainbowKit 2.2.11 declares `wagmi ^2.9`.
- **TypeScript 5.9 across the workspace**: Next.js type-checks through TypeScript's JavaScript API, which 7.0 does
  not have. One version everywhere also keeps pnpm to a single copy of viem: with two TypeScript versions it built
  two, and types (and `instanceof BaseError` at runtime) stop matching across packages.
- **`serverExternalPackages`** for the Coinbase wallet SDK, see `docs/F1-notes.md`.

## Commands

```bash
pnpm dev:chain       # Anvil with both contracts; writes .env.local for the playground and for web
pnpm dev:web         # http://localhost:3000
pnpm build:web
pnpm lint:web        # ESLint: import order, no `any`, TSDoc syntax
pnpm --filter @proofkin/web format          # Prettier
pnpm --filter @proofkin/web typecheck
pnpm --filter @proofkin/web test            # unit, component and architecture tests
python3 tools/mutate.py web                 # plants bugs; every one must fail a test
```
