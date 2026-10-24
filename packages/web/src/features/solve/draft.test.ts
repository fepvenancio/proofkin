import { describe, expect, it } from "vitest";

import { draftKey, loadDraft, saveDraft } from "@/features/solve/draft";

/** The part of `localStorage` the drafts use, as a map. */
function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const refusing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

describe("drafts", () => {
  it("come back as they were saved", () => {
    const storage = memory();
    saveDraft(2, "puzzle SORT8\na = IN 0\n", storage);
    expect(loadDraft(2, storage)).toBe("puzzle SORT8\na = IN 0\n");
  });

  it("are kept apart by puzzle, so changing puzzle never changes what is in the editor", () => {
    const storage = memory();
    saveDraft(2, "sort", storage);
    saveDraft(3, "grid", storage);
    expect(loadDraft(2, storage)).toBe("sort");
    expect(loadDraft(3, storage)).toBe("grid");
    expect(draftKey(2)).not.toBe(draftKey(3));
  });

  it("are undefined for a puzzle nobody has written a program for", () => {
    expect(loadDraft(4, memory())).toBeUndefined();
  });

  it("keep an emptied editor empty, which is a draft too, not a reason to bring the starting point back", () => {
    const storage = memory();
    saveDraft(1, "", storage);
    expect(loadDraft(1, storage)).toBe("");
  });

  it("are a convenience: a browser that refuses storage loses the draft and nothing else", () => {
    expect(() => saveDraft(1, "x", refusing)).not.toThrow();
    expect(loadDraft(1, refusing)).toBeUndefined();
  });

  it("work with no storage at all, as on a server", () => {
    expect(() => saveDraft(1, "x", undefined)).not.toThrow();
    expect(loadDraft(1, undefined)).toBeUndefined();
  });
});
