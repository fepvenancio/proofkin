import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyPlate } from "@/components/EmptyPlate";

describe("EmptyPlate", () => {
  it("is a picture with a description of what it stands in for", () => {
    render(<EmptyPlate />);
    expect(screen.getByRole("img", { name: /nothing has been solved yet/i })).toBeInTheDocument();
  });

  it("has a ring in the hue of each of the six puzzles", () => {
    const { container } = render(<EmptyPlate />);
    expect(container.querySelectorAll("circle")).toHaveLength(6);
  });
});
