import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Page from "@/app/page";
import { tryReadCollection } from "@/chain/collection";

// `publicEnv` is read once, when `@/config/env` is first imported, so the variables must exist before the imports run.
vi.hoisted(() => {
  const settings = {
    NEXT_PUBLIC_CHAIN: "baseSepolia",
    NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    NEXT_PUBLIC_RPC_URL: "https://public.example/rpc",
    RPC_URL: "https://keyed.example/v2/SECRETKEY",
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
});

vi.mock("@/chain/collection", () => ({ tryReadCollection: vi.fn() }));
// The real button needs the wallet providers, which the root layout supplies and this test does not.
vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button type="button">Connect</button> }));

describe("the home page", () => {
  it("shows the collection when the chain answers", async () => {
    vi.mocked(tryReadCollection).mockResolvedValueOnce({
      mintPrice: 10n ** 16n,
      totalSupply: 3n,
      solvedCount: [2, 1, 0, 0, 0, 0],
      bestNodes: [17, 15, 255, 255, 255, 255],
    });
    render(await Page());
    expect(screen.getByText("3 of 300")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says which chain it could not reach when the chain does not answer", async () => {
    vi.mocked(tryReadCollection).mockResolvedValueOnce(undefined);
    render(await Page());
    expect(screen.getByRole("status")).toHaveTextContent(/could not reach base sepolia/i);
  });

  it("names no RPC endpoint when it cannot read: the one it used may be the keyed, server-only one", async () => {
    vi.mocked(tryReadCollection).mockResolvedValueOnce(undefined);
    const { container } = render(await Page());
    expect(container.textContent).not.toMatch(/https?:|SECRETKEY|public\.example/);
  });
});
