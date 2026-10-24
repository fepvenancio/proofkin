"use client";

import { useEffect, useState } from "react";

/**
 * @notice A value that follows another once it has stood still.
 * @dev The preview asks the chain to render the program, which is heavy, so it asks about what was typed a moment ago,
 * not about every keystroke on the way there.
 * @param value - The value to follow.
 * @param delayMs - How long it must hold still before it is passed on.
 * @returns The value as it was `delayMs` of stillness ago; the first value at once.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
