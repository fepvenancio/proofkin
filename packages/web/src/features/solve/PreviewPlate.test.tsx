import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreviewPlate } from "@/features/solve/PreviewPlate";
import { type PreviewView } from "@/features/solve/views";

const SRC = "data:image/svg+xml;base64,PHN2Zy8+";
const SEED = "0x" + "ab".repeat(32);

const show = (view: PreviewView, over: Partial<Parameters<typeof PreviewPlate>[0]> = {}) =>
  render(<PreviewPlate view={view} seed={SEED} onNewSeed={() => undefined} {...over} />);

describe("PreviewPlate", () => {
  it("draws the contract's picture of the program, and says whose picture it is", () => {
    show({ kind: "drawn", src: SRC, dimmed: false });
    const picture = screen.getByRole("img", { name: "Your program, drawn by the contract's renderer" });
    expect(picture).toHaveAttribute("src", SRC);
  });

  it("dims the picture while the next one is drawn, but keeps it", () => {
    show({ kind: "drawn", src: SRC, dimmed: true });
    expect(screen.getByRole("img")).toHaveAttribute("data-dimmed", "true");
  });

  it("does not dim a picture that is current", () => {
    show({ kind: "drawn", src: SRC, dimmed: false });
    expect(screen.getByRole("img")).toHaveAttribute("data-dimmed", "false");
  });

  it("says what it is waiting for, on the plate", () => {
    show({ kind: "invalid", text: "Fix the program and it will be drawn here." });
    expect(screen.getByText("Fix the program and it will be drawn here.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("says it is drawing", () => {
    show({ kind: "drawing", text: "Drawing…" });
    expect(screen.getByText("Drawing…")).toBeInTheDocument();
  });

  it("says why it could not draw, as an alert", () => {
    show({ kind: "error", text: "The node did not answer." });
    expect(screen.getByRole("alert")).toHaveTextContent("The node did not answer.");
  });

  it("says the seed is a random one, since the token's own comes from its commit", () => {
    show({ kind: "drawn", src: SRC, dimmed: false });
    expect(
      screen.getByText(/Drawn from a random seed; the token's own seed comes from its commit\./),
    ).toBeInTheDocument();
  });

  it("shows the seed shortened, and the whole of it on hover", () => {
    show({ kind: "drawn", src: SRC, dimmed: false });
    const shown = screen.getByText(`${SEED.slice(0, 10)}…`);
    expect(shown).toHaveAttribute("title", SEED);
  });

  it("says nothing about a seed it has not chosen yet, as on the server, where it would differ from the browser's", () => {
    render(<PreviewPlate view={{ kind: "drawing", text: "Drawing…" }} onNewSeed={() => undefined} />);
    expect(screen.queryByText(/random seed/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New seed" })).not.toBeInTheDocument();
  });

  it("asks for a new seed", () => {
    const onNewSeed = vi.fn();
    show({ kind: "drawn", src: SRC, dimmed: false }, { onNewSeed });
    fireEvent.click(screen.getByRole("button", { name: "New seed" }));
    expect(onNewSeed).toHaveBeenCalledOnce();
  });

  it("has nothing to say about a seed before there is a program to draw", () => {
    show({ kind: "invalid", text: "Fix the program and it will be drawn here." });
    expect(screen.queryByText(/random seed/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New seed" })).not.toBeInTheDocument();
  });
});
