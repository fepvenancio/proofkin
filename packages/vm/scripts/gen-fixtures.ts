// Writes fixtures/diff.json, fixtures/solutions.json and fixtures/cheats.json. Run with `pnpm gen:fixtures`.
import { writeFileSync } from "node:fs";
import { generateCheatFixtures, generateDiffFixtures, generateSolutions } from "../src/fixtures.ts";

const dir = new URL("../../../fixtures/", import.meta.url);

const diff = generateDiffFixtures();
writeFileSync(new URL("diff.json", dir), `${JSON.stringify(diff)}\n`);
writeFileSync(new URL("solutions.json", dir), `${JSON.stringify(generateSolutions(), null, 2)}\n`);
writeFileSync(new URL("cheats.json", dir), `${JSON.stringify(generateCheatFixtures(), null, 2)}\n`);

console.log(
  `fixtures/diff.json: ${diff.valid.length} valid rows, ${diff.invalid.length} invalid, ${diff.vectors.length} vectors`,
);
