import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OperationsReference } from "@/features/solve/OperationsReference";

describe("OperationsReference", () => {
  it("is folded away until it is wanted, under its name", () => {
    const { container } = render(<OperationsReference />);
    expect(screen.getByText("The thirteen operations")).toBeInTheDocument();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
  });

  it("says how a program is written, in a line", () => {
    render(<OperationsReference />);
    expect(screen.getByText(/One node per line/)).toBeInTheDocument();
    expect(screen.getByText(/followed by one node per answer slot/)).toBeInTheDocument();
  });

  it("lists every operation with what it does", () => {
    render(<OperationsReference />);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(13);
    expect(rows[2]).toHaveTextContent("ADD a b");
    expect(rows[2]).toHaveTextContent("Fails if the result is above 4294967295.");
  });
});
