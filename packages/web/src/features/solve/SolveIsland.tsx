"use client";

import { analyze, type LocalTestReport, randomSeed, runLocalTest, skeletonFor } from "@proofkin/core";
import { type ReactNode, useMemo, useState } from "react";
import { type Hex } from "viem";
import { usePublicClient } from "wagmi";

import { requireAppConfig } from "@/config/env";
import { OperationsReference } from "@/features/solve/OperationsReference";
import { PreviewPlate } from "@/features/solve/PreviewPlate";
import { ProgramEditor } from "@/features/solve/ProgramEditor";
import { TestPanel } from "@/features/solve/TestPanel";
import { useDebouncedValue } from "@/features/solve/useDebouncedValue";
import { useMounted } from "@/features/solve/useMounted";
import { PREVIEW_DEBOUNCE_MS, usePreview, useProgramStatus } from "@/features/solve/usePreview";
import { useProgram } from "@/features/solve/useProgram";
import { programNote, statusLine, testView } from "@/features/solve/views";

/** The page's two columns: the statement and the editor on one side, and on the other the plate, which stays in view. */
function Frame({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
      <div className="min-w-0">{main}</div>
      <aside aria-label="Preview" className="lg:sticky lg:top-6 lg:self-start">
        {aside}
      </aside>
    </div>
  );
}

/**
 * @notice The part of the solve page that needs a browser: the editor, the local test and the plate that redraws.
 * @dev (1) The statement above the editor is passed in as `children`, so it stays a server component and is sent as
 * HTML. (2) On the server, and while the browser hydrates that HTML, only the frame is drawn: the statement, the
 * puzzle's starting point in a read-only editor, and an empty plate. The saved draft, the random seed and the test need
 * the browser, and drawing them on the server would give a first frame that the browser then disagrees with. (3) Nothing
 * here needs a wallet: it reads the chain through the public client, and can be used with none connected.
 * @param props - `puzzleId`: which puzzle. `children`: the puzzle's statement.
 */
export function SolveIsland({ puzzleId, children }: { puzzleId: number; children: ReactNode }) {
  return useMounted() ? (
    <Workbench puzzleId={puzzleId}>{children}</Workbench>
  ) : (
    <Frame
      main={
        <>
          {children}
          <ProgramEditor
            text={skeletonFor(puzzleId)}
            status={statusLine(analyze(skeletonFor(puzzleId)))}
            onChange={() => undefined}
            onStartOver={() => undefined}
            loading
          />
        </>
      }
      aside={<PreviewPlate view={{ kind: "drawing", text: "Drawing…" }} onNewSeed={() => undefined} />}
    />
  );
}

/**
 * @dev A test result belongs to the text it was run on and is dropped when the text changes, by comparing the two, not
 * by an effect that would run a render late.
 */
function Workbench({ puzzleId, children }: { puzzleId: number; children: ReactNode }) {
  const app = useMemo(() => requireAppConfig(), []);
  const reader = usePublicClient({ chainId: app.chain.id });
  const { text, setText, analysis, startOver } = useProgram(puzzleId);

  const [ran, setRan] = useState<{ text: string; report: LocalTestReport }>();
  const report = ran?.text === text ? ran.report : undefined;

  const [seed, setSeed] = useState<Hex>(() => randomSeed());

  const current = analysis.ok ? analysis.hex : undefined;
  const settled = useDebouncedValue(current, PREVIEW_DEBOUNCE_MS);
  const preview = usePreview(app, reader, analysis, settled, seed);
  // The contract is asked about, and the page speaks of, only the program on the screen: until it has stood still,
  // `settled` is an earlier one, and what the chain said about that is not what the visitor is looking at.
  const note = programNote(
    useProgramStatus(app, reader, current !== undefined && current === settled ? current : undefined),
  );

  return (
    <Frame
      main={
        <>
          {children}
          <ProgramEditor text={text} status={statusLine(analysis)} onChange={setText} onStartOver={startOver} />
          {note && (
            <p role="note" className="mt-2 max-w-prose">
              {note}
            </p>
          )}
          <OperationsReference />
          <TestPanel
            view={testView({ valid: analysis.ok, report }, puzzleId)}
            onRun={() => analysis.ok && setRan({ text, report: runLocalTest(analysis.program) })}
          />
        </>
      }
      aside={<PreviewPlate view={preview} seed={seed} onNewSeed={() => setSeed(randomSeed())} />}
    />
  );
}
