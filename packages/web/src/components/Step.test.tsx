import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Step } from "@/components/Step";

const inList = (state: "done" | "current" | "todo") =>
  render(
    <ol>
      <Step state={state} title="Commit">
        <p>Committed in block 7.</p>
      </Step>
    </ol>,
  );

describe("Step", () => {
  it("is a list item with its title as a heading and its content under it", () => {
    inList("done");
    const item = screen.getByRole("listitem");
    expect(item).toContainElement(screen.getByRole("heading", { name: "Commit" }));
    expect(item).toHaveTextContent("Committed in block 7.");
  });

  it.each(["done", "current", "todo"] as const)("says in markup that it is %s", (state) => {
    inList(state);
    expect(screen.getByRole("listitem")).toHaveAttribute("data-state", state);
  });

  it("is marked as the current step for assistive technology only when it is", () => {
    const { unmount } = inList("current");
    expect(screen.getByRole("listitem")).toHaveAttribute("aria-current", "step");
    unmount();
    inList("done");
    expect(screen.getByRole("listitem")).not.toHaveAttribute("aria-current");
  });

  it("dims the title of a step still to come", () => {
    inList("todo");
    expect(screen.getByRole("heading", { name: "Commit" })).toHaveClass("text-graphite");
    document.body.innerHTML = "";
    inList("done");
    expect(screen.getByRole("heading", { name: "Commit" })).not.toHaveClass("text-graphite");
  });
});
