"use client";

import { analyze, skeletonFor } from "@proofkin/core";
import { useEffect, useMemo, useState } from "react";

import { browserStorage } from "@/features/solve/browserStorage";
import { loadDraft, saveDraft } from "@/features/solve/draft";

/**
 * @notice The program being written for a puzzle: its text, what the text turns into, and the draft kept between visits.
 * @dev (1) It starts from the saved draft, read in the state's own initialiser, so there is no render in which the
 * starting point shows and is then replaced, and nothing can be written back before the draft was read. That is only
 * safe in the browser after hydration, so the island mounts the workbench that uses this hook only then (`useMounted`).
 * (2) Changing puzzle remounts the island (the page keys it by puzzle), so this never has to switch drafts under a
 * visitor.
 * @param puzzleId - Which puzzle.
 * @returns `text` and `setText`; `analysis` of the text; `startOver`, which replaces the text with the puzzle's
 * starting point.
 */
export function useProgram(puzzleId: number) {
  const [text, setText] = useState(() => loadDraft(puzzleId, browserStorage()) ?? skeletonFor(puzzleId));

  useEffect(() => {
    saveDraft(puzzleId, text, browserStorage());
  }, [puzzleId, text]);

  const analysis = useMemo(() => analyze(text), [text]);
  return { text, setText, analysis, startOver: () => setText(skeletonFor(puzzleId)) };
}
