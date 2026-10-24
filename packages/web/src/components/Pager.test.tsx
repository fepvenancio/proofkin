import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pager } from "@/components/Pager";

describe("Pager", () => {
  it("is not there when everything fits on one page", () => {
    const { container } = render(<Pager query={{ page: 1 }} pages={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says where you are", () => {
    render(<Pager query={{ page: 2 }} pages={5} />);
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
  });

  it("offers only the way forward from the first page", () => {
    render(<Pager query={{ page: 1 }} pages={3} />);
    expect(screen.queryByRole("link", { name: "Newer" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Older" })).toHaveAttribute("href", "/gallery?page=2");
  });

  it("offers only the way back from the last page", () => {
    render(<Pager query={{ page: 3 }} pages={3} />);
    expect(screen.queryByRole("link", { name: "Older" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Newer" })).toHaveAttribute("href", "/gallery?page=2");
  });

  it("goes back to the first page without a page in the address", () => {
    render(<Pager query={{ page: 2 }} pages={3} />);
    expect(screen.getByRole("link", { name: "Newer" })).toHaveAttribute("href", "/gallery");
  });

  it("keeps the puzzle being looked at", () => {
    render(<Pager query={{ puzzle: 2, page: 2 }} pages={3} />);
    expect(screen.getByRole("link", { name: "Newer" })).toHaveAttribute("href", "/gallery?puzzle=sort8");
    expect(screen.getByRole("link", { name: "Older" })).toHaveAttribute("href", "/gallery?puzzle=sort8&page=3");
  });
});
