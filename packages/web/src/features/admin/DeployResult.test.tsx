import { type Launched } from "@proofkin/core/launch";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeployResult } from "@/features/admin/DeployResult";

const PROOFKIN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const RENDERER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const OWNER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

const launched: Launched = { chainId: 84532, proofkin: PROOFKIN, renderer: RENDERER, deployBlock: 123 };
const show = (over: Partial<Parameters<typeof DeployResult>[0]> = {}) => {
  const props = { launched, owner: OWNER as `0x${string}`, explorer: "https://sepolia.basescan.org", ...over };
  return render(<DeployResult {...props} />);
};

describe("DeployResult", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gives the settings the site reads, exactly as they are to be pasted", () => {
    show();
    expect(screen.getByLabelText("Site settings").textContent).toBe(
      [
        "NEXT_PUBLIC_CHAIN=baseSepolia",
        `NEXT_PUBLIC_PROOFKIN=${PROOFKIN}`,
        `NEXT_PUBLIC_RENDERER=${RENDERER}`,
        "NEXT_PUBLIC_DEPLOY_BLOCK=123",
      ].join("\n"),
    );
  });

  it("says where they go and why", () => {
    show();
    expect(screen.getByText(/Put these in the site's environment and deploy the site again/)).toBeInTheDocument();
  });

  it("copies the settings", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`NEXT_PUBLIC_PROOFKIN=${PROOFKIN}`));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("does not call the settings of another collection copied because these were", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => undefined) } });
    const { rerender } = show();
    fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
    await screen.findByRole("button", { name: "Copied" });

    const other = { ...launched, proofkin: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const };
    rerender(<DeployResult launched={other} owner={OWNER} explorer="https://sepolia.basescan.org" />);
    expect(screen.getByRole("button", { name: "Copy settings" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("links both contracts on the chain's explorer", () => {
    show();
    expect(screen.getByRole("link", { name: "Collection on the explorer" })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/address/${PROOFKIN}`,
    );
    expect(screen.getByRole("link", { name: "Renderer on the explorer" })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/address/${RENDERER}`,
    );
  });

  it("has no explorer links on a chain without one", () => {
    show({ explorer: undefined });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("gives the commands that publish the source, with the owner as the collection was made, and says they are untested", () => {
    show();
    const commands = screen.getByLabelText("Commands to publish the source");
    expect(commands.textContent).toContain(`forge verify-contract ${RENDERER} contracts/src/Renderer.sol:Renderer`);
    expect(commands.textContent).toContain(
      `"constructor(address,address,uint256)" ${OWNER} ${RENDERER} 10000000000000000`,
    );
    expect(screen.getByText(/not been tried against a real explorer/)).toBeInTheDocument();
  });

  it("has no commands for a local chain, which has no explorer to publish to", () => {
    show({ launched: { ...launched, chainId: 31337 }, explorer: undefined });
    expect(screen.queryByLabelText("Commands to publish the source")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Site settings").textContent).toContain("NEXT_PUBLIC_CHAIN=anvil");
  });

  it("offers to forget the note of the deployment only when it is given a way to, and asks first", () => {
    const onForget = vi.fn();
    const confirm = vi.spyOn(window, "confirm");
    show({ onForget });
    confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Forget this deployment" }));
    expect(onForget).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Forget this deployment" }));
    expect(onForget).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0]?.[0]).toMatch(/stay on the chain/);
  });

  it("does not offer to forget what it cannot", () => {
    show();
    expect(screen.queryByRole("button", { name: "Forget this deployment" })).not.toBeInTheDocument();
    expect(within(document.body).queryByRole("button", { name: /Forget/ })).not.toBeInTheDocument();
  });
});
