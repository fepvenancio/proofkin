import { type CollectionData, type SolvedEntry } from "@/model/data";

/** What the pages' tests pretend the chain holds: three tokens, two of them QUORUM7 (17 is the smallest) and one SORT8. */
export const collection: CollectionData = {
  mintPrice: "10000000000000000",
  totalSupply: 3,
  solvedCount: [2, 0, 1, 0, 0, 0],
  bestNodes: [17, 255, 19, 255, 255, 255],
};

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

export const entries: SolvedEntry[] = [
  { tokenId: 1, puzzleId: 0, author: ALICE, nodeCount: 20, rank: 1 },
  { tokenId: 2, puzzleId: 0, author: BOB, nodeCount: 17, rank: 2 },
  { tokenId: 3, puzzleId: 2, author: ALICE, nodeCount: 19, rank: 1 },
];

export const owners = { alice: ALICE, bob: BOB } as const;

/** The settings every page test needs, set before the app's own modules are imported (`publicEnv` is read once). */
export const SETTINGS = {
  NEXT_PUBLIC_CHAIN: "baseSepolia",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
};
