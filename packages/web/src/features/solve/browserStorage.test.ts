import { afterEach, describe, expect, it, vi } from "vitest";

import { browserStorage } from "@/features/solve/browserStorage";

describe("browserStorage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the browser's localStorage when there is one", () => {
    expect(browserStorage()).toBe(window.localStorage);
  });

  it("is nothing on a server, where there is no window", () => {
    vi.stubGlobal("window", undefined);
    expect(browserStorage()).toBeUndefined();
  });

  it("is nothing where reading localStorage throws, as in some private modes, rather than an error", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(browserStorage()).toBeUndefined();
  });
});
