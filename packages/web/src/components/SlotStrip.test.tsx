import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SlotStrip } from "@/components/SlotStrip";

const slots = (container: HTMLElement, kind: string) => container.querySelectorAll(`[data-slot="${kind}"]`);

describe("SlotStrip", () => {
  it("has a slot for each of the puzzle's 50 solutions", () => {
    const { container } = render(<SlotStrip puzzleId={2} solved={0} recordRanks={[]} />);
    expect(container.querySelectorAll("[data-slot]")).toHaveLength(50);
  });

  it("fills as many slots as have been solved, from the first", () => {
    const { container } = render(<SlotStrip puzzleId={2} solved={3} recordRanks={[]} />);
    expect(slots(container, "filled")).toHaveLength(3);
    expect(slots(container, "empty")).toHaveLength(47);
    const kinds = [...container.querySelectorAll("[data-slot]")].map((slot) => slot.getAttribute("data-slot"));
    expect(kinds.slice(0, 4)).toEqual(["filled", "filled", "filled", "empty"]);
  });

  it("rings the slot of the smallest solution, by its solve order", () => {
    const { container } = render(<SlotStrip puzzleId={2} solved={3} recordRanks={[2]} />);
    const kinds = [...container.querySelectorAll("[data-slot]")].map((slot) => slot.getAttribute("data-slot"));
    expect(kinds.slice(0, 4)).toEqual(["filled", "record", "filled", "empty"]);
  });

  it("rings every solution that shares the smallest size", () => {
    const { container } = render(<SlotStrip puzzleId={2} solved={5} recordRanks={[1, 4]} />);
    expect(slots(container, "record")).toHaveLength(2);
  });

  it("never draws more than 50 slots, whatever it is told", () => {
    const { container } = render(<SlotStrip puzzleId={2} solved={80} recordRanks={[]} />);
    expect(container.querySelectorAll("[data-slot]")).toHaveLength(50);
  });

  it("is one picture with one description, not fifty things to tab through", () => {
    render(<SlotStrip puzzleId={2} solved={3} best={19} recordRanks={[2]} />);
    expect(screen.getByRole("img", { name: "3 of 50 solved, smallest 19 nodes" })).toBeInTheDocument();
  });

  it("describes a puzzle nobody has solved", () => {
    render(<SlotStrip puzzleId={2} solved={0} recordRanks={[]} />);
    expect(screen.getByRole("img", { name: "0 of 50 solved" })).toBeInTheDocument();
  });

  it("carries the puzzle's hue", () => {
    const { container } = render(<SlotStrip puzzleId={2} solved={0} recordRanks={[]} />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--h")).toBe("265");
  });
});
