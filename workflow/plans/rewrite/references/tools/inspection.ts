import { readFile, writeFile } from "node:fs/promises";
import { Effect, Result } from "effect";
import {
  attachInspectionSink,
  createInspectionBufferSink,
  diffTrace,
  exportTraceArtifact,
  formatNoTransitionSummary,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTrace,
  formatTransactionOverlapSummary,
  graphOf,
  importTraceArtifact,
  inspectMicrosteps,
  inspectTransition,
  summarizeTrace,
  whyNoTransition,
} from "flow-state/inspect";
import { EditorMachine } from "../features/Tickets/editor/editor.machine.js";
import { editorDefinition } from "../features/Tickets/editor/editor.definition.js";
import { EditorRef, SessionRef } from "../app/actors.js";
import { DeskSetup } from "../app/setup.js";

/**
 * Explain authored behavior, observe committed evidence, and exchange raw bytes.
 * Target inspect-route restoration remains pending. No private schema or runtime details here.
 */

export async function inspectLiveDesk() {
  const runtime = DeskSetup.construct();
  const failures: unknown[] = [];
  const buffer = createInspectionBufferSink({ capacity: 256 });
  const attachment = attachInspectionSink(runtime, buffer); // Before admissions, for completeness.

  async function inspect() {
    await Effect.runPromise(runtime.ready());
    runtime.ensureActor(SessionRef, {});

    const { actor } = runtime.ensureActor(EditorRef, {
      input: { workspaceId: "north", ticketId: "T-42", title: "Replace lobby light" },
      contextBindings: { canEdit: SessionRef },
    });

    const snapshot = actor.getSnapshot();
    const event = Result.getOrThrow(editorDefinition.E.SaveRequested("request-inspect"));
    const graph = graphOf(EditorMachine);
    const transition = inspectTransition(EditorMachine, snapshot, event);
    const microsteps = inspectMicrosteps(EditorMachine, snapshot, event);
    const explanation = whyNoTransition(EditorMachine, snapshot, event);

    if (explanation !== undefined) console.log(formatNoTransitionSummary(explanation));

    // Inspection predicts authored decisions; it never starts that save.
    await attachment.drain();
    const retained = buffer.snapshot();
    console.log(retained.records.length, retained.truncatedBeforeSequence);
    buffer.clear(); // Advances omission marker; does not reset global sequence.

    return { graph, transition, microsteps };
  }

  const inspected = await inspect().then(Result.succeed, (failure: unknown) =>
    Result.fail(failure),
  );

  if (Result.isFailure(inspected)) failures.push(inspected.failure);

  // Keep attachment alive for terminal evidence; attempt both cleanup phases even after failure.
  try {
    await runtime.dispose();
  } catch (failure) {
    failures.push(failure);
  }

  try {
    await attachment.dispose();
  } catch (failure) {
    failures.push(failure);
  }

  if (failures.length === 1) throw failures[0];

  if (failures.length > 1) {
    throw new AggregateError(failures, "Inspection host and ordered cleanup failed");
  }

  return Result.getOrThrow(inspected);
}

export async function readSavedTrace() {
  // Produced by the commands in tools/cli.ts; artifact-only processing loads no app gateway.
  const trace = importTraceArtifact(
    new Uint8Array(await readFile("artifacts/ticket-save.trace.json")),
  );

  const summary = summarizeTrace(trace);
  const same = diffTrace(trace, trace);
  console.log(formatTrace(trace));
  console.log(formatRehydrationSummary(trace));
  console.log(formatResourceFreshnessReport(trace));
  console.log(formatTransactionOverlapSummary(trace));
  await writeFile("artifacts/ticket-save.copy.json", exportTraceArtifact(trace));

  return { summary, same };
}

export async function shareOneCheckpointValue() {
  const focused = importTraceArtifact(
    new Uint8Array(await readFile("artifacts/editor-focused.trace.json")),
  );

  const share = exportTraceArtifact(focused, {
    redactions: [
      {
        path: ["checkpoints", 0, "snapshot", "memory", "draft"],
        replacement: "[REDACTED]",
      },
    ],
  });

  await writeFile("artifacts/editor-checkpoint.share.json", share);
}

/**
 * The focused Story has exactly one focused checkpoint, with memory.draft at the shown path.
 * This replaces ONE occurrence only. Records, resource data, and end may still contain the title.
 * It is a path demonstration, not a complete privacy policy. Review every permitted occurrence.
 * Missing/duplicate/overlapping/wildcard/structural paths reject. Raw input is unchanged.
 * Shares have a distinct kind/version + manifest and cannot be imported/proved/diffed/compressed.
 * Empty/omitted redactions return byte-identical raw output. Files above use application I/O;
 * the CLI separately guarantees atomic publication.
 *
 * A buffer is not a full raw trace. CLI story run --trace-output supplies identity/checkpoints/end/
 * failure/cleanup too. No undocumented buffer-to-trace converter or synthetic artifact is used.
 * Capacity defaults to 256; zero is valid. Late attach/clear/overflow can make evidence incomplete.
 * drain/dispose wait through accepted prefixes. Slow sinks do not block ordinary publication.
 *
 * Additional settled call fragments, given compatible inferred route-created projection values:
 *   formatInspectionEvent(inspectionEvent)
 *   formatInspectionTimeline(inspectionEvents)
 *   diffBehaviorContracts(leftContract, rightContract, { moduleId:"tickets" })
 *   renderBehaviorContract(contract, { moduleId:"tickets" })
 * These names are imports from flow-state/inspect, never root namespace helpers.
 * Inspection events are not authored domain event envelopes.
 *
 * Remaining call forms at InspectionAndArtifacts.Q2:
 * inspectActivities: explain declarations without inventing past inputs/starts from one snapshot.
 * analyzeTrace: produce trace analysis; exact parameters/result unspecified.
 * buildBehaviorContract/renderBehaviorCoverage: target object typing/validation not settled.
 * sliceBehaviorContract/renderBehaviorDiff: exact parameters/result unspecified.
 * compressTraceArtifact/decompressTraceArtifact: success/failure async form unresolved.
 * Use demonstrated CLI build/render/check/diff instead of guessing these programmatic signatures.
 *
 * Summarize reports retained evidence, even incomplete. Complete equality/proof needs no omissions.
 * Comparing a truncated artifact to itself is incomplete, never complete equal.
 * Different retained facts remain different under truncation. Incompatible app identity is failure.
 *
 * Authority: ../../InspectionAndArtifacts.plan, ../../../archive/Artifacts.plan.
 */
