import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { analyze, commitHash, type PendingCommit, programHash } from "@proofkin/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SolveIsland } from "@/features/solve/SolveIsland";

import { fakeChain } from "../../../test/fakeChain";

// `publicEnv` is read once, when `@/config/env` is first imported, so the variables must exist before the imports run.
vi.hoisted(() => {
  const settings = {
    NEXT_PUBLIC_CHAIN: "baseSepolia",
    NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
});

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

// What the wallet library says, which a test changes; and the chain it talks to.
const world = vi.hoisted(() => ({
  chain: undefined as unknown as ReturnType<typeof import("../../../test/fakeChain").fakeChain>,
  account: { status: "disconnected" } as { status: string; address?: string; chainId?: number },
  connectedAs: undefined as string | undefined,
  switchChain: vi.fn(),
  refresh: vi.fn<(tx: string) => Promise<{ refreshed: boolean }>>(async () => ({ refreshed: true })),
  routerRefresh: vi.fn(),
}));

vi.mock("wagmi", () => ({
  usePublicClient: () => world.chain.publicClient,
  useAccount: () => world.account,
  useWalletClient: () => ({
    data: world.connectedAs ? world.chain.walletClient(world.connectedAs as `0x${string}`) : undefined,
  }),
  useSwitchChain: () => ({ switchChain: world.switchChain }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: world.routerRefresh }) }));
vi.mock("@/features/solve/refreshAfterMint", () => ({ refreshAfterMint: (tx: string) => world.refresh(tx) }));
vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button type="button">Connect Wallet</button> }));

const sort8 = readFileSync(resolve(process.cwd(), "../../fixtures/solutions/SORT8.pk"), "utf8");
const solution = analyze(sort8);
if (!solution.ok) throw new Error("fixture does not assemble");

const connect = (address = ALICE, chainId = 84532) => {
  world.account = { status: "connected", address, chainId };
  world.connectedAs = chainId === 84532 ? address : undefined;
};

const open = (puzzleId = 2) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // a new element each time: React skips an element it has already drawn, and the wallet library's hooks are plain
  // functions here, so a change in the wallet is shown by drawing the page again
  const tree = () => (
    <QueryClientProvider client={client}>
      <SolveIsland puzzleId={puzzleId} facts={{ price: "0.01 ETH", slotsLeft: 50, best: undefined }}>
        <p>The statement</p>
      </SolveIsland>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, again: () => view.rerender(tree()) };
};

const editor = () => screen.getByRole("textbox", { name: "Your program" }) as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const panel = () => within(screen.getByRole("region", { name: "Mint" }));

/** A valid, passing program, ready to commit. */
async function readyToCommit() {
  type(sort8);
  click("Run test");
  await screen.findByRole("img", { name: /drawn by the contract's renderer/ });
  await waitFor(() => expect(panel().getByRole("button", { name: "Commit solution" })).toBeEnabled());
}

describe("minting from the solve page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    world.chain = fakeChain({ contract: CONTRACT });
    world.account = { status: "disconnected" };
    world.connectedAs = undefined;
    world.switchChain.mockReset();
    world.refresh.mockClear();
    world.routerRefresh.mockClear();
  });
  afterEach(() => window.localStorage.clear());

  describe("before the commit", () => {
    it("offers the wallet's connect button when none is connected", () => {
      open();
      expect(panel().getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
    });

    it("says the local test comes first, with a wallet connected", () => {
      connect();
      open();
      type(sort8);
      expect(panel().getByRole("button", { name: "Commit solution" })).toBeDisabled();
      expect(panel().getByText("Run the local test first.")).toBeInTheDocument();
    });

    it("says it is connecting while a reconnecting wallet has not arrived, rather than asking to connect one", () => {
      world.account = { status: "reconnecting" };
      open();
      type(sort8);
      click("Run test");
      expect(panel().getByText("Connecting to your wallet…")).toBeInTheDocument();
      expect(panel().queryByRole("button", { name: "Connect Wallet" })).not.toBeInTheDocument();
    });

    it("offers to switch network for a wallet on another chain, and asks the wallet to switch to this one", () => {
      connect(ALICE, 1);
      open();
      click("Switch network");
      expect(world.switchChain).toHaveBeenCalledWith({ chainId: 84532 });
    });

    it("will not commit a program the contract has already seen, and says so", async () => {
      connect();
      world.chain.markMinted(programHash(solution.hex));
      open();
      type(sort8);
      click("Run test");
      await waitFor(() => expect(panel().getByText("This exact program has already been minted.")).toBeInTheDocument());
      expect(panel().getByRole("button", { name: "Commit solution" })).toBeDisabled();
    });

    it("lets a passing program be committed once the chain has been asked about it", async () => {
      connect();
      open();
      await readyToCommit();
    });
  });

  describe("a whole mint", () => {
    it("commits, waits for three blocks, reveals, and ends on the token, with the site told to be fresh", async () => {
      connect();
      open();
      await readyToCommit();

      click("Commit solution");
      expect(await panel().findByText(/^Committed in block \d+\.$/)).toBeInTheDocument();
      expect(await panel().findByText(/\d+ more blocks? to go/)).toBeInTheDocument();
      // the salt was saved, and can be seen
      const saved = window.localStorage.getItem(
        Object.keys(window.localStorage).find((key) => key.startsWith("proofkin:pending:v1:"))!,
      )!;
      expect(panel().getByText(JSON.parse(saved).salt)).toBeInTheDocument();

      act(() => world.chain.mine(3));
      const reveal = await panel().findByRole("button", { name: "Reveal and mint for 0.01 ETH" });
      fireEvent.click(reveal);

      expect(await panel().findByText("Token #1 is yours")).toBeInTheDocument();
      expect(panel().getByRole("link", { name: "View token #1" })).toHaveAttribute("href", "/token/1");
      await waitFor(() => expect(world.refresh).toHaveBeenCalledOnce());
      await waitFor(() => expect(world.routerRefresh).toHaveBeenCalled());
    });

    it("saves the commit before it is sent, with the account that will have to reveal it", async () => {
      connect();
      open();
      await readyToCommit();
      click("Commit solution");
      await panel().findByText(/^Committed in block/);
      const key = Object.keys(window.localStorage).find((k) => k.startsWith("proofkin:pending:v1:"))!;
      const pending = JSON.parse(window.localStorage.getItem(key)!) as PendingCommit;
      expect(pending).toMatchObject({
        account: ALICE,
        program: solution.hex,
        puzzleId: 2,
        nodeCount: 46,
        status: "committed",
      });
      expect(pending.hash).toBe(commitHash(solution.hex, ALICE, pending.salt));
    });

    it("keeps the salt, and offers to send again, when the wallet refuses the commit", async () => {
      connect();
      open();
      await readyToCommit();
      world.chain.failures.refuseNext = true;
      click("Commit solution");
      expect(await panel().findByRole("alert")).toHaveTextContent("You rejected the request in your wallet.");
      expect(panel().getByRole("button", { name: "Send commit" })).toBeEnabled();
      expect(Object.keys(window.localStorage).some((key) => key.startsWith("proofkin:pending:v1:"))).toBe(true);

      click("Send commit");
      expect(await panel().findByText(/^Committed in block/)).toBeInTheDocument();
      expect(panel().queryByRole("alert")).not.toBeInTheDocument();
    });

    it("does not invite a reveal after the window has closed", async () => {
      connect();
      open();
      await readyToCommit();
      click("Commit solution");
      await panel().findByText(/^Committed in block/);
      act(() => world.chain.mine(300));
      expect(await panel().findByRole("alert")).toHaveTextContent("The 250-block window for this commit has closed.");
      expect(panel().queryByRole("button", { name: /Reveal and mint/ })).not.toBeInTheDocument();
      fireEvent.click(panel().getByRole("button", { name: "Start over" }));
      expect(panel().getByRole("button", { name: "Commit solution" })).toBeInTheDocument();
    });

    it("closes the reveal for another account, and names the one to switch to", async () => {
      connect();
      const view = open();
      await readyToCommit();
      click("Commit solution");
      await panel().findByText(/^Committed in block/);
      act(() => world.chain.mine(3));
      await panel().findByRole("button", { name: /Reveal and mint/ });

      connect(BOB); // the visitor switches account in the wallet
      view.again();
      await waitFor(() => expect(panel().getByRole("button", { name: /Reveal and mint/ })).toBeDisabled());
      expect(panel().getByText(/Switch your wallet to 0x7099…79C8/)).toBeInTheDocument();
    });
  });

  describe("coming back", () => {
    const saved = (over: Partial<PendingCommit> = {}): PendingCommit => ({
      version: 1,
      chainId: 84532,
      contract: CONTRACT,
      account: ALICE,
      program: solution.hex,
      salt: `0x${"ab".repeat(32)}`,
      hash: commitHash(solution.hex, ALICE, `0x${"ab".repeat(32)}`),
      puzzleId: 2,
      nodeCount: 46,
      status: "committed",
      commitBlock: 1001,
      createdAt: 1,
      ...over,
    });
    const store = (pending: PendingCommit) =>
      window.localStorage.setItem(`proofkin:pending:v1:${pending.hash}`, JSON.stringify(pending));

    it("lists a commit a closed tab left behind, and continues it where it was", async () => {
      connect();
      const pending = saved();
      store(pending);
      world.chain.mine(10); // the chain has moved on while the tab was closed
      open();
      expect(panel().getByText("SORT8, 46 nodes: committed")).toBeInTheDocument();

      click("Continue");
      expect(await panel().findByRole("button", { name: "Reveal and mint for 0.01 ETH" })).toBeInTheDocument();
      expect(panel().queryByRole("heading", { name: "Unfinished mints" })).not.toBeInTheDocument();
    });

    it("picks up a commit that landed while the tab was closed but was never recorded as sent", async () => {
      connect();
      const pending = saved({ status: "prepared", commitBlock: undefined });
      store(pending);
      // the chain has the commit, which the browser does not know
      await world.chain.walletClient(ALICE).writeContract({ functionName: "commit", args: [pending.hash] });
      world.chain.mine(5);
      open();
      click("Continue");
      expect(await panel().findByRole("button", { name: /Reveal and mint/ })).toBeInTheDocument();
    });

    it("says a commit left behind past its window is dead, since the chain has moved on while the tab was closed", async () => {
      connect();
      store(saved());
      world.chain.mine(400);
      open();
      expect(await panel().findByText("SORT8, 46 nodes: committed, window closed")).toBeInTheDocument();
      expect(panel().queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    });

    it("does not show another account's commits", () => {
      connect(BOB);
      store(saved());
      open();
      expect(panel().queryByRole("heading", { name: "Unfinished mints" })).not.toBeInTheDocument();
    });

    it("forgets a commit when asked and sure, which deletes its salt", () => {
      connect();
      const pending = saved();
      store(pending);
      vi.spyOn(window, "confirm").mockReturnValue(true);
      open();
      click("Forget");
      expect(window.localStorage.getItem(`proofkin:pending:v1:${pending.hash}`)).toBeNull();
      expect(panel().queryByRole("heading", { name: "Unfinished mints" })).not.toBeInTheDocument();
    });
  });
});
