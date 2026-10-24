import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { analyze, programHash, skeletonFor } from "@proofkin/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SolveIsland } from "@/features/solve/SolveIsland";

// `publicEnv` is read once, when `@/config/env` is first imported, so the variables must exist before the imports run.
vi.hoisted(() => {
  const settings = {
    NEXT_PUBLIC_CHAIN: "baseSepolia",
    NEXT_PUBLIC_PROOFKIN: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NEXT_PUBLIC_RENDERER: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
});

// The node is the one thing faked: a client whose reads answer from a script.
const reader = vi.hoisted(() => ({ readContract: vi.fn() }));
vi.mock("wagmi", () => ({ usePublicClient: () => reader }));

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
// The tests run in the package's own directory.
const sort8 = readFileSync(resolve(process.cwd(), "../../fixtures/solutions/SORT8.pk"), "utf8");
const BROKEN = "puzzle SORT8\nvalue = BOGUS 1\nout value\n";

/** What the chain says: it draws SVG, the program is free to mint, and no puzzle is full. */
function chainSays({
  minted = false,
  mintedHash,
  render: draw,
}: { minted?: boolean; mintedHash?: string; render?: () => Promise<string> } = {}) {
  reader.readContract.mockImplementation(async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
    if (functionName === "render") return (draw ?? (async () => SVG))();
    if (functionName === "seen") return mintedHash === undefined ? minted : args?.[0] === mintedHash;
    return 0n; // solvedCount
  });
}

const open = (puzzleId = 2) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SolveIsland puzzleId={puzzleId}>
        <p>The statement</p>
      </SolveIsland>
    </QueryClientProvider>,
  );
};

const editor = () => screen.getByRole("textbox", { name: "Your program" }) as HTMLTextAreaElement;
const ready = () => waitFor(() => expect(editor()).not.toHaveAttribute("readonly"));
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } });
const rendered = () => reader.readContract.mock.calls.filter(([call]) => call.functionName === "render");

describe("the solve island", () => {
  beforeEach(() => {
    window.localStorage.clear();
    chainSays();
  });
  afterEach(() => window.localStorage.clear());

  describe("on the server", () => {
    const html = () =>
      renderToString(
        <SolveIsland puzzleId={2}>
          <p>The statement</p>
        </SolveIsland>,
      );

    it("sends the statement and the puzzle's starting point, never a saved draft, so the browser agrees with it", () => {
      window.localStorage.setItem("proofkin:draft:v1:2", sort8);
      const markup = html();
      expect(markup).toContain("The statement");
      expect(markup).toContain("puzzle SORT8");
      expect(markup).not.toContain("Batcher odd-even merge sort"); // a line of the saved solution
      expect(markup).toMatch(/readonly/i); // React writes readOnly=""
    });

    it("sends only the frame of the workbench: the test and the preview need a browser", () => {
      const markup = html();
      expect(markup).not.toContain("Test locally");
      expect(markup).not.toContain("Run test");
      expect(markup).toContain("Drawing…");
    });

    it("chooses no random seed, which would differ from the browser's", () => {
      expect(html()).not.toContain("random seed");
    });
  });

  it("shows the statement it was given", async () => {
    open();
    expect(screen.getByText("The statement")).toBeInTheDocument();
    await ready();
  });

  it("starts from the puzzle's starting point", async () => {
    open();
    await ready();
    expect(editor()).toHaveValue(skeletonFor(2));
  });

  it("brings back what was written for this puzzle, and not for another", async () => {
    window.localStorage.setItem("proofkin:draft:v1:2", sort8);
    window.localStorage.setItem("proofkin:draft:v1:3", "puzzle GRID_PATH\n");
    open(2);
    await ready();
    expect(editor()).toHaveValue(sort8);
  });

  it("keeps a saved draft when the page opens, rather than replacing it with the starting point", async () => {
    window.localStorage.setItem("proofkin:draft:v1:2", sort8);
    open();
    expect(window.localStorage.getItem("proofkin:draft:v1:2")).toBe(sort8);
    await ready();
    expect(window.localStorage.getItem("proofkin:draft:v1:2")).toBe(sort8);
  });

  it("says how big a valid program is, and keeps what was typed for next time", async () => {
    open();
    await ready();
    type(sort8);
    expect(screen.getByText("46 nodes, depth 6. The program is valid.")).toBeInTheDocument();
    expect(window.localStorage.getItem("proofkin:draft:v1:2")).toBe(sort8);
  });

  it("points at the line of a program that does not assemble", async () => {
    open();
    await ready();
    type(BROKEN);
    expect(screen.getByRole("button", { name: "line 2" })).toBeInTheDocument();
    expect(screen.getByText("Fix the program and it will be drawn here.")).toBeInTheDocument();
  });

  it("starts over from the starting point when asked and confirmed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    open();
    await ready();
    type(sort8);
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(editor()).toHaveValue(skeletonFor(2));
    expect(window.localStorage.getItem("proofkin:draft:v1:2")).toBe(skeletonFor(2));
    confirm.mockRestore();
  });

  describe("the local test", () => {
    it("passes the real solution", async () => {
      open();
      await ready();
      type(sort8);
      fireEvent.click(screen.getByRole("button", { name: "Run test" }));
      expect(screen.getByText(/^Passed all \d+ cases\.$/)).toBeInTheDocument();
    });

    it("fails the starting point, on the case it gets wrong", async () => {
      open();
      await ready();
      fireEvent.click(screen.getByRole("button", { name: "Run test" }));
      expect(screen.getByRole("alert")).toHaveTextContent(/^Failed the second edge case/);
    });

    it("forgets its result as soon as the program changes, since it was about the old one", async () => {
      open();
      await ready();
      type(sort8);
      fireEvent.click(screen.getByRole("button", { name: "Run test" }));
      expect(screen.getByText(/^Passed all/)).toBeInTheDocument();
      type(`${sort8}\n# a change`);
      expect(screen.queryByText(/^Passed all/)).not.toBeInTheDocument();
      expect(screen.getByText(/^Runs your program on the 4 fixed edge cases/)).toBeInTheDocument();
    });

    it("cannot be run on a program that is not valid", async () => {
      open();
      await ready();
      type(BROKEN);
      expect(screen.getByRole("button", { name: "Run test" })).toBeDisabled();
    });
  });

  describe("the preview", () => {
    it("draws the program through the contract's renderer, from a random seed", async () => {
      open();
      await ready();
      type(sort8);
      expect(await screen.findByRole("img", { name: /drawn by the contract's renderer/ })).toBeInTheDocument();
      const [{ args }] = rendered().at(-1)!;
      expect(args[0]).toMatch(/^0x[0-9a-f]+$/);
      expect(args[1]).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("asks the chain nothing about a program that is not valid", async () => {
      open();
      await ready();
      reader.readContract.mockClear();
      type(BROKEN);
      await new Promise((done) => setTimeout(done, 500));
      expect(reader.readContract).not.toHaveBeenCalled();
    });

    it("says why when the chain would not draw it", async () => {
      chainSays({ render: () => Promise.reject(new Error("The node would not answer.")) });
      open();
      await ready();
      type(sort8);
      expect(await screen.findByText("The node would not answer.")).toBeInTheDocument();
    });

    it("draws it again from another seed when asked", async () => {
      open();
      await ready();
      type(sort8);
      await screen.findByRole("img", { name: /drawn by the contract's renderer/ });
      const before = rendered().at(-1)![0].args[1];
      fireEvent.click(screen.getByRole("button", { name: "New seed" }));
      await waitFor(() => expect(rendered().at(-1)![0].args[1]).not.toBe(before));
    });
  });

  describe("what the contract says about the exact program", () => {
    it("says so when it has already been minted", async () => {
      chainSays({ minted: true });
      open();
      await ready();
      type(sort8);
      expect(await screen.findByText(/already been minted/)).toBeInTheDocument();
    });

    it("does not say about the program on the screen what the chain said about the one before it", async () => {
      const first = analyze(sort8);
      if (!first.ok) throw new Error("fixture does not assemble");
      chainSays({ mintedHash: programHash(first.hex) });
      open();
      await ready();
      type(sort8);
      expect(await screen.findByText(/already been minted/)).toBeInTheDocument();

      // a different program, which nobody has minted: the note was about the first one and must go at once, not
      // after the pause that lets the chain be asked about the second
      type(sort8.replace("hi14 = MAX hi6 hi8", "hi14 = MAX hi8 hi6"));
      expect(screen.queryByText(/already been minted/)).not.toBeInTheDocument();
    });

    it("says nothing when the way is clear", async () => {
      open();
      await ready();
      type(sort8);
      await screen.findByRole("img", { name: /drawn by the contract's renderer/ });
      expect(screen.queryByText(/already been minted/)).not.toBeInTheDocument();
    });
  });
});
