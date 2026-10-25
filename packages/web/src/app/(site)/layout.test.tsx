import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
  const { default: Layout } = await import("@/app/(site)/layout");
  return renderToStaticMarkup(<Layout>{<p>The page</p>}</Layout>);
}

describe("the site's layout", () => {
  it("shows the page when the collection's contracts are configured", async () => {
    const html = await render(SETTINGS);
    expect(html).toContain("The page");
    expect(html).not.toContain("not configured");
  });

  it("shows what is wrong in place of the page, naming each contract setting, when there are none", async () => {
    const html = await render({ NEXT_PUBLIC_CHAIN: "baseSepolia" });
    expect(html).toContain("Proofkin is not configured");
    expect(html).toContain("NEXT_PUBLIC_PROOFKIN");
    expect(html).toContain("NEXT_PUBLIC_RENDERER");
    expect(html).not.toContain("The page");
  });
});
