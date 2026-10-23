// The chain tests start their own Anvil (see kit.ts); all that is needed up front is the compiled contracts.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const root = new URL("../../../../", import.meta.url).pathname;

export default function setup() {
  if (!existsSync(`${root}out/Proofkin.sol/Proofkin.json`)) execSync("forge build", { cwd: root, stdio: "inherit" });
}
