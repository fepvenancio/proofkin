import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfigProblems } from "@/components/ConfigProblems";

describe("ConfigProblems", () => {
  const problems = [
    "NEXT_PUBLIC_CHAIN must be one of anvil, baseSepolia, base (it is not set).",
    "NEXT_PUBLIC_PROOFKIN must be a contract address (it is not set).",
  ];

  it("says the app is not configured, as an alert", () => {
    render(<ConfigProblems problems={problems} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/not configured/i);
  });

  it("lists every problem, so one pass fixes the setup", () => {
    render(<ConfigProblems problems={problems} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(problems);
  });

  it("points at .env.example", () => {
    render(<ConfigProblems problems={problems} />);
    expect(screen.getByText(/\.env\.example/)).toBeInTheDocument();
  });
});
