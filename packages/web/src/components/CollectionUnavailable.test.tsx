import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollectionUnavailable } from "@/components/CollectionUnavailable";

describe("CollectionUnavailable", () => {
  it("says which chain could not be reached, as a status", () => {
    render(<CollectionUnavailable chainName="Base Sepolia" />);
    expect(screen.getByRole("status")).toHaveTextContent(/could not reach base sepolia/i);
  });

  it("says the collection cannot be shown, so a visitor knows what is missing", () => {
    render(<CollectionUnavailable chainName="Base Sepolia" />);
    expect(screen.getByRole("status")).toHaveTextContent(/collection cannot be shown/i);
  });
});
