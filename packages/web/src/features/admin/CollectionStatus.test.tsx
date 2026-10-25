import { type Reader } from "@proofkin/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollectionStatus } from "@/features/admin/CollectionStatus";

const PROOFKIN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const RENDERER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const OWNER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const STRANGER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

const state = { owner: OWNER, renderer: RENDERER, rendererLocked: false, mintPrice: 10n ** 16n, totalSupply: 6n };

/** A reader that answers what the console asks about a collection. */
function reader(over: Partial<typeof state & { balance: bigint }> = {}): Reader {
  const s = { ...state, balance: 6n * 10n ** 16n, ...over };
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: keyof typeof state }) => s[functionName]),
    getBalance: vi.fn(async () => s.balance),
  } as unknown as Reader;
}

const show = (over: Partial<Parameters<typeof CollectionStatus>[0]> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CollectionStatus
        chain={{ id: 84532, name: "Base Sepolia" }}
        proofkin={PROOFKIN}
        account={undefined}
        reader={reader()}
        {...over}
      />
    </QueryClientProvider>,
  );
};

describe("CollectionStatus", () => {
  it("says it is reading the chain until it has", async () => {
    show();
    expect(screen.getByRole("status")).toHaveTextContent("Reading the chain…");
    await screen.findByText("Owner");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("gives the collection's state: where it is, who owns it, which renderer, the price, how much is solved, and the fees held", async () => {
    show();
    await screen.findByText("Owner");
    const terms = within(screen.getByRole("region", { name: "Collection" }));
    expect(terms.getByText("Base Sepolia")).toBeInTheDocument();
    expect(terms.getByText(PROOFKIN)).toBeInTheDocument();
    expect(terms.getByText(OWNER)).toBeInTheDocument();
    expect(terms.getByText(RENDERER)).toBeInTheDocument();
    expect(terms.getByText("0.01 ETH")).toBeInTheDocument();
    expect(terms.getByText("6 of 300")).toBeInTheDocument();
    expect(terms.getByText("0.06 ETH")).toBeInTheDocument();
  });

  it("says whether the renderer can still be replaced", async () => {
    const { unmount } = show();
    expect(await screen.findByText("Open: it can still be replaced.")).toBeInTheDocument();
    unmount();
    show({ reader: reader({ rendererLocked: true }) });
    expect(await screen.findByText("Locked for good.")).toBeInTheDocument();
  });

  it("marks the connected account as the owner when it is, in either case of letters", async () => {
    show({ account: OWNER.toLowerCase() as `0x${string}` });
    expect(await screen.findByText("You are the owner.")).toBeInTheDocument();
  });

  it("says nothing of ownership to a stranger or to nobody", async () => {
    const { unmount } = show({ account: STRANGER });
    await screen.findByText("Owner");
    expect(screen.queryByText("You are the owner.")).not.toBeInTheDocument();
    unmount();
    show();
    await screen.findByText("Owner");
    expect(screen.queryByText("You are the owner.")).not.toBeInTheDocument();
  });

  it("links the contracts on the explorer when the chain has one", async () => {
    show({ chain: { id: 84532, name: "Base Sepolia", explorer: "https://sepolia.basescan.org" } });
    await screen.findByText("Owner");
    expect(screen.getByRole("link", { name: "Collection on the explorer" })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/address/${PROOFKIN}`,
    );
    expect(screen.getByRole("link", { name: "Renderer on the explorer" })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/address/${RENDERER}`,
    );
  });

  it("says plainly that it could not read the collection, and reads again when asked", async () => {
    const failing = reader();
    (failing.readContract as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("node down"));
    show({ reader: failing });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read the collection from the chain.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Owner")).toBeInTheDocument();
  });

  it("waits for a client rather than failing without one", () => {
    show({ reader: undefined });
    expect(screen.getByRole("status")).toHaveTextContent("Reading the chain…");
  });
});
