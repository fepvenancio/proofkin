import { type PendingCommit } from "@proofkin/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { type Hex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MintPanel, type MintPanelProps } from "@/features/solve/MintPanel";

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const SALT: Hex = `0x${"ab".repeat(32)}`;

const pending = (over: Partial<PendingCommit> = {}): PendingCommit => ({
  version: 1,
  chainId: 84532,
  contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  account: ALICE,
  program: "0x010203",
  salt: SALT,
  hash: `0x${"22".repeat(32)}`,
  puzzleId: 2,
  nodeCount: 46,
  status: "prepared",
  createdAt: 1,
  ...over,
});
const committed = (over: Partial<PendingCommit> = {}) => pending({ status: "committed", commitBlock: 100, ...over });

const props = (over: Partial<MintPanelProps> = {}): MintPanelProps => ({
  puzzleId: 2,
  price: "0.01 ETH",
  blockTimeSeconds: 2,
  wallet: { status: "connected", network: "right", switchNetwork: vi.fn() },
  gate: { enabled: true },
  step: { step: "idle" },
  active: undefined,
  stepGate: { enabled: true },
  busy: false,
  notice: undefined,
  persistent: true,
  unfinished: [],
  connect: <button type="button">Connect Wallet</button>,
  onCommit: vi.fn(),
  onSendPrepared: vi.fn(),
  onReveal: vi.fn(),
  onResume: vi.fn(),
  onForget: vi.fn(),
  onLeave: vi.fn(),
  ...over,
});

const show = (over: Partial<MintPanelProps> = {}) => {
  const p = props(over);
  return { p, ...render(<MintPanel {...p} />) };
};

describe("MintPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is named for what it does, and says a mint is two transactions and how long the wait is", () => {
    show();
    expect(screen.getByRole("heading", { name: "Mint" })).toBeInTheDocument();
    expect(
      screen.getByText("Minting takes two transactions: a commit, then a reveal at least 3 blocks later (6 s)."),
    ).toBeInTheDocument();
  });

  describe("before a mint", () => {
    it("offers to connect a wallet when there is none, in the place the commit button will be", () => {
      show({
        wallet: { status: "none", network: "wrong", switchNetwork: vi.fn() },
        gate: { enabled: false, reason: "Connect a wallet to mint." },
      });
      expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Commit solution" })).not.toBeInTheDocument();
    });

    it("commits when the gate is open", () => {
      const { p } = show();
      fireEvent.click(screen.getByRole("button", { name: "Commit solution" }));
      expect(p.onCommit).toHaveBeenCalledOnce();
    });

    it("is closed, with the gate's reason beside the button, when the gate says no", () => {
      show({ gate: { enabled: false, reason: "Run the local test first." } });
      expect(screen.getByRole("button", { name: "Commit solution" })).toBeDisabled();
      expect(screen.getByText("Run the local test first.")).toBeInTheDocument();
    });

    it("says it is working, and cannot be clicked again, while a transaction is being sent", () => {
      show({ busy: true, gate: { enabled: false, reason: "A mint is in progress, please wait." } });
      expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    });

    it("offers to switch network when the wallet is on another, which is a thing to do and not only a reason", () => {
      const { p } = show({
        wallet: { status: "connected", network: "wrong", switchNetwork: vi.fn() },
        gate: { enabled: false, reason: "Switch your wallet to the right network." },
      });
      fireEvent.click(screen.getByRole("button", { name: "Switch network" }));
      expect(p.wallet.switchNetwork).toHaveBeenCalledOnce();
    });

    it("does not offer to switch when the network is right", () => {
      show();
      expect(screen.queryByRole("button", { name: "Switch network" })).not.toBeInTheDocument();
    });
  });

  describe("a commit in flight", () => {
    it("shows the salt as soon as it is saved, and what losing it means", () => {
      show({ active: pending(), step: { step: "unsent" } });
      expect(screen.getByText(SALT)).toBeInTheDocument();
      expect(screen.getByText(/Without this salt the commit can never be revealed\./)).toBeInTheDocument();
      expect(screen.getByText(/Kept in this browser\./)).toBeInTheDocument();
    });

    it("tells the player to copy the salt when the browser would not keep it", () => {
      show({ active: pending(), step: { step: "unsent" }, persistent: false });
      expect(screen.getByText(/This browser would not let the page store it, so copy it now\./)).toBeInTheDocument();
    });

    it("copies the salt", async () => {
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      show({ active: pending(), step: { step: "unsent" } });
      fireEvent.click(screen.getByRole("button", { name: "Copy salt" }));
      expect(writeText).toHaveBeenCalledWith(SALT);
      expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
      vi.unstubAllGlobals();
    });

    it("does not call a new commit's salt copied because the last one's was", async () => {
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      const first = props({ active: pending(), step: { step: "unsent" } });
      const { rerender } = render(<MintPanel {...first} />);
      fireEvent.click(screen.getByRole("button", { name: "Copy salt" }));
      await screen.findByRole("button", { name: "Copied" });

      // the same panel, now showing another commit, as when the player starts over after a window closed
      const otherSalt: Hex = `0x${"cd".repeat(32)}`;
      rerender(
        <MintPanel
          {...props({ active: pending({ salt: otherSalt, hash: `0x${"33".repeat(32)}` }), step: { step: "unsent" } })}
        />,
      );
      expect(screen.getByRole("button", { name: "Copy salt" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
      vi.unstubAllGlobals();
    });

    it("sends a commit that was saved but not sent", () => {
      const { p } = show({ active: pending(), step: { step: "unsent" } });
      fireEvent.click(screen.getByRole("button", { name: "Send commit" }));
      expect(p.onSendPrepared).toHaveBeenCalledOnce();
    });

    it("asks for the wallet's confirmation, not another click, while the commit is being sent", () => {
      show({ active: pending(), step: { step: "unsent" }, busy: true });
      expect(screen.getByText("Confirm the transaction in your wallet…")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Send commit" })).not.toBeInTheDocument();
    });

    it("says in which block the commit landed", () => {
      show({ active: committed(), step: { step: "waiting", blocksUntilReady: 2 } });
      expect(screen.getByText("Committed in block 100.")).toBeInTheDocument();
    });

    it("counts the blocks still to wait, and what that is in time", () => {
      show({ active: committed(), step: { step: "waiting", blocksUntilReady: 2 } });
      expect(screen.getByText("2 more blocks to go (4 s).")).toBeInTheDocument();
    });

    it("says 'block' for one", () => {
      show({ active: committed(), step: { step: "waiting", blocksUntilReady: 1 } });
      expect(screen.getByText("1 more block to go (2 s).")).toBeInTheDocument();
    });

    it("says it is checking the chain while there is no block yet to measure against", () => {
      show({ active: committed(), step: { step: "checking" } });
      expect(screen.getByText("Checking the chain…")).toBeInTheDocument();
    });

    it("reveals, for the price, when the commit is old enough", () => {
      const { p } = show({ active: committed(), step: { step: "ready", blocksLeft: 246 } });
      fireEvent.click(screen.getByRole("button", { name: "Reveal and mint for 0.01 ETH" }));
      expect(p.onReveal).toHaveBeenCalledOnce();
      expect(screen.getByText("Send it within 246 blocks (about 8 min).")).toBeInTheDocument();
    });

    it("says to send now on the last block a reveal can land in", () => {
      show({ active: committed(), step: { step: "ready", blocksLeft: 0 } });
      expect(screen.getByText("Send it now: this is the last block it can land in.")).toBeInTheDocument();
    });

    it("does not offer a reveal that is certain to be refused: the window has closed", () => {
      const { p } = show({ active: committed(), step: { step: "expired" } });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The 250-block window for this commit has closed. Commit again with a new salt.",
      );
      expect(screen.queryByRole("button", { name: /Reveal and mint/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Start over" }));
      expect(p.onLeave).toHaveBeenCalledOnce();
    });

    it("ends on the token, with a link to it and a way to mint another", () => {
      const { p } = show({
        active: committed({ status: "revealed", tokenId: 7 }),
        step: { step: "revealed", tokenId: 7 },
      });
      expect(screen.getByText("Token #7 is yours")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View token #7" })).toHaveAttribute("href", "/token/7");
      fireEvent.click(screen.getByRole("button", { name: "Mint another" }));
      expect(p.onLeave).toHaveBeenCalledOnce();
    });

    it("ends on the gallery when the receipt carried no token id to link to", () => {
      show({ active: committed({ status: "revealed" }), step: { step: "revealed", tokenId: undefined } });
      expect(screen.getByRole("link", { name: "See it in the gallery" })).toHaveAttribute("href", "/gallery");
    });

    it("lists the steps in order, and marks the one the mint is at", () => {
      show({ active: committed(), step: { step: "waiting", blocksUntilReady: 2 } });
      const steps = within(screen.getByRole("list", { name: "Steps of this mint" })).getAllByRole("listitem");
      expect(steps.map((step) => step.getAttribute("data-state"))).toEqual(["done", "done", "current", "todo"]);
      expect(steps[2]).toHaveAttribute("aria-current", "step");
      expect(steps[0]).not.toHaveAttribute("aria-current");
    });

    it("marks every step done once the token is minted", () => {
      show({ active: committed({ status: "revealed", tokenId: 7 }), step: { step: "revealed", tokenId: 7 } });
      const steps = within(screen.getByRole("list", { name: "Steps of this mint" })).getAllByRole("listitem");
      expect(steps.map((step) => step.getAttribute("data-state"))).toEqual(["done", "done", "done", "done", "done"]);
    });

    it("closes the next step, and says why, when the gate does: the wrong account, say", () => {
      show({
        active: committed(),
        step: { step: "ready", blocksLeft: 100 },
        stepGate: {
          enabled: false,
          reason: "Switch your wallet to 0x7099…79C8 to continue this mint: the commit belongs to that account.",
        },
      });
      expect(screen.getByRole("button", { name: /Reveal and mint/ })).toBeDisabled();
      expect(screen.getByText(/Switch your wallet to 0x7099…79C8/)).toBeInTheDocument();
    });

    it("keeps the same button through a block tick, so a click that spans a block is not lost", () => {
      const p = props({ active: committed(), step: { step: "ready", blocksLeft: 246 } });
      const { rerender } = render(<MintPanel {...p} />);
      const before = screen.getByRole("button", { name: "Reveal and mint for 0.01 ETH" });
      rerender(<MintPanel {...p} step={{ step: "ready", blocksLeft: 245 }} />);
      expect(screen.getByRole("button", { name: "Reveal and mint for 0.01 ETH" })).toBe(before);
      expect(screen.getByText("Send it within 245 blocks (about 8 min).")).toBeInTheDocument();
    });
  });

  describe("notices", () => {
    it("shows a refusal, in plain words, as an alert", () => {
      show({ notice: "You rejected the request in your wallet." });
      expect(screen.getByRole("alert")).toHaveTextContent("You rejected the request in your wallet.");
    });

    it("shows no alert when there is nothing to say", () => {
      show();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("unfinished mints", () => {
    const here = pending({ hash: `0x${"01".repeat(32)}`, puzzleId: 2, nodeCount: 46 });
    const elsewhere = committed({ hash: `0x${"02".repeat(32)}`, puzzleId: 3, nodeCount: 26 });

    it("is not shown when there are none", () => {
      show();
      expect(screen.queryByRole("heading", { name: "Unfinished mints" })).not.toBeInTheDocument();
    });

    it("lists what was left half done, and in which state", () => {
      show({ unfinished: [here, elsewhere] });
      const items = within(screen.getByRole("list", { name: "Unfinished mints" })).getAllByRole("listitem");
      expect(items[0]).toHaveTextContent("SORT8, 46 nodes: saved, not yet sent");
      expect(items[1]).toHaveTextContent("GRID_PATH, 26 nodes: committed");
    });

    it("continues one of this puzzle's", () => {
      const { p } = show({ unfinished: [here] });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(p.onResume).toHaveBeenCalledWith(here);
    });

    it("sends the player to another puzzle's page to continue one of that puzzle's, where the program is", () => {
      show({ unfinished: [elsewhere] });
      expect(screen.getByRole("link", { name: "Continue on GRID_PATH" })).toHaveAttribute(
        "href",
        "/puzzles/grid-path/solve",
      );
      expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    });

    it("says a commit whose window has closed is dead, and offers only to forget it", () => {
      const old = committed({ hash: `0x${"03".repeat(32)}`, commitBlock: 100 });
      show({ unfinished: [old], latestBlock: 400 });
      expect(screen.getByText("SORT8, 46 nodes: committed, window closed")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Forget" })).toBeInTheDocument();
    });

    it("also says so for another puzzle's, and does not send the player there to find a dead commit", () => {
      const old = committed({ hash: `0x${"04".repeat(32)}`, puzzleId: 3, commitBlock: 100 });
      show({ unfinished: [old], latestBlock: 400 });
      expect(screen.getByText("GRID_PATH, 46 nodes: committed, window closed")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Continue on/ })).not.toBeInTheDocument();
    });

    it("still offers to continue a commit inside its window", () => {
      const live = committed({ hash: `0x${"05".repeat(32)}`, commitBlock: 100 });
      show({ unfinished: [live], latestBlock: 349 });
      expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    });

    it("does not guess before it knows the block, and offers to continue", () => {
      const live = committed({ hash: `0x${"06".repeat(32)}`, commitBlock: 100 });
      show({ unfinished: [live], latestBlock: undefined });
      expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    });

    it("never calls a commit that was saved but not sent dead: it has no window yet", () => {
      show({ unfinished: [pending({ hash: `0x${"07".repeat(32)}` })], latestBlock: 100_000 });
      expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    });

    it("asks before it forgets one, since that deletes the salt, and does nothing if you say no", () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { p } = show({ unfinished: [here] });
      fireEvent.click(screen.getByRole("button", { name: "Forget" }));
      expect(confirm).toHaveBeenCalledOnce();
      expect(p.onForget).not.toHaveBeenCalled();
    });

    it("forgets it when you say yes", () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const { p } = show({ unfinished: [here] });
      fireEvent.click(screen.getByRole("button", { name: "Forget" }));
      expect(p.onForget).toHaveBeenCalledWith(here);
    });
  });
});
