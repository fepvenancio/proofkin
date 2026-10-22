// When the Mint button may be pressed, and the reason shown when it may not.
export interface MintGateInput {
  /** The program assembles and validates. */
  analysis: "ok" | "invalid";
  localTest: "pass" | "fail" | "notRun";
  wallet: "connected" | "none";
  network: "right" | "wrong";
  /** What the contract says about this exact program and its puzzle. */
  onChain: "free" | "alreadyMinted" | "puzzleFull" | "unknown";
  /** A mint is already under way. */
  busy: boolean;
}

export type MintGate = { enabled: true } | { enabled: false; reason: string };

export function mintGate(i: MintGateInput): MintGate {
  const no = (reason: string): MintGate => ({ enabled: false, reason });
  if (i.busy) return no("A mint is in progress, please wait.");
  if (i.analysis !== "ok") return no("Fix the program first.");
  if (i.localTest === "notRun") return no("Run the local test first.");
  if (i.localTest === "fail") return no("The program has to pass the local test first.");
  if (i.wallet !== "connected") return no("Connect a wallet to mint.");
  if (i.network !== "right") return no("Switch your wallet to the right network.");
  if (i.onChain === "unknown") return no("Checking the chain…");
  if (i.onChain === "alreadyMinted") return no("This exact program has already been minted.");
  if (i.onChain === "puzzleFull") return no("All 50 slots of this puzzle are taken.");
  return { enabled: true };
}
