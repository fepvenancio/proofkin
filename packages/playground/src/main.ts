import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { makePublicClient } from "./chain.ts";
import { type AppConfig, parseConfig } from "./config.ts";
import { shortAddress } from "./format.ts";
import { PendingStore } from "./storage.ts";
import { connectWallet, type Eip1193 } from "./wallet.ts";
import type { App } from "./ui/app.ts";
import { fill, h } from "./ui/dom.ts";
import { mountGallery } from "./ui/gallery.ts";
import { mountSolve } from "./ui/solve.ts";

const root = document.getElementById("app")!;

const CHAIN_LABEL: Record<AppConfig["name"], string> = { anvil: "Local chain", baseSepolia: "Base Sepolia", base: "Base" };

function showSetupProblems(problems: string[]): void {
  fill(
    root,
    h(
      "main",
      { class: "shell", style: "padding: 64px 0" },
      h("h1", { style: "font-size: 40px; font-weight: 400" }, "This page is not configured yet"),
      h("p", { class: "muted" }, "Set these in packages/playground/.env.local (see .env.example), then reload:"),
      h("ul", null, ...problems.map((p) => h("li", null, p))),
      h("p", { class: "muted" }, "For a local chain, run ", h("code", null, "pnpm dev:chain"), " and it writes the file for you."),
    ),
  );
}

function start(config: AppConfig): void {
  let wallet: App["wallet"];
  const listeners = new Set<() => void>();
  const walletButton = h("button", { class: "btn quiet small", type: "button" }, "Connect wallet");
  const walletNote = h("span", { class: "small bad", role: "status" });

  const app: App = {
    config,
    client: makePublicClient(config),
    store: new PendingStore(safeStorage()),
    get wallet() {
      return wallet;
    },
    async connect() {
      const provider = (window as unknown as { ethereum?: Eip1193 & { on?: (event: string, cb: () => void) => void } }).ethereum;
      if (!provider) throw new Error("No wallet found. Install a browser wallet such as MetaMask or Rabby, then reload.");
      wallet = await connectWallet(provider, config);
      provider.on?.("accountsChanged", () => location.reload());
      provider.on?.("chainChanged", () => location.reload());
      walletButton.textContent = shortAddress(wallet.account);
      walletButton.disabled = true;
      fill(walletNote);
      for (const l of listeners) l();
    },
    onWallet(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  walletButton.addEventListener("click", () => {
    app.connect().catch((e: unknown) => fill(walletNote, e instanceof Error ? e.message : "Could not connect."));
  });

  const link = (hash: string, label: string) => h("a", { href: hash, "data-route": hash }, label);
  const nav = h("nav", { class: "nav", "aria-label": "Pages" }, link("#/", "Solve"), link("#/gallery", "Gallery"));
  const view = h("main", { class: "shell" });

  fill(
    root,
    h(
      "header",
      { class: "shell top" },
      h("a", { class: "brand", href: "#/", "aria-label": "Proofkin home" }, brandMark(), "proofkin"),
      nav,
      h("span", { class: "spacer" }),
      walletNote,
      h("span", { class: "chain" }, CHAIN_LABEL[config.name]),
      walletButton,
    ),
    view,
  );

  let unmount: (() => void) | undefined;
  const route = () => {
    unmount?.();
    const gallery = location.hash.startsWith("#/gallery");
    for (const a of nav.querySelectorAll("a")) {
      if (a.dataset.route === (gallery ? "#/gallery" : "#/")) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    fill(view);
    unmount = gallery ? mountGallery(view, app) : mountSolve(view, app);
  };
  window.addEventListener("hashchange", route);
  route();
}

function brandMark(): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("width", "26");
  svg.setAttribute("height", "26");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M7 24 16 7l9 17");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  svg.append(path);
  for (const [x, y] of [[7, 24], [16, 7], [25, 24]] as const) {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(y));
    c.setAttribute("r", "3.2");
    c.setAttribute("fill", "currentColor");
    svg.append(c);
  }
  return svg;
}

/** localStorage can throw (blocked cookies, private windows): then commits live in memory only, and the page says so. */
function safeStorage(): Storage | undefined {
  try {
    const probe = "proofkin:probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return undefined;
  }
}

const parsed = parseConfig(import.meta.env as Record<string, string | undefined>);
if (parsed.ok) start(parsed.config);
else showSetupProblems(parsed.problems);
