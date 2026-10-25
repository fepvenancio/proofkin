// The facts about a launch that do not depend on a wallet: where it may go, what it is called, what to type to confirm it.
import { type Address, getAddress, parseEther } from "viem";
import { base, baseSepolia, foundry } from "viem/chains";

/** The price every collection is launched at, fixed in the constructor call: `mintPrice` is immutable. */
export const LAUNCH_MINT_PRICE = parseEther("0.01");

/** The chains Deploy.s.sol deploys to, and so the only ones the console will: a wrong network cannot be a launch. */
export const DEPLOY_CHAIN_IDS = [foundry.id, baseSepolia.id, base.id] as const;

const SETTING_NAME: Record<number, string> = { [foundry.id]: "anvil", [baseSepolia.id]: "baseSepolia", [base.id]: "base" };
const EXPLORER: Record<number, { chain: string; url: string }> = {
  [baseSepolia.id]: { chain: "base-sepolia", url: "https://base-sepolia.blockscout.com/api/" },
  [base.id]: { chain: "base", url: "https://base.blockscout.com/api/" },
};

export interface Launched {
  chainId: number;
  proofkin: Address;
  renderer: Address;
  /** A block at or before the one that holds the collection: where the gallery starts reading. */
  deployBlock: number;
}

/**
 * @notice The settings a site needs to show a collection that was just deployed, in the form it reads them.
 * @dev The same four lines Deploy.s.sol prints for the web app, with the addresses checksummed.
 * @param launched - Where the collection is.
 * @returns The lines to paste into the site's environment.
 */
export function envBlock({ chainId, proofkin, renderer, deployBlock }: Launched): string {
  const chain = SETTING_NAME[chainId];
  if (!chain) throw new Error(`Proofkin is not deployed to chain ${chainId}.`);
  return [
    `NEXT_PUBLIC_CHAIN=${chain}`,
    `NEXT_PUBLIC_PROOFKIN=${getAddress(proofkin)}`,
    `NEXT_PUBLIC_RENDERER=${getAddress(renderer)}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK=${deployBlock}`,
  ].join("\n");
}

/**
 * @notice The commands that publish the two contracts' source on a block explorer.
 * @dev Blockscout, because it needs no API key. They are text to copy, run by the owner with Foundry: the console does
 * not verify anything itself.
 * @param args - `chainId`, the `owner` the collection was given, and where the two contracts are.
 * @returns The renderer's command, then the collection's; or nothing for a chain that has no explorer.
 */
export function verifyCommands(args: { chainId: number; owner: Address; proofkin: Address; renderer: Address }):
  | [string, string]
  | undefined {
  const explorer = EXPLORER[args.chainId];
  if (!explorer) return undefined;
  const flags = `--chain ${explorer.chain} --verifier blockscout --verifier-url ${explorer.url}`;
  const constructorArgs = `$(cast abi-encode "constructor(address,address,uint256)" ${args.owner} ${args.renderer} ${LAUNCH_MINT_PRICE})`;
  return [
    `forge verify-contract ${args.renderer} contracts/src/Renderer.sol:Renderer ${flags}`,
    `forge verify-contract ${args.proofkin} contracts/src/Proofkin.sol:Proofkin ${flags} --constructor-args ${constructorArgs}`,
  ];
}

/** What to type to confirm an action on an address: its last six characters, so that the address has to be read. */
export const confirmationTail = (address: Address): string => address.slice(-6).toLowerCase();

/** Whether what was typed confirms the action on `address`: its tail, in either case, with spaces round it. */
export const isConfirmed = (typed: string, address: Address): boolean =>
  typed.trim().toLowerCase() === confirmationTail(address);
