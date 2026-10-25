import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Page, { metadata } from "@/app/admin/page";

vi.mock("@/features/admin/AdminConsole", () => ({ AdminConsole: () => <h1>The console</h1> }));

describe("the admin page", () => {
  it("is the console", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: "The console" })).toBeInTheDocument();
  });

  it("asks search engines to leave it alone, and neither to index it nor to follow its links", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("is titled Admin", () => {
    expect(metadata.title).toBe("Admin");
  });
});
