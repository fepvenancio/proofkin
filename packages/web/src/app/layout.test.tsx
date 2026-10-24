import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Each case imports the layout afresh, and the first import loads its whole graph: slow on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

vi.mock("next/font/google", () => ({ Recursive: () => ({ variable: "font-recursive-test" }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/app/providers", () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <div data-providers>{children}</div>,
}));
vi.mock("@/components/SiteHeader", () => ({ SiteHeader: () => <header>The header</header> }));
// The wallet libraries are heavy to load and have nothing to say about the layout's own structure.
vi.mock("@/config/wagmi", () => ({ createWagmiConfig: () => ({}) }));
vi.mock("wagmi", () => ({ cookieToInitialState: () => undefined }));

const SETTINGS = {
  NEXT_PUBLIC_CHAIN: "baseSepolia",
  NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
};

/** The layout reads the environment when it is first imported, so each case imports it afresh under its own settings. */
async function render(env: Record<string, string>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const name of Object.keys(SETTINGS)) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { default: Layout } = await import("@/app/layout");
  return renderToStaticMarkup(await Layout({ children: <p>The page</p> }));
}

describe("the root layout", () => {
  it("puts the header and the page inside the providers, and the page in the main landmark", async () => {
    const html = await render(SETTINGS);
    expect(html).toMatch(
      /<div data-providers[^>]*><header>The header<\/header><main[^>]*><p>The page<\/p><\/main><\/div>/,
    );
  });

  it("is an English page that carries the font", async () => {
    const html = await render(SETTINGS);
    expect(html).toMatch(/<html lang="en" class="font-recursive-test"/);
  });

  it("shows what is wrong, and nothing else, when the deployment is not configured", async () => {
    const html = await render({});
    expect(html).toContain("Proofkin is not configured");
    expect(html).toContain("NEXT_PUBLIC_CHAIN");
    expect(html).not.toContain("The page");
    expect(html).not.toContain("The header");
    expect(html).toMatch(/<html lang="en" class="font-recursive-test"/);
  });
});
