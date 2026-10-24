import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProgramEditor } from "@/features/solve/ProgramEditor";

const good = { tone: "good", text: "46 nodes, depth 6. The program is valid." } as const;
const bad = { tone: "bad", text: "Unknown operation BOGUS.", line: 2 } as const;
const TEXT = "puzzle SORT8\nvalue = BOGUS 1\nout value\n";

const props = (over: Partial<Parameters<typeof ProgramEditor>[0]> = {}) => ({
  text: TEXT,
  status: bad,
  onChange: vi.fn(),
  onStartOver: vi.fn(),
  ...over,
});

describe("ProgramEditor", () => {
  it("is a text field named for what it holds, and does not correct what is written in it", () => {
    render(<ProgramEditor {...props()} />);
    const field = screen.getByRole("textbox", { name: "Your program" });
    expect(field).toHaveValue(TEXT);
    expect(field).toHaveAttribute("spellcheck", "false");
    expect(field).toHaveAttribute("autocapitalize", "off");
  });

  it("reports every edit", () => {
    const p = props();
    render(<ProgramEditor {...p} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "puzzle SORT8\n" } });
    expect(p.onChange).toHaveBeenCalledWith("puzzle SORT8\n");
  });

  it("says what is wrong, or that the program is valid, in a status the page announces", () => {
    const { rerender } = render(<ProgramEditor {...props()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Unknown operation BOGUS.");
    rerender(<ProgramEditor {...props({ status: good })} />);
    expect(screen.getByRole("status")).toHaveTextContent("46 nodes, depth 6. The program is valid.");
  });

  it("marks the tone for the eye, apart from its colour", () => {
    const { rerender } = render(<ProgramEditor {...props()} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "bad");
    rerender(<ProgramEditor {...props({ status: good })} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "good");
  });

  it("takes you to the line the assembler stopped on", () => {
    render(<ProgramEditor {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "line 2" }));
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(field).toHaveFocus();
    expect(TEXT.slice(field.selectionStart, field.selectionEnd)).toBe("value = BOGUS 1");
  });

  it("has no line to go to when the problem is not on a line", () => {
    render(<ProgramEditor {...props({ status: { tone: "bad", text: "Node b is never used." } })} />);
    expect(screen.queryByRole("button", { name: /^line/ })).not.toBeInTheDocument();
  });

  it("asks before it replaces the program with the starting point, and does nothing if you say no", () => {
    const p = props();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProgramEditor {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(p.onStartOver).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("starts over when you say yes", () => {
    const p = props();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProgramEditor {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(p.onStartOver).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("cannot be edited until the draft has been read, so a visitor never types into text that is about to be replaced", () => {
    render(<ProgramEditor {...props({ loading: true })} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-busy", "true");
  });
});
