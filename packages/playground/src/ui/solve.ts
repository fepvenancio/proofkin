// The solve page: read the puzzle, write the program, test it, watch it drawn, mint it.
import { type Analysis, analyze, skeletonFor } from "../analyze.ts";
import { type CollectionState, checkProgram, type ProgramStatus, previewSvg, readCollection } from "../chain.ts";
import { describeTrial, formatDuration, formatEth, labelledInputs, slotsLeft } from "../format.ts";
import { type LocalTestReport, randomSeed, runLocalTest } from "../localTest.ts";
import { friendlyError, type MintDeps, prepareCommit, reconcile, sendCommit, sendReveal } from "../mint.ts";
import { mintGate } from "../mintGate.ts";
import { etaSeconds, REVEAL_DELAY, revealPhase } from "../phase.ts";
import { gridDiagramSvg, PUZZLE_HUES, PUZZLE_INFO } from "../puzzleInfo.ts";
import type { PendingCommit } from "../storage.ts";
import type { App } from "./app.ts";
import { type Child, fill, h, svgDataUri, trustedSvg } from "./dom.ts";

const OPERATIONS: [string, string][] = [
  ["IN n", "The input in slot n."],
  ["CONST n", "The number n, from 0 to 65535."],
  ["ADD a b", "a + b. Fails if the result is above 4294967295."],
  ["SUB a b", "a − b. Fails if b is larger than a."],
  ["MUL a b", "a × b. Fails if the result is above 4294967295."],
  ["DIV a b", "a ÷ b, rounded down. Fails if b is 0."],
  ["MIN a b", "The smaller of the two."],
  ["MAX a b", "The larger of the two."],
  ["LT a b", "1 if a < b, otherwise 0."],
  ["EQ a b", "1 if a = b, otherwise 0."],
  ["AND a b", "1 if neither is 0, otherwise 0."],
  ["OR a b", "1 if either is not 0, otherwise 0."],
  ["SEL c x y", "x if c is not 0, otherwise y. Both x and y are computed first."],
];

const draftKey = (puzzleId: number) => `proofkin:draft:v1:${puzzleId}`;
const PUZZLE_KEY = "proofkin:puzzle:v1";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // drafts are a convenience; losing one is not worth an error
  }
}

type LocalState = { status: "notRun" } | { status: "pass" | "fail"; report: LocalTestReport };

export function mountSolve(root: HTMLElement, app: App): () => void {
  const { config, client } = app;
  const disposers: (() => void)[] = [];
  let disposed = false;

  // ------------------------------------------------------------------- state
  const saved = Number(read(PUZZLE_KEY));
  let puzzleId = Number.isInteger(saved) && saved >= 0 && saved < PUZZLE_INFO.length ? saved : 0;
  let text = read(draftKey(puzzleId)) ?? skeletonFor(puzzleId);
  let analysis: Analysis = analyze(text);
  let local: LocalState = { status: "notRun" };
  let onChain: ProgramStatus | "unknown" = "unknown";
  let collection: CollectionState | undefined;
  let collectionError: string | undefined;
  const preview = { seed: randomSeed(), src: undefined as string | undefined, error: undefined as string | undefined, busy: false };
  let active: PendingCommit | undefined;
  let blockNumber: number | undefined;
  let busy = false;
  let notice: string | undefined;
  let stopWatching: (() => void) | undefined;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshes = 0;

  // ---------------------------------------------------------------- elements
  const tabs = h("ul", { class: "puzzles", role: "tablist", "aria-label": "Puzzles" });
  const statement = h("section", { class: "statement" });
  const textarea = h("textarea", { class: "code", id: "program", spellcheck: false, autocomplete: "off", autocapitalize: "off", "aria-label": "Your program" });
  textarea.value = text;
  const status = h("p", { class: "status", role: "status" });
  const creature = h("div", { class: "creature" });
  const under = h("div", { class: "under" });
  const testBlock = h("section", { class: "block", "aria-label": "Local test" });
  const mintBlock = h("section", { class: "block", "aria-label": "Mint" });

  const startOver = h("button", { class: "btn quiet small", type: "button" }, "Start over");
  startOver.addEventListener("click", () => {
    if (!window.confirm("Replace your program with the starting point for this puzzle?")) return;
    text = skeletonFor(puzzleId);
    textarea.value = text;
    changed();
  });

  root.append(
    h(
      "div",
      { class: "solve" },
      h(
        "div",
        null,
        tabs,
        statement,
        h("section", { class: "editor" }, h("div", { class: "editor-head" }, h("h2", null, "Your program"), startOver), textarea, status, operationsReference()),
        testBlock,
        mintBlock,
      ),
      // Only the creature stays in view while the page scrolls: it is what the editing is for.
      h("aside", { class: "specimen", "aria-label": "Preview" }, creature, under),
    ),
  );

  // ------------------------------------------------------------------ puzzle
  function renderTabs(): void {
    fill(
      tabs,
      ...PUZZLE_INFO.map((p) => {
        const tab = h("button", { type: "button", role: "tab", "aria-selected": p.id === puzzleId, style: `--h: ${PUZZLE_HUES[p.id]}` }, p.name);
        tab.addEventListener("click", () => selectPuzzle(p.id));
        return h("li", { role: "presentation" }, tab);
      }),
    );
  }

  function renderStatement(): void {
    const info = PUZZLE_INFO[puzzleId]!;
    const slots = (items: { label: string; range?: string }[]) =>
      h("span", { class: "slots" }, ...items.map((i) => h("span", { class: "slot" }, i.label, i.range ? h("i", null, ` ${i.range}`) : null)));
    fill(
      statement,
      h("h1", null, info.name),
      h("p", { class: "lede" }, info.summary),
      h(
        "dl",
        { class: "facts" },
        h("dt", null, "Inputs"),
        h("dd", null, slots(info.inputs.map((s, i) => ({ label: `${i} ${s.label}`, range: `${s.lo}–${s.hi}` })))),
        h("dt", null, info.outputs.length === 1 ? "Answer" : "Answers"),
        h("dd", null, info.outputs.length === 1 ? info.outputs[0] : slots(info.outputs.map((o, i) => ({ label: `${i} ${o}` })))),
        h("dt", null, "The rule"),
        h("dd", null, info.rule),
        h("dt", null, "Edge cases"),
        h("dd", null, "Every program is tried on these fixed cases, whatever the seed, as well as random ones:", h("ol", { class: "cases" }, ...info.edgeCases.map((c) => h("li", null, c)))),
        puzzleId === 3 ? h("dt", null, "Edge numbers") : null,
        puzzleId === 3
          ? h("dd", null, "Inputs 0 to 5 are the horizontal edges row by row, inputs 6 to 11 the vertical edges row by row.", h("div", { class: "diagram" }, trustedSvg(gridDiagramSvg())))
          : null,
      ),
    );
  }

  function selectPuzzle(id: number): void {
    write(draftKey(puzzleId), text);
    puzzleId = id;
    write(PUZZLE_KEY, String(id));
    text = read(draftKey(id)) ?? skeletonFor(id);
    textarea.value = text;
    document.body.style.setProperty("--hue", String(PUZZLE_HUES[id]));
    renderTabs();
    renderStatement();
    changed();
  }

  // ------------------------------------------------------------------ editor
  function changed(): void {
    analysis = analyze(text);
    local = { status: "notRun" };
    onChain = "unknown";
    write(draftKey(puzzleId), text);
    renderStatus();
    renderTest();
    renderMint();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void refreshProgram(), 350);
  }

  textarea.addEventListener("input", () => {
    text = textarea.value;
    changed();
  });

  function renderStatus(): void {
    status.className = `status ${analysis.ok ? "good" : "bad"}`;
    if (analysis.ok) {
      fill(status, `${analysis.nodeCount} node${analysis.nodeCount === 1 ? "" : "s"}, depth ${analysis.depth}. The program is valid.`);
      return;
    }
    const where = analysis.line;
    const goTo = where
      ? h("button", { class: "link", type: "button" }, `line ${where}`)
      : null;
    goTo?.addEventListener("click", () => {
      const lines = text.split("\n");
      const start = lines.slice(0, where! - 1).reduce((n, l) => n + l.length + 1, 0);
      textarea.focus();
      textarea.setSelectionRange(start, start + (lines[where! - 1]?.length ?? 0));
    });
    fill(status, goTo ? h("span", null, goTo, ": ") : null, analysis.message);
  }

  // ----------------------------------------------------------------- preview
  async function refreshProgram(): Promise<void> {
    const current = analysis;
    if (!current.ok) {
      preview.src = undefined;
      preview.error = undefined;
      renderCreature();
      return;
    }
    const mine = ++refreshes;
    preview.busy = true;
    renderCreature();
    const [svg, check] = await Promise.allSettled([previewSvg(client, config, current.hex, preview.seed), checkProgram(client, config, current.hex)]);
    if (disposed || mine !== refreshes) return;
    preview.busy = false;
    if (svg.status === "fulfilled") {
      preview.src = svgDataUri(svg.value);
      preview.error = undefined;
    } else {
      preview.error = friendlyError(svg.reason);
    }
    onChain = check.status === "fulfilled" ? check.value : "unknown";
    renderCreature();
    renderMint();
  }

  function renderCreature(): void {
    creature.dataset.busy = String(preview.busy);
    if (!analysis.ok) {
      fill(creature, h("div", { class: "note" }, "Fix the program and it will be drawn here."));
    } else if (preview.src) {
      fill(creature, h("img", { src: preview.src, alt: "Your program, drawn by the contract's renderer" }));
    } else {
      fill(creature, h("div", { class: "note" }, preview.error ?? "Drawing…"));
    }

    const reroll = h("button", { class: "btn quiet small", type: "button" }, "New seed");
    reroll.addEventListener("click", () => {
      preview.seed = randomSeed();
      void refreshProgram();
    });
    fill(
      under,
      analysis.ok ? h("span", null, `Drawn from a random seed; the token's own seed comes from its commit.`) : null,
      reroll,
    );
    if (analysis.ok) under.append(h("code", { title: preview.seed }, `${preview.seed.slice(0, 10)}…`));
  }

  // -------------------------------------------------------------- local test
  function renderTest(): void {
    const run = h("button", { class: "btn quiet small", type: "button", disabled: !analysis.ok }, "Run test");
    run.addEventListener("click", () => {
      if (!analysis.ok) return;
      const report = runLocalTest(analysis.program);
      local = { status: report.status, report };
      renderTest();
      renderMint();
    });

    let body: Child = h("p", { class: "muted" }, analysis.ok ? `Runs your program on the ${PUZZLE_INFO[puzzleId]!.edgeCases.length} fixed edge cases and 100 random ones.` : "Fix the program first.");
    if (local.status === "pass" && local.report.status === "pass") {
      body = h(
        "div",
        null,
        h("p", { class: "good" }, `Passed all ${local.report.cases} cases.`),
        h("p", { class: "muted small" }, `Seed ${local.report.seed.slice(0, 10)}…. The contract draws its own 8 random cases when you reveal, so this is a rehearsal, not a guarantee.`),
      );
    } else if (local.status === "fail" && local.report.status === "fail") {
      const f = local.report.failure;
      body = h(
        "div",
        null,
        h("p", { class: "bad" }, `Failed ${describeTrial(puzzleId, f.trial)}.`),
        h(
          "dl",
          { class: "case" },
          h("dt", null, "Inputs"),
          h("dd", null, labelledInputs(puzzleId, f.inputs).map((i) => `${i.label}=${i.value}`).join("  ")),
          h("dt", null, "Expected"),
          h("dd", null, f.expected.join(", ")),
          h("dt", null, "Got"),
          h("dd", null, f.got ? f.got.join(", ") : "an arithmetic failure: an overflow, an underflow or a division by zero"),
        ),
      );
    }
    fill(testBlock, h("div", { class: "row" }, h("h2", null, "Test locally"), run), body);
  }

  // --------------------------------------------------------------------- mint
  const mintDeps = (): MintDeps => ({ publicClient: client, walletClient: app.wallet!.walletClient, config, store: app.store });

  async function refreshCollection(): Promise<void> {
    try {
      collection = await readCollection(client, config);
      collectionError = undefined;
    } catch {
      collectionError = `Cannot reach the node at ${config.rpcUrl}.`;
    }
    if (!disposed) renderMint();
  }

  function stopBlocks(): void {
    stopWatching?.();
    stopWatching = undefined;
  }

  function watchBlocks(): void {
    stopBlocks();
    stopWatching = client.watchBlockNumber({
      emitOnBegin: true,
      pollingInterval: config.pollingIntervalMs,
      onBlockNumber: (n) => {
        blockNumber = Number(n);
        // A new block changes only the countdown. Rebuilding the panel would replace the button under the
        // pointer, and a click that straddles a block would be lost.
        if (shape() !== renderedShape) renderMint();
        else updateCountdowns();
      },
      onError: () => {},
    });
  }

  async function guarded(work: () => Promise<void>): Promise<void> {
    busy = true;
    notice = undefined;
    renderMint();
    try {
      await work();
    } catch (e) {
      notice = friendlyError(e);
    } finally {
      busy = false;
      if (!disposed) renderMint();
    }
  }

  const commit = () =>
    guarded(async () => {
      if (!analysis.ok || !app.wallet) return;
      const deps = mintDeps();
      active = await prepareCommit(deps, { program: analysis.hex, puzzleId: analysis.puzzleId, nodeCount: analysis.nodeCount });
      renderMint();
      active = await sendCommit(deps, active);
      watchBlocks();
    });

  const sendPrepared = () =>
    guarded(async () => {
      if (!active) return;
      active = await sendCommit(mintDeps(), active);
      watchBlocks();
    });

  const reveal = () =>
    guarded(async () => {
      if (!active) return;
      active = await sendReveal(mintDeps(), active);
      stopBlocks();
      void refreshCollection();
    });

  const resume = (p: PendingCommit) =>
    guarded(async () => {
      if (p.puzzleId !== puzzleId) selectPuzzle(p.puzzleId); // the page follows the commit it is continuing
      active = await reconcile(mintDeps(), p);
      if (active.status === "committed") watchBlocks();
    });

  function leave(): void {
    stopBlocks();
    active = undefined;
    notice = undefined;
    renderMint();
  }

  function forget(p: PendingCommit): void {
    const sure = window.confirm("This deletes the saved salt. If the commit was already sent, it can never be revealed without it. Forget it?");
    if (!sure) return;
    app.store.remove(p.hash);
    if (active?.hash === p.hash) leave();
    else renderMint();
  }

  function currentGate() {
    return mintGate({
      analysis: analysis.ok ? "ok" : "invalid",
      localTest: local.status,
      wallet: app.wallet ? "connected" : "none",
      network: "right", // connecting switches the wallet to the configured chain
      onChain: analysis.ok ? onChain : "unknown",
      busy,
    });
  }

  /** Everything that decides which controls the mint panel shows, except the block number. */
  function shape(): string {
    const phase = active?.commitBlock !== undefined && blockNumber !== undefined ? revealPhase(active.commitBlock, blockNumber) : undefined;
    return [active?.hash, active?.status, phase?.phase, busy, notice].join("|");
  }
  let renderedShape = "";
  const live: { wait?: HTMLElement; ready?: HTMLElement } = {};

  const eta = (blocks: number) => formatDuration(etaSeconds(blocks, config.blockTimeSeconds));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const waitLine = (blocks: number) => `${plural(blocks, "more block")} to go (${eta(blocks)}).`;
  const readyLine = (blocksLeft: number) =>
    blocksLeft === 0 ? "Send it now: this is the last block it can land in." : `Send it within ${plural(blocksLeft, "block")} (${eta(blocksLeft)}).`;

  function updateCountdowns(): void {
    if (active?.commitBlock === undefined || blockNumber === undefined) return;
    const phase = revealPhase(active.commitBlock, blockNumber);
    if (phase.phase === "waiting" && live.wait) live.wait.textContent = waitLine(phase.blocksUntilReady);
    if (phase.phase === "ready" && live.ready) live.ready.textContent = readyLine(phase.blocksLeft);
  }

  function renderMint(): void {
    renderedShape = shape();
    live.wait = undefined;
    live.ready = undefined;
    // The panel describes the commit in flight when there is one, whichever puzzle's tab is open.
    const mintId = active?.puzzleId ?? puzzleId;
    const info = PUZZLE_INFO[mintId]!;
    const best = collection?.bestNodes[mintId];
    const unfinished = app.wallet
      ? app.store.list({ chainId: config.chain.id, contract: config.proofkin, account: app.wallet.account }).filter((p) => p.status !== "revealed" && p.hash !== active?.hash)
      : [];

    const facts = h(
      "dl",
      { class: "facts-mint" },
      h("dt", null, "Price"),
      h("dd", null, collection ? formatEth(collection.mintPrice) : "…"),
      h("dt", null, `${info.name} slots left`),
      h("dd", null, collection ? `${slotsLeft(collection.solvedCount[mintId]!)} of 50` : "…"),
      h("dt", null, "Smallest solution"),
      h("dd", null, collection ? (best === 255 ? "none yet" : `${best} nodes`) : "…"),
    );

    const stepper = active ? renderSteps(active) : undefined;
    let action: Child = null;
    if (!active) {
      if (!app.wallet) {
        const connect = h("button", { class: "btn", type: "button" }, "Connect wallet");
        connect.addEventListener("click", () => {
          app.connect().catch((e: unknown) => {
            notice = e instanceof Error ? e.message : "Could not connect.";
            renderMint();
          });
        });
        action = h("div", { class: "row" }, connect, h("span", { class: "muted small" }, "to mint"));
      } else {
        const gate = currentGate();
        const go = h("button", { class: "btn", type: "button", disabled: !gate.enabled }, busy ? "Working…" : "Commit solution");
        go.addEventListener("click", () => void commit());
        action = h(
          "div",
          null,
          h("div", { class: "row" }, go, gate.enabled ? null : h("span", { class: "muted small" }, gate.reason)),
          h("p", { class: "muted small" }, `Minting takes two transactions: a commit, then a reveal at least ${REVEAL_DELAY + 1} blocks later (${formatDuration(etaSeconds(REVEAL_DELAY + 1, config.blockTimeSeconds))}).`),
        );
      }
    }

    fill(
      mintBlock,
      h("h2", null, "Mint"),
      collectionError ? h("p", { class: "bad small" }, collectionError) : null,
      facts,
      action,
      stepper,
      notice ? h("p", { class: "bad", role: "alert" }, notice) : null,
      unfinished.length > 0
        ? h(
            "div",
            { style: "margin-top: 22px" },
            h("h3", { style: "font-size: 18px" }, "Unfinished mints"),
            h(
              "ul",
              { class: "list" },
              ...unfinished.map((p) => {
                const go = h("button", { class: "btn quiet small", type: "button" }, "Continue");
                go.addEventListener("click", () => void resume(p));
                const drop = h("button", { class: "link small", type: "button" }, "Forget");
                drop.addEventListener("click", () => forget(p));
                return h("li", null, h("span", null, `${PUZZLE_INFO[p.puzzleId]?.name ?? "Puzzle"}, ${p.nodeCount} nodes: ${p.status === "prepared" ? "saved, not yet sent" : "committed"}`), go, drop);
              }),
            ),
          )
        : null,
    );
  }

  type Step = { title: string; state: "done" | "current" | "todo"; body: Child[] };

  function renderSteps(p: PendingCommit): Node {
    const phase = p.commitBlock !== undefined && blockNumber !== undefined ? revealPhase(p.commitBlock, blockNumber) : undefined;
    const committed = p.status !== "prepared";
    const revealed = p.status === "revealed";
    const copy = h("button", { class: "btn quiet small", type: "button" }, "Copy salt");
    copy.addEventListener("click", () => {
      void navigator.clipboard?.writeText(p.salt).then(() => fill(copy, "Copied"));
    });

    const sendBtn = h("button", { class: "btn small", type: "button", disabled: busy }, "Send commit");
    sendBtn.addEventListener("click", () => void sendPrepared());

    const revealBtn = h("button", { class: "btn small", type: "button", disabled: busy }, `Reveal and mint for ${collection ? formatEth(collection.mintPrice) : "the mint price"}`);
    revealBtn.addEventListener("click", () => void reveal());

    const startAgain = h("button", { class: "btn quiet small", type: "button" }, "Start over");
    startAgain.addEventListener("click", leave);

    const steps: Step[] = [
      {
        title: "Salt saved",
        state: "done",
        body: [
          h("p", null, app.store.persistent ? "Kept in this browser." : "This browser would not let the page store it, so copy it now.", " Without this salt the commit can never be revealed."),
          h("div", { class: "salt" }, p.salt),
          h("div", { class: "row", style: "margin-top: 8px" }, copy),
        ],
      },
      {
        title: "Commit",
        state: committed ? "done" : "current",
        body: committed ? [h("p", null, `Committed in block ${p.commitBlock}.`)] : [busy ? h("p", null, "Confirm the transaction in your wallet…") : sendBtn],
      },
      {
        title: `Wait ${REVEAL_DELAY + 1} blocks`,
        state: !committed ? "todo" : revealed || phase?.phase !== "waiting" ? (phase ? "done" : "current") : "current",
        body: phase?.phase === "waiting" ? [(live.wait = h("p", null, waitLine(phase.blocksUntilReady)))] : committed && !phase ? [h("p", null, "Checking the chain…")] : [],
      },
      {
        title: "Reveal and mint",
        state: revealed ? "done" : !committed || !phase || phase.phase === "waiting" ? "todo" : "current",
        body: revealed
          ? [h("p", null, "Revealed.")]
          : phase?.phase === "ready"
            ? [busy ? h("p", null, "Confirm the transaction in your wallet…") : revealBtn, (live.ready = h("p", { class: "muted" }, readyLine(phase.blocksLeft)))]
            : phase?.phase === "expired"
              ? [h("p", { class: "bad" }, "The 250-block window for this commit has closed. Commit again with a new salt."), startAgain]
              : [],
      },
    ];
    if (revealed) {
      steps.push({
        title: `Token #${p.tokenId ?? "?"} is yours`,
        state: "done",
        body: [h("p", null, h("a", { href: "#/gallery" }, "See it in the gallery"), "  ", h("button", { class: "link", type: "button", onclick: leave }, "Mint another"))],
      });
    }

    return h(
      "ol",
      { class: "steps" },
      ...steps.map((s) => h("li", { "data-state": s.state }, h("div", null, h("h3", null, s.title), ...s.body))),
    );
  }

  // ------------------------------------------------------------------- start
  document.body.style.setProperty("--hue", String(PUZZLE_HUES[puzzleId]));
  renderTabs();
  renderStatement();
  renderStatus();
  renderCreature();
  renderTest();
  renderMint();
  void refreshCollection();
  void refreshProgram();
  disposers.push(
    app.onWallet(() => {
      renderMint();
    }),
  );

  return () => {
    disposed = true;
    clearTimeout(previewTimer);
    stopBlocks();
    for (const d of disposers) d();
  };
}

function operationsReference(): HTMLElement {
  return h(
    "details",
    { class: "ref" },
    h("summary", null, "The thirteen operations"),
    h("p", { class: "muted small", style: "margin: 10px 0 0" }, "One node per line, written  name = OP operands, where an operand is the name of an earlier node. The last line is  out  followed by one node per answer slot."),
    h("table", null, h("tbody", null, ...OPERATIONS.map(([op, what]) => h("tr", null, h("td", null, op), h("td", { class: "muted" }, what))))),
  );
}
