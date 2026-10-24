// The gallery: every token, newest first, and a leaderboard per puzzle.
import { type LeaderboardEntry, PUZZLE_HUES, PUZZLE_INFO, type TokenView, fetchSolved, fetchToken, leaderboards, ordinal, readCollection, shortAddress } from "@proofkin/core";
import type { App } from "./app.ts";
import { fill, h } from "./dom.ts";

const BATCH = 12;

const traitOf = (view: TokenView, trait: string) => view.attributes.find((a) => a.trait === trait)?.value;

export function mountGallery(root: HTMLElement, app: App): () => void {
  const { config, client } = app;
  let disposed = false;

  const savedPuzzle = Number((() => { try { return localStorage.getItem("proofkin:puzzle:v1"); } catch { return null; } })());
  let boardPuzzle = Number.isInteger(savedPuzzle) && savedPuzzle >= 0 && savedPuzzle < PUZZLE_INFO.length ? savedPuzzle : 0;
  document.body.style.setProperty("--hue", String(PUZZLE_HUES[boardPuzzle]));

  let total = 0;
  let shown = 0;
  let boards: LeaderboardEntry[][] | undefined;
  let boardError: string | undefined;
  const views = new Map<number, TokenView | "error">();
  const cards = new Map<number, HTMLElement>();

  const summary = h("p", { class: "muted" }, "Loading…");
  const grid = h("div", { class: "grid" });
  const more = h("button", { class: "btn quiet", type: "button", hidden: true }, "Show more");
  const boardTabs = h("ul", { class: "puzzles", role: "tablist", "aria-label": "Leaderboard puzzle" });
  const boardBody = h("div");
  const dialog = h("dialog", { "aria-label": "Token" });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  root.append(
    h(
      "div",
      { class: "gallery" },
      h("section", null, h("h1", null, "Gallery"), summary, grid, h("div", { style: "margin-top: 30px" }, more)),
      h("aside", { class: "board", "aria-label": "Leaderboard" }, h("h2", null, "Smallest solutions"), boardTabs, boardBody),
    ),
    dialog,
  );

  // ------------------------------------------------------------------ tokens
  function openDetail(id: number): void {
    const view = views.get(id);
    if (!view || view === "error") return;
    const close = h("button", { class: "btn quiet small", type: "button" }, "Close");
    close.addEventListener("click", () => dialog.close());
    fill(
      dialog,
      h(
        "div",
        { class: "detail" },
        h("img", { src: view.imageSrc, alt: view.name }),
        h(
          "div",
          null,
          h("h2", null, view.name),
          h("p", { class: "muted" }, view.description),
          h("dl", null, ...view.attributes.flatMap((a) => [h("dt", null, a.trait), h("dd", null, String(a.value))])),
          close,
        ),
      ),
    );
    dialog.showModal();
  }

  function card(id: number): HTMLElement {
    let el = cards.get(id);
    if (!el) {
      el = h("button", { class: "token", type: "button", "aria-label": `Token ${id}` }, h("div", { class: "blank" }), h("strong", null, `Proofkin #${id}`), h("span", null, "Loading…"));
      el.addEventListener("click", () => openDetail(id));
      cards.set(id, el);
    }
    return el;
  }

  function fillCard(id: number): void {
    const el = card(id);
    const view = views.get(id);
    if (!view) return;
    if (view === "error") {
      fill(el, h("div", { class: "blank" }), h("strong", null, `Proofkin #${id}`), h("span", null, "Could not load this token."));
      return;
    }
    const puzzle = traitOf(view, "Puzzle");
    const nodes = traitOf(view, "Nodes");
    fill(
      el,
      h("img", { src: view.imageSrc, alt: view.name, loading: "lazy" }),
      h("strong", null, view.name),
      h("span", null, `${puzzle}, ${nodes} nodes${traitOf(view, "Optimal") === "Yes" ? ", smallest so far" : ""}`),
    );
  }

  async function showMore(): Promise<void> {
    const ids: number[] = [];
    while (ids.length < BATCH && shown < total) ids.push(total - shown++);
    for (const id of ids) grid.append(card(id));
    more.hidden = shown >= total;
    await Promise.all(
      ids.map(async (id) => {
        try {
          views.set(id, await fetchToken(client, config, id));
        } catch {
          views.set(id, "error");
        }
        if (!disposed) fillCard(id);
      }),
    );
  }
  more.addEventListener("click", () => void showMore());

  // ------------------------------------------------------------- leaderboard
  function renderBoard(): void {
    fill(
      boardTabs,
      ...PUZZLE_INFO.map((p) => {
        const tab = h("button", { type: "button", role: "tab", "aria-selected": p.id === boardPuzzle, style: `--h: ${PUZZLE_HUES[p.id]}` }, p.name);
        tab.addEventListener("click", () => {
          boardPuzzle = p.id;
          document.body.style.setProperty("--hue", String(PUZZLE_HUES[p.id]));
          renderBoard();
        });
        return h("li", { role: "presentation" }, tab);
      }),
    );

    if (boardError) return fill(boardBody, h("p", { class: "bad small" }, boardError));
    if (!boards) return fill(boardBody, h("p", { class: "muted" }, "Loading…"));

    const entries = boards[boardPuzzle]!;
    if (entries.length === 0) {
      return fill(boardBody, h("p", { class: "muted" }, `Nobody has solved ${PUZZLE_INFO[boardPuzzle]!.name} yet. The first solution sets the record.`));
    }
    fill(
      boardBody,
      h(
        "table",
        null,
        h("thead", null, h("tr", null, ...["Nodes", "Token", "Solver", "Solved"].map((t) => h("th", null, t)))),
        h(
          "tbody",
          null,
          ...entries.map((e) =>
            h(
              "tr",
              null,
              h("td", { class: `num ${e.holdsRecord ? "best" : ""}` }, e.nodeCount),
              h("td", null, `#${e.tokenId}`),
              h("td", { class: "num", title: e.author }, shortAddress(e.author)),
              h("td", null, `${ordinal(e.rank)}`),
            ),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------------- start
  renderBoard();
  void (async () => {
    try {
      total = Number((await readCollection(client, config)).totalSupply);
    } catch {
      fill(summary, `Cannot reach the node at ${config.rpcUrl}.`);
      summary.className = "bad";
      return;
    }
    if (disposed) return;
    if (total === 0) {
      fill(summary, "Nothing has been minted yet.", " ", h("a", { href: "#/" }, "Solve a puzzle"), " and yours will be the first.");
    } else {
      fill(summary, `${total} token${total === 1 ? "" : "s"}, newest first.`);
      void showMore();
    }
  })();

  void fetchSolved(client, config)
    .then((rows) => {
      if (disposed) return;
      boards = leaderboards(rows);
      if (rows.length < total) boardError = `The leaderboard only knows ${rows.length} of ${total} solutions: the deploy block in the page's configuration is probably too late.`;
      renderBoard();
    })
    .catch(() => {
      boardError = "Could not read the solutions from the node.";
      if (!disposed) renderBoard();
    });

  return () => {
    disposed = true;
    if (dialog.open) dialog.close();
  };
}
