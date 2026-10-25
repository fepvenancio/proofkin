import { describe, expect, it } from "vitest";

import { createGuard } from "@/chain/guard";

const clock = (start = 0) => {
  let now = start;
  return { now: () => now, advance: (ms: number) => void (now += ms) };
};

const make = (over: Partial<Parameters<typeof createGuard>[0]> = {}, time = clock()) => ({
  time,
  guard: createGuard({ limit: 3, windowMs: 1000, remember: 2, now: time.now, ...over }),
});

describe("the abuse guard", () => {
  it("lets a first request through", () => {
    expect(make().guard.allow("a")).toBe("ok");
  });

  it("answers 'busy' once a window's budget is spent, so a flood of requests costs the node a few reads, not all of them", () => {
    const { guard } = make();
    expect([guard.allow("a"), guard.allow("b"), guard.allow("c"), guard.allow("d")]).toEqual([
      "ok",
      "ok",
      "ok",
      "busy",
    ]);
  });

  it("gives the budget back when the window has passed", () => {
    const { guard, time } = make();
    for (const key of ["a", "b", "c"]) guard.allow(key);
    expect(guard.allow("d")).toBe("busy");
    time.advance(1000);
    expect(guard.allow("d")).toBe("ok");
  });

  it("does not give the budget back a moment early", () => {
    const { guard, time } = make();
    for (const key of ["a", "b", "c"]) guard.allow(key);
    time.advance(999);
    expect(guard.allow("d")).toBe("busy");
  });

  it("answers 'done' for something already dealt with, and charges nothing for it", () => {
    const { guard } = make();
    expect(guard.allow("a")).toBe("ok");
    guard.done("a");
    // three more distinct keys would spend the budget; the repeated one must not have counted
    expect([guard.allow("a"), guard.allow("a"), guard.allow("a"), guard.allow("b"), guard.allow("c")]).toEqual([
      "done",
      "done",
      "done",
      "ok",
      "ok",
    ]);
  });

  it("does not remember a request that was only allowed: it may not have worked, and trying again must be possible", () => {
    const { guard } = make();
    guard.allow("a");
    expect(guard.allow("a")).toBe("ok");
  });

  it("forgets the oldest done thing once it remembers more than it was told to, so memory stays bounded", () => {
    const { guard } = make({ remember: 2, limit: 100 });
    for (const key of ["a", "b", "c"]) {
      guard.allow(key);
      guard.done(key);
    }
    expect(guard.allow("a")).toBe("ok"); // the oldest went
    expect(guard.allow("b")).toBe("done");
    expect(guard.allow("c")).toBe("done");
  });
});
