import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Plate } from "@/components/Plate";

describe("Plate", () => {
  it("shows the token's art from its own address", () => {
    render(<Plate id={3} alt="A constellation of 19 nodes" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/token/3/art");
  });

  it("describes the art as it was told to", () => {
    render(<Plate id={3} alt="A constellation of 19 nodes" />);
    expect(screen.getByRole("img", { name: "A constellation of 19 nodes" })).toBeInTheDocument();
  });

  it("can be decorative, when the words beside it already say what it is", () => {
    const { container } = render(<Plate id={3} alt="" />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("keeps its square before the art arrives, so the page does not jump", () => {
    const { container } = render(<Plate id={3} alt="" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("width", "600");
    expect(img).toHaveAttribute("height", "600");
  });

  it("waits to be scrolled to, unless it is the first thing on the page", () => {
    const { container, rerender } = render(<Plate id={3} alt="" />);
    expect(container.querySelector("img")).toHaveAttribute("loading", "lazy");
    rerender(<Plate id={3} alt="" priority />);
    expect(container.querySelector("img")).toHaveAttribute("loading", "eager");
  });
});
