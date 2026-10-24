"use client";

import {
  type Analysis,
  type AppConfig,
  checkProgram,
  friendlyError,
  type ProgramStatus,
  previewSvg,
  type Reader,
} from "@proofkin/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type Hex } from "viem";

import { queryKeys } from "@/config/queryKeys";
import { previewView } from "@/features/solve/views";

/** How long the program must stand still before the chain is asked to draw it. */
export const PREVIEW_DEBOUNCE_MS = 350;

/**
 * @notice The contract's drawing of the program, as the plate should show it.
 * @dev (1) It asks about `settled`, the program as it was a moment ago, not about every keystroke. (2) The picture is a
 * function of the program and the seed alone, so it is never stale, and it is kept while the next is drawn. (3) A
 * rejected read is shown as a sentence, and is not retried by itself: a public node that has said no to a heavy call
 * will say it again, and asking again only makes the limit longer.
 * @param app - The deployment.
 * @param reader - A read-only client for its chain, once the wallet library has one.
 * @param analysis - What the editor's text turned into.
 * @param settled - The program's hex as it was a moment ago, if it was valid.
 * @param seed - The random seed to draw from, once chosen.
 * @returns What the plate shows.
 */
export function usePreview(
  app: AppConfig,
  reader: Reader | undefined,
  analysis: Analysis,
  settled: Hex | undefined,
  seed: Hex | undefined,
) {
  const query = useQuery({
    queryKey: settled && seed ? queryKeys.preview(app, settled, seed) : ["preview", "idle"],
    queryFn: () => previewSvg(reader!, app, settled!, seed!),
    enabled: reader !== undefined && settled !== undefined && seed !== undefined,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: false,
  });
  const current = analysis.ok ? analysis.hex : undefined;
  return previewView(analysis, {
    data: query.data,
    error: query.error ? friendlyError(query.error) : undefined,
    // while the text is ahead of the settled program, the picture on the plate is already out of date
    isFetching: query.isFetching || current !== settled,
  });
}

/**
 * @notice What the contract says about this exact program: free, already minted, or its puzzle full.
 * @param app - The deployment.
 * @param reader - A read-only client for its chain.
 * @param settled - The program's hex as it was a moment ago, if it was valid.
 * @returns The status, or "unknown" until the contract has answered or if it could not.
 */
export function useProgramStatus(
  app: AppConfig,
  reader: Reader | undefined,
  settled: Hex | undefined,
): ProgramStatus | "unknown" {
  const query = useQuery({
    queryKey: settled ? queryKeys.programStatus(app, settled) : ["programStatus", "idle"],
    queryFn: () => checkProgram(reader!, app, settled!),
    enabled: reader !== undefined && settled !== undefined,
    staleTime: 15_000,
    retry: false,
  });
  return query.data ?? "unknown";
}
