import { fetchToken, proofkinAbi, type TokenView } from "@proofkin/core";
import { ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTokenDetail } from "@/chain/token";
import { requireAppConfig } from "@/config/env";

const readContract = vi.hoisted(() => vi.fn());

vi.mock("@proofkin/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@proofkin/core")>()),
  fetchToken: vi.fn(),
}));
vi.mock("@/chain/server", () => ({ getServerClient: () => ({ readContract }) }));
vi.mock("next/cache", () => ({ unstable_cache: (read: () => Promise<unknown>) => read }));

const app = requireAppConfig({
  NEXT_PUBLIC_CHAIN: "base",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
});

const OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const view: TokenView = {
  name: "Proofkin #3",
  description: "A solved puzzle.",
  attributes: [
    { trait: "Puzzle", value: "SORT8" },
    { trait: "Nodes", value: 19 },
  ],
  imageSrc: "data:image/svg+xml;base64,AAAA",
  svg: "<svg></svg>",
};

describe("getTokenDetail", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("hands back the traits the contract computes and who owns the token now", async () => {
    vi.mocked(fetchToken).mockResolvedValueOnce(view);
    readContract.mockResolvedValueOnce(OWNER);

    await expect(getTokenDetail(app, 3, {})).resolves.toEqual({
      kind: "found",
      value: { id: 3, name: "Proofkin #3", attributes: view.attributes, owner: OWNER },
    });
    expect(readContract).toHaveBeenCalledWith({
      address: app.proofkin,
      abi: proofkinAbi,
      functionName: "ownerOf",
      args: [3n],
    });
  });

  it("leaves the image out: it has its own address, and the SVG is no business of the token page's data", async () => {
    vi.mocked(fetchToken).mockResolvedValueOnce(view);
    readContract.mockResolvedValueOnce(OWNER);
    const result = await getTokenDetail(app, 3, {});
    expect(JSON.stringify(result)).not.toContain("svg");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("says a token is missing when the contract does", async () => {
    const data = encodeErrorResult({ abi: proofkinAbi, errorName: "TokenDoesNotExist" });
    const reverted = new ContractFunctionRevertedError({ abi: proofkinAbi, data, functionName: "tokenURI" });
    vi.mocked(fetchToken).mockRejectedValueOnce(
      new ContractFunctionExecutionError(reverted, { abi: proofkinAbi, functionName: "tokenURI", args: [9n] }),
    );
    readContract.mockResolvedValueOnce(OWNER);
    await expect(getTokenDetail(app, 9, {})).resolves.toEqual({ kind: "missing" });
  });

  it("is unavailable, and says why in the log, when the chain cannot be read", async () => {
    vi.mocked(fetchToken).mockResolvedValueOnce(view);
    readContract.mockRejectedValueOnce(new Error("boom"));
    await expect(getTokenDetail(app, 3, {})).resolves.toEqual({ kind: "unavailable" });
    expect(log.mock.calls.flat().map(String).join(" ")).toContain("boom");
  });
});
