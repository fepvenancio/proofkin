import { proofkinAbi } from "@proofkin/core";
import { encodeAbiParameters, encodeEventTopics, type Hex, keccak256, UserRejectedRequestError } from "viem";

/**
 * A chain in memory, answering exactly the calls the mint flow makes, so a test can drive the real flow end to end
 * without a node. It knows blocks, commits, and the programs that have been minted; `mine` moves it on.
 */
export function fakeChain({
  contract,
  svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  startBlock = 1000,
}: {
  contract: `0x${string}`;
  svg?: string;
  startBlock?: number;
}) {
  let block = startBlock;
  let nextToken = 1;
  let sends = 0;
  const commits = new Map<Hex, number>();
  const minted = new Set<Hex>();
  const receipts = new Map<Hex, { status: "success"; blockNumber: bigint; logs: unknown[] }>();
  const listeners = new Set<(block: bigint) => void>();
  const failures: { refuseNext: boolean; nodeDown: boolean } = { refuseNext: false, nodeDown: false };

  const announce = () => listeners.forEach((listener) => listener(BigInt(block)));

  const publicClient = {
    readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (failures.nodeDown) throw new Error("The node did not answer.");
      switch (functionName) {
        case "render":
          return svg;
        case "seen":
          return minted.has(args![0] as Hex);
        case "solvedCount":
          return 0n;
        case "mintPrice":
          return 10n ** 16n;
        case "commitBlock":
          return BigInt(commits.get(args![0] as Hex) ?? 0);
        default:
          throw new Error(`the fake chain was not asked to answer ${functionName}`);
      }
    },
    getBlockNumber: async () => BigInt(block),
    simulateContract: async (request: { functionName: string; args?: readonly unknown[] }) => ({ request }),
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => receipts.get(hash)!,
    watchBlockNumber: ({
      onBlockNumber,
      emitOnBegin,
    }: {
      onBlockNumber: (block: bigint) => void;
      emitOnBegin?: boolean;
    }) => {
      listeners.add(onBlockNumber);
      if (emitOnBegin) onBlockNumber(BigInt(block));
      return () => void listeners.delete(onBlockNumber);
    },
  };

  const walletClient = (address: `0x${string}`) => ({
    account: { address },
    chain: { id: 84532 },
    writeContract: async (request: { functionName: string; args?: readonly unknown[] }): Promise<Hex> => {
      if (failures.refuseNext) {
        failures.refuseNext = false;
        throw new UserRejectedRequestError(new Error("User rejected the request."));
      }
      block += 1;
      const hash: Hex = `0x${(++sends).toString(16).padStart(64, "0")}`;
      const logs: unknown[] = [];
      if (request.functionName === "commit") {
        commits.set(request.args![0] as Hex, block);
      } else {
        const program = request.args![0] as Hex;
        minted.add(keccak256(program));
        logs.push({
          address: contract,
          topics: encodeEventTopics({
            abi: proofkinAbi,
            eventName: "Solved",
            args: { tokenId: BigInt(nextToken), puzzleId: 2, author: address },
          }),
          data: encodeAbiParameters([{ type: "uint8" }, { type: "uint16" }], [46, 1]),
          blockNumber: BigInt(block),
          logIndex: 0,
        });
        nextToken++;
      }
      receipts.set(hash, { status: "success", blockNumber: BigInt(block), logs });
      announce();
      return hash;
    },
  });

  return {
    publicClient,
    walletClient,
    failures,
    blockNumber: () => block,
    mine(blocks: number) {
      block += blocks;
      announce();
    },
    markMinted(programHash: Hex) {
      minted.add(programHash);
    },
  };
}
