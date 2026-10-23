# F1 notes: `@proofkin/core` and the `packages/web` scaffold

The first step of the frontend plan: share the framework-free code, and stand up a Next.js app that builds, renders
from the chain on the server, and shows a wallet button. No pages beyond a placeholder: those are F2 onwards. The
conventions are in [FRONTEND.md](FRONTEND.md).

## What changed

- **`packages/core` (new).** The playground's framework-free modules moved there with their tests, by `git mv`, and
  the playground now imports them. `@proofkin/core` is browser-safe (no Node APIs); `@proofkin/core/testing` holds
  the Anvil harness, the test kit and the shared Vitest global setup. 149 tests (145 moved, 4 new).
  - `parseConfig(env, prefix = "VITE_")`: the same settings under any prefix, so the Next.js app reads
    `NEXT_PUBLIC_*`. Problems name the variable under the prefix it was given.
  - `NO_SOLUTION_YET` names the contract's "255 until the first solve" instead of repeating the number.
  - `Wallet` (a type) moved with the mint flow; the EIP-1193 connection code stayed in the playground.
- **`packages/playground`**: UI, the wallet connection, `dev-chain` and the dry run. 15 tests. It builds to the same
  106 KB as before. `pnpm dev:chain` now also writes `packages/web/.env.local`.
- **`packages/web` (new)**: Next 16, React 19, wagmi 2.19, RainbowKit 2.2, TanStack Query, Tailwind 4. 47 tests.
  - `config/env.ts` (the one place the environment is read), `config/wagmi.ts` (one factory, cookie storage, no
    connectors on the server, WalletConnect only with a project id; **a new configuration for every server request,
    one for the browser**), `chain/server.ts` (server-only client), `chain/collection.ts` (the read as a value, the
    cause in the server log), `app/layout.tsx` (reads the wagmi cookie; shows the problems if the deployment is not
    configured), `app/providers.tsx`, and a placeholder home page that reads the collection on the server.
  - Lint (ESLint 9 with kam's import order, `any` an error, TSDoc syntax), Prettier, `tsdoc.json`.
  - `test/architecture.test.ts`: the server/client rules as tests, with the checker proved on synthetic files first.
- `Deploy.s.sol` now prints the `NEXT_PUBLIC_*` block as well as the `VITE_*` one.
- `tools/mutate.py`: a `core` suite (the 26 mutants that targeted the moved files), a `web` suite (26 mutants,
  five of them aimed at the architecture checker), and the playground suite keeps its 6.

## The version spike

| Question | Answer |
|---|---|
| Does Next 16.4.3 build with wagmi 2.19.5 and RainbowKit 2.2.11 on React 19? | Yes, on Turbopack, **after one fix** |
| The fix | `serverExternalPackages: ["@coinbase/cdp-sdk", "@base-org/account"]`. RainbowKit's entry pulls its Coinbase connector, which pulls the CDP SDK, which has a lazy `import("@x402/svm/exact/client")` for an optional package that is not installed. Turbopack treats it as a hard error. Server-side it now loads at runtime (the page renders) |
| Does TypeScript 7 work? | No: it has no JavaScript API, which Next's build type-check uses. Web is on 5.9, and so is the rest of the workspace |
| Why the whole workspace? | With two TypeScript versions pnpm built two copies of viem; core's types did not match web's, and `instanceof BaseError` would have failed between wagmi's errors and core's `friendlyError`. All four packages now link one viem |
| wagmi 3? | Not yet usable: RainbowKit 2.2.11 declares `wagmi ^2.9` |

Seen and left alone: a pnpm peer warning for `use-sync-external-store@1.2.0` (React ≤ 18) under WalletConnect's
AppKit; a Node 26 `localStorage` ExperimentalWarning on the server, from a wallet library; a CSS preload hint in dev.

## Checked

- `next build` with no environment and with a local one; `next start` answers 200 with the collection read from the
  chain on the server (Foundry, 0.01 ETH, 0 of 300, six puzzles); `next dev` has no hydration errors.
- In a browser: the Connect button appears after hydration, RainbowKit's modal lists Browser Wallet and Coinbase
  Wallet (and no WalletConnect without a project id), and the `wagmi.store` cookie is set.
- A deployment with a bad environment shows the list of problems instead of an error page.
- Every package typechecks and passes under TypeScript 5.9; lint, Prettier and the architecture rules pass.

## Changes after review

Two fixes from a review of the first F1 cut, each test-first (web: 34 tests became 47, mutants 15 became 26).

- **A wagmi configuration per server request.** `getWagmiConfig` kept one configuration for the whole server process.
  A server never counts as hydrated, so each request's cookie overwrote the connection state of that one
  configuration: a visitor's render could read the wallet of whoever rendered after them. Shown with the real wagmi
  before the change, and pinned by `wagmi.server.test.tsx`, which renders two requests through `WagmiProvider` and
  checks that each configuration still holds its own wallet. The browser keeps one configuration.
- **An honest message, and the cause in the log.** The page named `app.rpcUrl` when the read failed, but the server
  reads through `RPC_URL` when it is set, so it could name a node it never asked; and every failure, down to a wrong
  contract address, read as "did not answer". The page now says `Could not reach <chain> right now…`
  (`CollectionUnavailable`), and `tryReadCollection` logs the cause on the server. It logs viem's `shortMessage` and
  `details` rather than its `message`, which repeats the request's URL and so the provider key; a test builds a real
  viem error and checks the key is absent.
- Checked through a built `next start` against an unreachable node behind a keyed `RPC_URL`: HTTP 200, the new
  sentence in the HTML, and neither the page nor the server log contains the key.

Not covered by a test: that `Providers` holds the configuration in `useState` (the browser's singleton makes it
behave the same there), and the fix-1 race through two concurrent Next.js requests (shown with wagmi's own `hydrate`
and `WagmiProvider`, not through the framework). Nothing in the F1 page renders from the account yet, so no symptom
was visible.

## Not done, on purpose

- **No design.** Colours, type and the per-puzzle hue come with the design pass before F2.
- **Connecting a wallet end to end.** The modal opens, but a connection needs an injected provider before the page
  loads, which is what the F5 Playwright run does with `addInitScript`.
- **WalletConnect**, with no project id yet. **Base mainnet** reads. **Query keys**, **features/**: when first used.
- **Git hooks.** kam-frontend runs lint-staged and `tsc` on commit through Husky; that changes everyone's commits,
  so it is for you to switch on.
- A misconfigured deployment answers **HTTP 200** with the problem list, not 503: a layout cannot set a status.
  Worth a proxy or a health route before it matters.
- The vanilla playground stays until the new app reaches parity.
