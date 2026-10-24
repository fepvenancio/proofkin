import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/SiteHeader";

// The real button needs the wallet providers, which the root layout supplies and this test does not.
vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button type="button">Connect</button> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("SiteHeader", () => {
  it("names the site and takes the visitor home", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Proofkin" })).toHaveAttribute("href", "/");
  });

  it("has the main navigation and the wallet button", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });
});
