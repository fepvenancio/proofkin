/**
 * @notice The rules that keep server code on the server and configuration in one place, as checks over source text.
 * @dev A rule that lives in a document is a rule people stop following. These run in the test suite, over the same
 * `src/` that ships, and `architecture.test.ts` proves each one catches a violation before it trusts a clean result.
 */

export interface Violation {
  file: string;
  rule: "client-reaches-server-only" | "chain-module-not-server-only" | "env-outside-config" | "env-read-not-literal";
  detail: string;
}

const ENV_MODULE = "src/config/env.ts";
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** A string literal, or else a comment: matched in one pass so a `//` inside a string is not taken for a comment. */
const TOKEN = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/** The code with its comments removed, strings intact: what the directive and the imports are read from. */
const withoutComments = (source: string) => source.replace(TOKEN, (_all, literal?: string) => literal ?? "");

/** The code with its comments removed and every string emptied: what the environment rules are checked on. */
const withoutLiterals = (source: string) =>
  source.replace(TOKEN, (_all, literal?: string) => (literal ? `${literal[0]}${literal[0]}` : ""));

const isClientModule = (source: string) => /^\s*(["'])use client\1/.test(source);
const isServerAction = (source: string) => /^\s*(["'])use server\1/.test(source);
const isServerOnly = (source: string) => /^\s*import\s+(["'])server-only\1/m.test(source);

/** The files in `files` that `file` imports, resolving `@/` to `src/` and relative paths against the file. */
function localImports(file: string, source: string, files: Record<string, string>): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/(?:from|import)\s+(["'])([^"']+)\1/g)) {
    const specifier = match[2] as string;
    let base: string | undefined;
    if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`;
    else if (specifier.startsWith(".")) base = join(dirname(file), specifier);
    if (base === undefined) continue;
    const target = EXTENSIONS.map((extension) => base + extension).find((candidate) => candidate in files);
    if (target !== undefined) found.push(target);
  }
  return found;
}

function dirname(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function join(directory: string, relative: string): string {
  const parts = directory === "" ? [] : directory.split("/");
  for (const part of relative.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/**
 * @notice Every way `files` breaks the architecture rules.
 * @dev (1) A client component, and anything it imports however deep, must never reach a module that imports
 * `server-only`: the bundler would fail the build, or worse, ship server code. The exception is a module that begins
 * with `"use server"`: a server action, which a client component may import and call, and whose own imports are not
 * followed. (2) The environment is read in
 * `src/config/env.ts` and nowhere else, so there is one list of what the app needs. (3) There, only as
 * `process.env.NAME`: Next.js replaces exactly those at build time, and in the browser `process.env` itself is empty.
 * (4) Every module in `src/chain/` reads the chain through a server-only RPC URL and says so with `import "server-only"`,
 * so that rule (1) has something to catch: without the marker nothing stops a client component importing it.
 * @param files - Source text by path relative to the package root; tests and generated files are the caller's to leave out.
 * @returns The violations, empty when the rules hold.
 */
export function findViolations(files: Record<string, string>): Violation[] {
  const violations: Violation[] = [];

  const code: Record<string, string> = Object.fromEntries(
    Object.entries(files).map(([file, source]) => [file, withoutComments(source)]),
  );

  for (const [file, source] of Object.entries(code)) {
    if (isClientModule(source)) {
      const seen = new Set<string>();
      const visit = (current: string, path: string[]) => {
        if (seen.has(current)) return;
        seen.add(current);
        const text = code[current] as string;
        // a server action is the one way a client component may call the server: the bundler leaves only a reference
        // to it in the browser, so what it imports stays where it is
        if (current !== file && isServerAction(text)) return;
        if (isServerOnly(text)) {
          violations.push({ file, rule: "client-reaches-server-only", detail: [...path, current].join(" -> ") });
          return;
        }
        for (const next of localImports(current, text, code)) visit(next, [...path, current]);
      };
      visit(file, []);
    }

    if (file.startsWith("src/chain/") && !isServerOnly(source)) {
      violations.push({ file, rule: "chain-module-not-server-only", detail: 'add import "server-only" at the top' });
    }

    const bare = withoutLiterals(files[file] as string);
    if (file !== ENV_MODULE && /process\.env/.test(bare)) {
      violations.push({ file, rule: "env-outside-config", detail: `read the environment in ${ENV_MODULE} instead` });
    }
    if (file === ENV_MODULE && /process\.env(?!\.[A-Z][A-Z0-9_]*\b)/.test(bare)) {
      violations.push({
        file,
        rule: "env-read-not-literal",
        detail: "use process.env.NAME, never process.env[name] or process.env itself",
      });
    }
  }
  return violations;
}
