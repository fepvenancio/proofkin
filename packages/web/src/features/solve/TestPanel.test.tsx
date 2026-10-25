import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TestPanel } from "@/features/solve/TestPanel";
import { type TestView } from "@/features/solve/views";

const notRun: TestView = { kind: "notRun", text: "Runs your program on the 4 fixed edge cases and 100 random ones." };
const blocked: TestView = { kind: "blocked", text: "Fix the program first." };
const pass: TestView = { kind: "pass", headline: "Passed all 112 cases.", note: "Seed 0xabcdef12…. A rehearsal." };
const fail: TestView = {
  kind: "fail",
  headline: "Failed the second edge case: strictly descending.",
  rows: [
    { label: "Inputs", value: "x0=7  x1=6" },
    { label: "Expected", value: "6, 7" },
    { label: "Got", value: "7, 7" },
  ],
};

describe("TestPanel", () => {
  it("is named for what it does", () => {
    render(<TestPanel view={notRun} onRun={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Test locally" })).toBeInTheDocument();
  });

  it("says what a run will try before there has been one", () => {
    render(<TestPanel view={notRun} onRun={() => undefined} />);
    expect(screen.getByText("Runs your program on the 4 fixed edge cases and 100 random ones.")).toBeInTheDocument();
  });

  it("runs the test when asked", () => {
    const onRun = vi.fn();
    render(<TestPanel view={notRun} onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: "Run test" }));
    expect(onRun).toHaveBeenCalledOnce();
  });

  it("cannot run a program that is not valid, and says to fix it", () => {
    render(<TestPanel view={blocked} onRun={() => undefined} />);
    expect(screen.getByRole("button", { name: "Run test" })).toBeDisabled();
    expect(screen.getByText("Fix the program first.")).toBeInTheDocument();
  });

  it("says a passing program passed, and what that is not", () => {
    render(<TestPanel view={pass} onRun={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("Passed all 112 cases.");
    expect(screen.getByText(/A rehearsal/)).toBeInTheDocument();
  });

  it("shows the case a program failed on: what went in, what was wanted, what it said", () => {
    render(<TestPanel view={fail} onRun={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed the second edge case: strictly descending.");
    const terms = screen.getAllByRole("term").map((t) => t.textContent);
    expect(terms).toEqual(["Inputs", "Expected", "Got"]);
    expect(within(screen.getByRole("alert")).getByText("7, 7")).toBeInTheDocument();
  });
});
