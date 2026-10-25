import { type PendingDeploy } from "@proofkin/core/launch";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminConsole } from "@/features/admin/AdminConsole";

// `publicEnv` is read once, when `@/config/env` is first imported, so the variable must exist before the imports run.
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_CHAIN", "baseSepolia");
});

const PROOFKIN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const RENDERER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const OWNER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// What the settings say and what the deployment hook says, which a test sets; and the chain the console reads.
const world = vi.hoisted(() => ({
  source: { kind: "none" } as
    | { kind: "none" }
    | { kind: "broken"; problems: string[] }
    | { kind: "configured"; app: { proofkin: string; renderer: string; chain: { id: number; name: string } } },
  record: undefined as unknown,
  account: { status: "disconnected" } as { status: string; address?: string; chainId?: number },
}));

vi.mock("@/config/env", async (original) => ({
  ...(await original<typeof import("@/config/env")>()),
  collectionFromEnv: () => world.source,
}));
vi.mock("wagmi", () => ({
  usePublicClient: () => ({
    readContract: async ({ functionName }: { functionName: string }) =>
      ({ owner: OWNER, renderer: RENDERER, rendererLocked: false, mintPrice: 10n ** 16n, totalSupply: 0n })[
        functionName
      ],
    getBalance: async () => 0n,
  }),
  useAccount: () => world.account,
  useWalletClient: () => ({ data: undefined }),
  useSwitchChain: () => ({ switchChain: vi.fn() }),
}));
vi.mock("@/features/admin/useDeployFlow", () => ({
  useDeployFlow: () => ({
    record: world.record,
    busy: false,
    notice: undefined,
    persistent: true,
    start: vi.fn(),
    resume: vi.fn(),
    forget: vi.fn(),
  }),
}));
vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button type="button">Connect Wallet</button> }));

const done: PendingDeploy = {
  version: 1,
  chainId: 84532,
  account: ALICE,
  owner: OWNER,
  status: "done",
  renderer: RENDERER,
  rendererBlock: 4,
  proofkin: PROOFKIN,
  proofkinBlock: 5,
  createdAt: 1,
};

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AdminConsole />
    </QueryClientProvider>,
  );

describe("AdminConsole", () => {
  beforeEach(() => {
    window.localStorage.clear();
    world.source = { kind: "none" };
    world.record = undefined;
    world.account = { status: "disconnected" };
  });

  it("is headed Admin, and on the server draws nothing more, since the wallet and the browser's storage are not there", () => {
    const html = renderToStaticMarkup(<AdminConsole />);
    expect(html).toContain("Admin");
    expect(html).not.toContain("Deploy");
  });

  it("offers to deploy when the settings name no collection and none was deployed from here", async () => {
    open();
    expect(await screen.findByRole("heading", { name: "Deploy" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Collection" })).not.toBeInTheDocument();
  });

  it("shows the collection the settings name, read from the chain, and offers no deployment", async () => {
    world.source = {
      kind: "configured",
      app: { proofkin: PROOFKIN, renderer: RENDERER, chain: { id: 84532, name: "Base Sepolia" } },
    };
    open();
    expect(await screen.findByText("Owner")).toBeInTheDocument();
    expect(screen.getByText(/named by this site's settings/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Deploy" })).not.toBeInTheDocument();
  });

  it("says what is wrong when the settings name a collection badly, and shows no console", () => {
    world.source = { kind: "broken", problems: ["NEXT_PUBLIC_RENDERER must be a contract address (it is not set)."] };
    open();
    expect(screen.getByRole("alert")).toHaveTextContent("NEXT_PUBLIC_RENDERER must be a contract address");
    expect(screen.queryByRole("heading", { name: "Deploy" })).not.toBeInTheDocument();
  });

  it("shows a launch the connected account has under way, with its steps", async () => {
    world.record = { ...done, status: "renderer", proofkin: undefined, proofkinBlock: undefined };
    open();
    expect(await screen.findByRole("heading", { name: "Deploy" })).toBeInTheDocument();
    expect(screen.getByText(`Deployed at ${RENDERER} in block 4.`)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Collection" })).not.toBeInTheDocument();
  });

  it("shows a finished launch with its settings and, below it, how the collection stands", async () => {
    world.record = done;
    open();
    expect(await screen.findByLabelText("Site settings")).toHaveTextContent(`NEXT_PUBLIC_PROOFKIN=${PROOFKIN}`);
    expect(await screen.findByText("Open: it can still be replaced.")).toBeInTheDocument();
  });

  it("remembers a finished launch this browser made, for a visit with no wallet connected", async () => {
    window.localStorage.setItem(`proofkin:deploy:v1:84532:${ALICE.toLowerCase()}`, JSON.stringify(done));
    open();
    expect(await screen.findByText(/deployed from this browser/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Site settings")).toHaveTextContent(`NEXT_PUBLIC_RENDERER=${RENDERER}`);
    await waitFor(() => expect(screen.getByText("Open: it can still be replaced.")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Deploy" })).not.toBeInTheDocument();
  });

  it("finds the finished launch even when a newer one, by another account, is not finished", async () => {
    window.localStorage.setItem(
      `proofkin:deploy:v1:84532:${ALICE.toLowerCase()}`,
      JSON.stringify({ ...done, createdAt: 1 }),
    );
    window.localStorage.setItem(
      `proofkin:deploy:v1:84532:${OWNER.toLowerCase()}`,
      JSON.stringify({
        ...done,
        account: OWNER,
        status: "renderer",
        proofkin: undefined,
        proofkinBlock: undefined,
        createdAt: 2,
      }),
    );
    open();
    expect(await screen.findByText(/deployed from this browser/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Site settings")).toHaveTextContent(`NEXT_PUBLIC_PROOFKIN=${PROOFKIN}`);
  });

  it("ignores a launch this browser began and did not finish when no wallet says whose it is", async () => {
    window.localStorage.setItem(
      `proofkin:deploy:v1:84532:${ALICE.toLowerCase()}`,
      JSON.stringify({ ...done, status: "renderer", proofkin: undefined, proofkinBlock: undefined }),
    );
    open();
    expect(await screen.findByRole("heading", { name: "Deploy" })).toBeInTheDocument();
  });
});
