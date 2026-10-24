import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound from "@/app/not-found";

describe("the not-found page", () => {
  it("says the page does not exist", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
  });

  it("points to where the collection is", () => {
    render(<NotFound />);
    expect(screen.getByRole("link", { name: "See the puzzles" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Browse the gallery" })).toHaveAttribute("href", "/gallery");
  });
});
