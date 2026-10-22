// Writes fixtures/diff.json and fixtures/solutions.json. Run with `pnpm gen:fixtures`.
import { writeFileSync } from "node:fs";
import { generateDiffFixtures, generateSolutions } from "../src/fixtures.ts";

const dir = new URL("../../../fixtures/", import.meta.url);

const diff = generateDiffFixtures();
writeFileSync(new URL("diff.json", dir), `${JSON.stringify(diff)}\n`);
writeFileSync(new URL("solutions.json", dir), `${JSON.stringify(generateSolutions(), null, 2)}\n`);

console.log(
  `fixtures/diff.json: ${diff.valid.length} valid rows, ${diff.invalid.length} invalid, ${diff.vectors.length} vectors`,
);
