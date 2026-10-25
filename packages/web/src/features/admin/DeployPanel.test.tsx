import { type PendingDeploy } from "@proofkin/core/launch";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeployPanel, type DeployPanelProps } from "@/features/admin/DeployPanel";

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const OWNER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const RENDERER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const PROOFKIN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const sepolia = { id: 84532, name: "Base Sepolia", explorer: "https://sepolia.basescan.org" };
const base = { id: 8453, name: "Base", explorer: "https://basescan.org" };

const record = (over: Partial<PendingDeploy> = {}): PendingDeploy => ({
  version: 1,
  chainId: 84532,
  account: ALICE,
  owner: OWNER,
  status: "prepared",
  createdAt: 1,
  ...over,
});

const props = (over: Partial<DeployPanelProps> = {}): DeployPanelProps => ({
  chain: sepolia,
  wallet: { status: "connected", network: "right", account: ALICE, switchNetwork: vi.fn() },
  record: undefined,
  busy: false,
  notice: undefined,
  persistent: true,
  connect: <button type="button">Connect Wallet</button>,
  onStart: vi.fn(),
  onResume: vi.fn(),
  onForget: vi.fn(),
  ...over,
});

const show = (over: Partial<DeployPanelProps> = {}) => {
  const p = props(over);
  return { p, ...render(<DeployPanel {...p} />) };
};
const owner = () => screen.getByRole("textbox", { name: /^Owner/ });
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });

describe("DeployPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says what it deploys, where, and that it takes two transactions", () => {
    show();
    expect(screen.getByRole("heading", { name: "Deploy" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Deploys the renderer and then the collection to Base Sepolia from the connected wallet: two transactions, one after the other.",
      ),
    ).toBeInTheDocument();
  });

  describe("before a launch", () => {
    it("asks who the owner is, and says what an owner can do and that it need not be the paying wallet", () => {
      show();
      expect(owner()).toHaveValue("");
      expect(
        screen.getByText(/replace the renderer, lock it, withdraw the fees and hand ownership on/),
      ).toBeInTheDocument();
      expect(screen.getByText(/need not be the wallet that pays/)).toBeInTheDocument();
    });

    it("is closed until an owner is named, with the reason beside the button", () => {
      show();
      expect(screen.getByRole("button", { name: "Deploy" })).toBeDisabled();
      expect(screen.getByText("Name the owner first.")).toBeInTheDocument();
    });

    it("fills the owner with the connected account on request", () => {
      show();
      fireEvent.click(screen.getByRole("button", { name: "Use my wallet" }));
      expect(owner()).toHaveValue(ALICE);
      expect(screen.getByRole("button", { name: "Deploy" })).toBeEnabled();
    });

    it("has no such shortcut without a wallet", () => {
      show({ wallet: { status: "none", network: "wrong", account: undefined, switchNetwork: vi.fn() } });
      expect(screen.queryByRole("button", { name: "Use my wallet" })).not.toBeInTheDocument();
    });

    it("says an owner that is not an address is not one", () => {
      show();
      type(owner(), "vitalik.eth");
      expect(screen.getByText("The owner is not an address.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Deploy" })).toBeDisabled();
    });

    it("offers the wallet's connect button, and says to connect, when there is no wallet", () => {
      show({ wallet: { status: "none", network: "wrong", account: undefined, switchNetwork: vi.fn() } });
      expect(screen.getByRole("button", { name: "Connect Wallet" })).toBeInTheDocument();
      expect(screen.getByText("Connect a wallet to deploy.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Deploy" })).toBeDisabled();
    });

    it("offers to switch network for a wallet on another chain", () => {
      const switchNetwork = vi.fn();
      show({ wallet: { status: "connected", network: "wrong", account: ALICE, switchNetwork } });
      fireEvent.click(screen.getByRole("button", { name: "Switch network" }));
      expect(switchNetwork).toHaveBeenCalledOnce();
      expect(screen.getByText("Switch your wallet to the right network.")).toBeInTheDocument();
    });

    it("starts the launch with the owner as typed, spaces and case as they are, and no mainnet confirmation on a testnet", () => {
      const { p } = show();
      type(owner(), ` ${OWNER.toLowerCase()} `);
      fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
      expect(p.onStart).toHaveBeenCalledWith({ owner: OWNER, mainnetConfirmed: false });
    });

    it("warns that the wallet will be asked twice", () => {
      show();
      expect(screen.getByText("Your wallet will ask you to confirm twice.")).toBeInTheDocument();
    });

    it("does not ask for a mainnet confirmation on a testnet", () => {
      show();
      type(owner(), OWNER);
      expect(screen.queryByLabelText(/last six characters/)).not.toBeInTheDocument();
    });
  });

  describe("on Base mainnet", () => {
    it("wants the last six characters of the owner's address typed, and says which address", () => {
      const { p } = show({ chain: base });
      type(owner(), OWNER);
      expect(screen.getByRole("button", { name: "Deploy" })).toBeDisabled();
      expect(
        screen.getByText("Type the last six characters of the owner's address to confirm a deployment to Base."),
      ).toBeInTheDocument();

      type(screen.getByRole("textbox", { name: /last six characters/ }), "E93B906".slice(-6));
      fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
      expect(p.onStart).toHaveBeenCalledWith({ owner: OWNER, mainnetConfirmed: true });
    });

    it("is not opened by the wrong characters", () => {
      show({ chain: base });
      type(owner(), OWNER);
      type(screen.getByRole("textbox", { name: /last six characters/ }), "ffffff");
      expect(screen.getByRole("button", { name: "Deploy" })).toBeDisabled();
    });

    it("recommends a hardware wallet", () => {
      show({ chain: base });
      expect(screen.getByText(/hardware wallet/i)).toBeInTheDocument();
    });
  });

  describe("a launch under way", () => {
    it("shows the owner it was given, in place of the form, and the step it is at", () => {
      show({ record: record() });
      expect(screen.queryByRole("textbox", { name: /^Owner/ })).not.toBeInTheDocument();
      expect(screen.getByText(OWNER)).toBeInTheDocument();
      expect(within(screen.getByRole("listitem", { current: "step" })).getByRole("heading")).toHaveTextContent(
        "Renderer",
      );
    });

    it("continues where it was, with the same gates but no second confirmation", () => {
      const { p } = show({ chain: base, record: record({ chainId: 8453 }) });
      fireEvent.click(screen.getByRole("button", { name: "Continue deploying" }));
      expect(p.onResume).toHaveBeenCalledOnce();
    });

    it("cannot be continued from a wallet on another network", () => {
      show({
        record: record(),
        wallet: { status: "connected", network: "wrong", account: ALICE, switchNetwork: vi.fn() },
      });
      expect(screen.getByRole("button", { name: "Continue deploying" })).toBeDisabled();
      expect(screen.getByText("Switch your wallet to the right network.")).toBeInTheDocument();
    });

    it("asks for the wallet's confirmation, not another click, while the renderer is being sent", () => {
      show({ record: record(), busy: true });
      expect(screen.getByText("Confirm the transaction in your wallet…")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Continue deploying" })).not.toBeInTheDocument();
    });

    it("says it is waiting for the chain once the transaction is sent", () => {
      show({ record: record({ rendererTx: `0x${"11".repeat(32)}` }), busy: true });
      expect(screen.getByText("Waiting for the transaction to be mined…")).toBeInTheDocument();
    });

    it("shows the renderer where it is, and moves on to the collection", () => {
      show({ record: record({ status: "renderer", renderer: RENDERER, rendererBlock: 41 }) });
      expect(screen.getByText(`Deployed at ${RENDERER} in block 41.`)).toBeInTheDocument();
      expect(within(screen.getByRole("listitem", { current: "step" })).getByRole("heading")).toHaveTextContent(
        "Collection",
      );
    });

    it("links the renderer to the explorer", () => {
      show({ record: record({ status: "renderer", renderer: RENDERER, rendererBlock: 41 }) });
      expect(screen.getByRole("link", { name: "Renderer on the explorer" })).toHaveAttribute(
        "href",
        `https://sepolia.basescan.org/address/${RENDERER}`,
      );
    });

    it("forgets the launch only when sure, saying that a sent transaction would stay on the chain", () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
      const { p } = show({ record: record() });
      fireEvent.click(screen.getByRole("button", { name: "Forget this deployment" }));
      expect(p.onForget).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Forget this deployment" }));
      expect(p.onForget).toHaveBeenCalledOnce();
      expect(confirm.mock.calls[0]?.[0]).toMatch(/already sent/);
    });
  });

  describe("a finished launch", () => {
    const done = record({
      status: "done",
      renderer: RENDERER,
      rendererBlock: 41,
      proofkin: PROOFKIN,
      proofkinBlock: 42,
    });

    it("says both are deployed and checked, and gives the settings", () => {
      show({ record: done });
      expect(
        screen.getByText(`Deployed at ${PROOFKIN} in block 42, and checked against the build.`),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Site settings").textContent).toContain(`NEXT_PUBLIC_PROOFKIN=${PROOFKIN}`);
      expect(within(screen.getByRole("listitem", { current: "step" })).getByRole("heading")).toHaveTextContent(
        "Site settings",
      );
    });

    it("offers no more deploying", () => {
      show({ record: done });
      expect(screen.queryByRole("button", { name: /Deploy|Continue deploying/ })).not.toBeInTheDocument();
    });

    it("forgets the note of it from the settings, since the panel cannot tell it from the console's", () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const { p } = show({ record: done });
      fireEvent.click(screen.getByRole("button", { name: "Forget this deployment" }));
      expect(p.onForget).toHaveBeenCalledOnce();
    });
  });

  it("shows what went wrong as an alert", () => {
    show({ notice: "You rejected the request in your wallet." });
    expect(screen.getByRole("alert")).toHaveTextContent("You rejected the request in your wallet.");
  });

  it("tells the person to write the addresses down when the browser will not keep them", () => {
    show({ persistent: false, record: record({ status: "renderer", renderer: RENDERER }) });
    expect(screen.getByText(/write down each address/)).toBeInTheDocument();
  });

  it("tells a person who left a launch unfinished to connect the account that began it", () => {
    show();
    expect(screen.getByText(/connect the account that began it/)).toBeInTheDocument();
  });
});
