import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ErrorPage from "@/app/error";

describe("the error page", () => {
  it("says something went wrong, as an alert", () => {
    render(<ErrorPage error={new Error("boom")} reset={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong showing this page.");
  });

  it("does not show the error itself, which may name an endpoint or a key", () => {
    render(
      <ErrorPage error={new Error("fetch failed for https://rpc.example/v2/SECRETKEY")} reset={() => undefined} />,
    );
    expect(document.body.textContent).not.toContain("SECRETKEY");
    expect(document.body.textContent).not.toContain("fetch failed");
  });

  it("offers to try again, which asks Next.js to render the page again", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
