import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tsdoc from "eslint-plugin-tsdoc";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "next-env.d.ts", "node_modules/**"]),
  {
    files: ["**/*.{ts,tsx,mjs}"],
    plugins: { tsdoc }, // the `import` plugin comes with eslint-config-next
    settings: { "import/resolver": { typescript: { project: ["./tsconfig.json"] } } },
    rules: {
      // Unlike kam-frontend, `any` is an error: a wallet app should know the type of what it signs.
      "@typescript-eslint/no-explicit-any": "error",
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"], "object", "type"],
          pathGroups: [{ pattern: "@/**", group: "internal", position: "before" }],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      // The NatSpec-shaped doc comments (@notice, @dev) have to be valid TSDoc; tsdoc.json declares those tags.
      "tsdoc/syntax": "error",
    },
  },
]);
