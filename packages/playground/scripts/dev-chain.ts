// `pnpm dev:chain`: a local chain with the contracts deployed, wired into the playground via .env.local.
// Blocks arrive every second so a reveal window can be watched in the browser. Ctrl-C stops it.
import { writeFileSync } from "node:fs";
import { deployContracts, startAnvil } from "./local-chain.ts";

const chain = await startAnvil({ port: 8545, blockTimeSeconds: 1 });
const d = await deployContracts(chain.rpcUrl);

const env = [
  "# Written by `pnpm dev:chain`. Local only; ignored by git.",
  "VITE_CHAIN=anvil",
  `VITE_RPC_URL=${chain.rpcUrl}`,
  `VITE_PROOFKIN=${d.proofkin}`,
  `VITE_RENDERER=${d.renderer}`,
  `VITE_DEPLOY_BLOCK=${d.deployBlock}`,
  "",
].join("\n");
writeFileSync(new URL("../.env.local", import.meta.url), env);

console.log(`anvil      ${chain.rpcUrl}  (chain id 31337, a block every second)`);
console.log(`Proofkin   ${d.proofkin}  (mint price 0.01 ETH)`);
console.log(`Renderer   ${d.renderer}`);
console.log("wrote packages/playground/.env.local. Now run `pnpm --filter @proofkin/playground dev`.");

const stop = async () => {
  await chain.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
