import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NavLinks } from "@/components/NavLinks";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

describe("NavLinks", () => {
  it("links to the puzzles and to the gallery", () => {
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Puzzles" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Gallery" })).toHaveAttribute("href", "/gallery");
  });

  it("says which section the visitor is in", () => {
    pathname.current = "/token/3";
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Gallery" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Puzzles" })).not.toHaveAttribute("aria-current");
  });

  it("says none of them for a page that is in neither", () => {
    pathname.current = "/elsewhere";
    render(<NavLinks />);
    expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it("is a navigation, named for what it is", () => {
    render(<NavLinks />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });
});
