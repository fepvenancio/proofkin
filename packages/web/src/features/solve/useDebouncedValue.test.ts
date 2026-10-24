import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "@/features/solve/useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts with the value it is given", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 350));
    expect(result.current).toBe("a");
  });

  it("holds the old value until the new one has stood still for the delay", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 350), {
      initialProps: { value: "a" },
    });
    rerender({ value: "b" });
    act(() => void vi.advanceTimersByTime(349));
    expect(result.current).toBe("a");
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe("b");
  });

  it("starts the wait again at every change, so a burst of keystrokes asks once", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 350), {
      initialProps: { value: "a" },
    });
    rerender({ value: "b" });
    act(() => void vi.advanceTimersByTime(300));
    rerender({ value: "c" });
    act(() => void vi.advanceTimersByTime(300));
    expect(result.current).toBe("a");
    act(() => void vi.advanceTimersByTime(50));
    expect(result.current).toBe("c");
  });
});
