// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { findViolations } from "./architecture";

const rules = (files: Record<string, string>) => findViolations(files).map((v) => v.rule);

describe("the checker catches what it is for", () => {
  const serverModule = `import "server-only";\nexport const secret = 1;\n`;

  it("flags a client component that imports a server-only module", () => {
    const files = {
      "src/chain/server.ts": serverModule,
      "src/components/Wallet.tsx": `"use client";\nimport { secret } from "@/chain/server";\n`,
    };
    expect(findViolations(files)).toEqual([
      {
        file: "src/components/Wallet.tsx",
        rule: "client-reaches-server-only",
        detail: "src/components/Wallet.tsx -> src/chain/server.ts",
      },
    ]);
  });

  it("flags it however deep the import goes, and says how it got there", () => {
    const files = {
      "src/chain/server.ts": serverModule,
      "src/lib/helper.ts": `import { secret } from "../chain/server";\n`,
      "src/components/Wallet.tsx": `"use client";\nimport "@/lib/helper";\n`,
    };
    expect(findViolations(files)[0]?.detail).toBe(
      "src/components/Wallet.tsx -> src/lib/helper.ts -> src/chain/server.ts",
    );
  });

  it("lets a client component call a server action, whose own imports stay on the server", () => {
    const files = {
      "src/chain/server.ts": serverModule,
      "src/features/refresh.ts": `"use server";\nimport { secret } from "@/chain/server";\nexport async function refresh() {}\n`,
      "src/components/Wallet.tsx": `"use client";\nimport { refresh } from "@/features/refresh";\n`,
    };
    expect(rules(files)).toEqual([]);
  });

  it("does not let a module that merely sits beside a server action off: only the directive makes the boundary", () => {
    const files = {
      "src/chain/server.ts": serverModule,
      "src/features/refresh.ts": `import { secret } from "@/chain/server";\nexport async function refresh() {}\n`,
      "src/components/Wallet.tsx": `"use client";\nimport { refresh } from "@/features/refresh";\n`,
    };
    expect(rules(files)).toEqual(["client-reaches-server-only"]);
  });

  it("reads the directive only at the top, not in a comment", () => {
    const files = {
      "src/chain/server.ts": serverModule,
      "src/features/refresh.ts": `// "use server"\nimport { secret } from "@/chain/server";\n`,
      "src/components/Wallet.tsx": `"use client";\nimport "@/features/refresh";\n`,
    };
    expect(rules(files)).toEqual(["client-reaches-server-only"]);
  });

  it("lets a server component use a server-only module", () => {
    const files = {
      "src/chain/server.ts": serverModule,
      "src/app/page.tsx": `import { secret } from "@/chain/server";\n`,
    };
    expect(rules(files)).toEqual([]);
  });

  it("flags a module in src/chain that does not say it is server-only", () => {
    expect(rules({ "src/chain/server.ts": "export const read = 1;\n" })).toEqual(["chain-module-not-server-only"]);
    expect(rules({ "src/chain/server.ts": serverModule })).toEqual([]);
    // the same module outside src/chain is not held to it
    expect(rules({ "src/lib/read.ts": "export const read = 1;\n" })).toEqual([]);
  });

  it("flags the environment being read anywhere but config/env.ts", () => {
    expect(rules({ "src/lib/x.ts": "const a = process.env.NEXT_PUBLIC_A;\n" })).toEqual(["env-outside-config"]);
    expect(rules({ "src/config/env.ts": "export const a = process.env.NEXT_PUBLIC_A;\n" })).toEqual([]);
  });

  it("does not mistake a comment, or a string, about the environment for reading it", () => {
    const files = {
      "src/config/env.ts":
        "/** Reads process.env.NAME, never process.env[name]. */\nexport const a = process.env.NEXT_PUBLIC_A; // not process.env itself\n",
      "src/lib/x.ts": "// process.env is read in config/env.ts\n/* process.env.X */\nexport const b = 'process.env';\n",
    };
    expect(findViolations(files)).toEqual([]);
  });

  it("still sees the directive and the imports of a file that starts with a comment", () => {
    const files = {
      "src/chain/server.ts": `import "server-only";\n`,
      "src/components/Wallet.tsx": `// header\n"use client";\n// import "@/chain/server" is how it goes wrong\nimport "@/chain/server";\n`,
    };
    expect(rules(files)).toEqual(["client-reaches-server-only"]);
  });

  it("flags a computed or whole-object read in config/env.ts, which Next.js would not replace", () => {
    for (const bad of ["process.env[name]", "const all = process.env;", "{ ...process.env }"]) {
      expect(rules({ "src/config/env.ts": `export const x = ${bad};\n` }), bad).toEqual(["env-read-not-literal"]);
    }
  });
});

describe("the app as it is", () => {
  /** Every source file under src/, except tests, by path relative to the package root. */
  function sources(): Record<string, string> {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const found: Record<string, string> = {};
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = `${directory}${sep}${name}`;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name))
          found[relative(root, path).split(sep).join("/")] = readFileSync(path, "utf8");
      }
    };
    walk(`${root}src`);
    return found;
  }

  it("keeps server code out of client components and reads the environment in one place", () => {
    const files = sources();
    expect(Object.keys(files).length).toBeGreaterThan(0);
    expect(findViolations(files)).toEqual([]);
  });
});
