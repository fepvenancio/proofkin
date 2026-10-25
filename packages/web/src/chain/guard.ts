import "server-only";

export interface Guard {
  /**
   * @param key - What is being asked for.
   * @returns "done" if it was dealt with already, "busy" if this window's budget is spent, and otherwise "ok", which
   * uses up one of the budget.
   */
  allow(key: string): "ok" | "done" | "busy";
  /** Remembers that `key` was dealt with, so asking again is answered without any work. */
  done(key: string): void;
}

/**
 * @notice A budget of requests per window, and a bounded memory of what has been dealt with.
 * @dev (1) An endpoint anyone can call is a way to spend the node's allowance, so each real check against the node
 * costs one of a few requests a window, and what is over the budget is refused outright. (2) Only a request that
 * worked is remembered, and the caller says so with `done`: one that failed, or came too early, must be able to be tried
 * again. (3) What is remembered is capped, oldest first, so memory cannot grow without end. (4) It lives in the memory of
 * one server process, which is all a courtesy like this needs: the caches expire by themselves within a minute.
 * @param settings - `limit`: requests per window. `windowMs`: how long a window is. `remember`: how many dealt-with
 * keys to keep. `now`: the clock, so a test can move it.
 * @returns The guard.
 */
export function createGuard({
  limit,
  windowMs,
  remember,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  remember: number;
  now?: () => number;
}): Guard {
  const dealtWith = new Set<string>();
  let windowStart = now();
  let used = 0;

  return {
    allow(key) {
      if (dealtWith.has(key)) return "done";
      const time = now();
      if (time - windowStart >= windowMs) {
        windowStart = time;
        used = 0;
      }
      if (used >= limit) return "busy";
      used++;
      return "ok";
    },
    done(key) {
      dealtWith.add(key);
      if (dealtWith.size > remember) dealtWith.delete(dealtWith.values().next().value as string);
    },
  };
}
