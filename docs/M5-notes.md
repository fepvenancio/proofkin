# Milestone 5 notes: launch

**Status: prepared and rehearsed on a throwaway local chain. Nothing has been deployed anywhere.** The Base
Sepolia run needs things only you can provide (next section). The mainnet deploy and `lockRenderer()` come
after it, and after the art review.

## What I need from you

For the **Base Sepolia** run:

1. **An owner address.** Whoever controls `setRenderer`, `lockRenderer` and `withdraw`. The script refuses to
   guess: it will not deploy unless `PROOFKIN_OWNER` names one. On a testnet it can be your deployer.
2. **A deployer you sign with, without handing me the key.** The script signs with whatever `forge` is given:
   a keystore (`cast wallet import proofkin-deployer --interactive`; you type the key, nothing is stored in
   the repo) or a hardware wallet (`--ledger`). I never need the key, only the address.
3. **Funds.** Deploying costs about 0.0001 ETH (8.96M gas at the current 0.011 gwei maximum fee, from a
   read-only simulation on the real Base Sepolia). The dry run mints six tokens at 0.01 ETH each, so
   **at least 0.07 test ETH** on the dry-run wallet. The 0.06 ETH of mint fees stays in the contract and the
   owner takes it back with `withdraw()`, so the real cost is gas.
4. **A second, throwaway wallet for the dry run.** `pnpm launch:dry-run` signs with a raw private key in the
   `PRIVATE_KEY` environment variable of your shell, so keep it separate from the owner's keystore or
   hardware wallet and use it for nothing else.
5. **An RPC URL.** `https://sepolia.base.org` works and is rate-limited; a provider URL is better.
6. **Which explorer should show "verified".** I could not test any of this without a real deployment:
   - **Blockscout** (`base-sepolia.blockscout.com`): needs no API key. Reachable from here.
   - **Sourcify**: needs no key. It lists both Base networks as supported.
   - **Basescan**: Etherscan's own chain list marks Base mainnet and Base Sepolia "Paid Plan required", so a
     free Etherscan key may be refused. If Basescan is what you want, you need a plan that covers Base.

The QUORUM7 and MEDIAN5 holes described under "Found afterwards" in `docs/M3.5-notes.md` are closed
(`docs/M3.6-notes.md`), so a Base Sepolia deployment now uses the contracts as they would launch, unless you decide
on royalties or a different name below.

Before **mainnet** (nothing to do yet, but decide early, because the contracts cannot change once deployed):

- **ERC-2981 royalties** (PLAN.md §11, still open). Adding them means changing `Proofkin.sol`, which would
  mean repeating the tests and the mutation runs. It cannot be added after deployment.
- **The final name.** `name()` is the constant `"Proofkin"` and `symbol()` is `"PKIN"`, both in `Proofkin.sol`.
  The description text lives in the renderer, which can still be replaced until `lockRenderer()`.
- **The art review** across all 6 palettes at the smallest and largest node counts (PLAN.md §12). Yours to do;
  I can produce the review set if you want it.
- **The checklist items only you can answer** (PLAN.md §12): the employer's outside-activity and IP policy,
  and a hardware wallet for the mainnet deploy key.
- **A Basescan or Blockscout route** for mainnet verification.

## What is here

- `contracts/script/Deploy.s.sol`: deploys the renderer, then the collection with the owner you name and the
  launch price (0.01 ETH, `MINT_PRICE`, immutable in the contract). It deploys to a local chain, Base Sepolia
  or Base mainnet and **refuses any other chain**, so a wrong RPC URL cannot put it somewhere unintended. Base
  mainnet also needs `PROOFKIN_CONFIRM_MAINNET=yes`; any other value, `true` included, is refused. It prints
  the lines the playground reads (`VITE_CHAIN`, `VITE_PROOFKIN`, `VITE_RENDERER`, `VITE_DEPLOY_BLOCK`, the
  last a block at or before the deployment).
- `pnpm launch:dry-run`: mints each puzzle's fixture solution through the playground's own mint flow, reads
  every token back through the renderer, and checks the program, node count and puzzle on each. It checks the
  wallet can pay for the whole run before it sends anything, skips what is already minted, and refuses Base
  mainnet. It reads the same `VITE_*` settings as the page (including `packages/playground/.env.local`).
- Tests: `Deploy.t.sol` (10), `dryRun.test.ts` (7). Mutation: 14 mutants of the script in a new `deploy` suite
  and 5 of the dry run in the `playground` suite; all 19 are killed.

## The Base Sepolia run, step by step

```bash
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
export PROOFKIN_OWNER=0x...            # step 1 above

# a. Rehearse without sending anything: prints the deployment, the config block and the gas estimate.
forge script contracts/script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --sender 0x<deployer address>

# b. Deploy. Add --ledger instead of --account for a hardware wallet.
forge script contracts/script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL \
  --account proofkin-deployer --sender 0x<deployer address> --broadcast

# c. Verify (Blockscout shown; nothing here was tested, because it needs a real deployment).
forge verify-contract 0x<renderer> contracts/src/Renderer.sol:Renderer --chain base-sepolia \
  --verifier blockscout --verifier-url https://base-sepolia.blockscout.com/api/
forge verify-contract 0x<proofkin> contracts/src/Proofkin.sol:Proofkin --chain base-sepolia \
  --verifier blockscout --verifier-url https://base-sepolia.blockscout.com/api/ \
  --constructor-args $(cast abi-encode "constructor(address,address,uint256)" $PROOFKIN_OWNER 0x<renderer> 10000000000000000)
```

d. Paste the block the script printed into `packages/playground/.env.local` and add
   `VITE_RPC_URL=$BASE_SEPOLIA_RPC_URL`. The same file configures the page (`pnpm dev:playground`).

```bash
# e. The dry run: one mint per puzzle. The key stays in your shell.
export PRIVATE_KEY=0x...               # the throwaway testnet wallet, never one with real funds
pnpm launch:dry-run

# f. Take the fees back (this is also the withdraw check).
cast send 0x<proofkin> "withdraw()" --account proofkin-deployer --rpc-url $BASE_SEPOLIA_RPC_URL
```

Record the two addresses, the deploy block and the transaction hashes somewhere that is kept: `broadcast/`
(where forge writes them) is git-ignored.

The acceptance line for this step (PLAN.md §10): deployed and verified on Base Sepolia, and a dry-run mint
for each puzzle. For the later steps, `lockRenderer()` is one-way:

```bash
cast call 0x<proofkin> "rendererLocked()(bool)" --rpc-url $RPC     # false
cast send 0x<proofkin> "lockRenderer()" --ledger --rpc-url $RPC    # only the owner; cannot be undone
cast call 0x<proofkin> "rendererLocked()(bool)" --rpc-url $RPC     # true
```

## What the rehearsal showed

On a throwaway Anvil chain, with Anvil's public test accounts and the owner deliberately not the sender:

- `forge script ... --broadcast --unlocked` sent both deployments. Read back from the chain: the owner is
  the named account, `renderer()` is the new renderer, the price is 10^16 wei, the renderer is not locked,
  the supply is 0, and the code sizes match the build (Proofkin 14,003 bytes, Renderer 17,521; the limit is 24,576).
- Deployment used 7,000,906 gas (renderer 3,842,345, collection 3,158,561).
- Through `pnpm launch:dry-run`, reading the printed block from `.env.local`: six tokens minted, reveals at
  700,270 (QUORUM7), 547,596 (MEDIAN5), 1,167,212 (SORT8), 1,004,100 (GRID_PATH), 1,197,248 (KNAPSACK3) and
  571,844 (FAIR_SPLIT4) gas, each read back through the renderer. The contract held 0.06 ETH.
- A stranger's `withdraw()` and `lockRenderer()` reverted `Unauthorized`. The owner's `withdraw()` returned
  the 0.06 ETH. `lockRenderer()` set the flag, `setRenderer` then reverted `RendererLocked`,
  and `tokenURI` kept working.
- The same script, simulated read-only against the real Base Sepolia (nothing sent, no key): chain id 84532
  recognised, 8,962,802 gas estimated (9,101,177 on the final contracts, local chain).

## Not verified

- **Verification on any explorer**, and so whether a free explorer key is enough anywhere.
- **Signing with a keystore or a hardware wallet**: the rehearsal used Anvil's unlocked accounts.
- **A real broadcast to Base Sepolia or Base**, including how long the public RPC takes and its rate limits.
- **Base's L1 data fee.** Forge's estimate does not include it. On Sepolia it should be negligible; on mainnet
  it grows with Ethereum's gas price and with calldata (the two contracts are about 31 KB of initcode), so
  price the mainnet deployment with your wallet or `cast` before sending it.
- **The two `vm.startBroadcast()` calls**: in a test they send nothing, so only the rehearsal shows the
  script really sends its transactions (it did, on the local chain).
- **The tests assume `PROOFKIN_OWNER` and `PROOFKIN_CONFIRM_MAINNET` are unset** in the shell running
  `forge test`; one test sets them for itself, in one function, because the environment belongs to the whole process.
