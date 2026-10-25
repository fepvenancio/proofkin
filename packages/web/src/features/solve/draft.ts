/** The part of `localStorage` the drafts use. */
type DraftStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * @param puzzleId - Which puzzle the program is for.
 * @returns The storage key of that puzzle's draft.
 */
export const draftKey = (puzzleId: number): string => `proofkin:draft:v1:${puzzleId}`;

/**
 * @notice The program a visitor last wrote for a puzzle, in this browser.
 * @dev A draft is a convenience, so a browser that refuses storage is not an error: there is just no draft. An emptied
 * editor is a draft too, and stays empty.
 * @param puzzleId - Which puzzle.
 * @param storage - `window.localStorage`; absent on a server.
 * @returns The text, or undefined when there is none.
 */
export function loadDraft(puzzleId: number, storage: DraftStorage | undefined): string | undefined {
  try {
    return storage?.getItem(draftKey(puzzleId)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * @notice Remembers what is in the editor.
 * @dev Never throws: losing a draft is not worth an error.
 * @param puzzleId - Which puzzle.
 * @param text - What is in the editor.
 * @param storage - `window.localStorage`; absent on a server.
 */
export function saveDraft(puzzleId: number, text: string, storage: DraftStorage | undefined): void {
  try {
    storage?.setItem(draftKey(puzzleId), text);
  } catch {
    // a full or blocked store loses the draft and nothing else
  }
}
