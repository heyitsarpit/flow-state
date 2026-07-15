import * as flow from "flow-state";
import {
  analyzeTrace,
  attachInspectionSink,
  captureTrace,
  compressTraceArtifact,
  createInspectionBufferSink,
  createLocalInspectionProof,
  decompressTraceArtifact,
  diffTrace,
  exportTraceArtifact,
  formatInspectionEvent,
  formatInspectionEventPretty,
  formatInspectionTimeline,
  formatInspectionTimelinePretty,
  formatNoTransitionSummary,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTrace,
  formatTracePretty,
  formatTransactionOverlapSummary,
  graphOf,
  importTraceArtifact,
  inspectActions,
  inspectMicrosteps,
  inspectTransition,
  summarizeTrace,
  whyNoTransition,
} from "flow-state/inspect";

import { launchWorkspaceTrace } from "../../src/launchWorkspace";

import { helperMachine, rehydrationTrace, semanticTrace } from "./inspection-fixtures";
import { runInspectionScope } from "./inspection-scope";
import {
  analysisSummary,
  graphSummary,
  importedTraceSummary,
  traceSummary,
} from "./output-summaries";
import type { OutputWriter } from "./output-writer";

type LiveInspectionEvent = Readonly<{
  type: string;
  id: string;
  sequence: number;
  correlationId?: string;
  eventType?: string;
}>;

export async function collectInspectionOutputs(writer: OutputWriter): Promise<void> {
  const liveEvents: Array<LiveInspectionEvent> = [];
  const sink = createInspectionBufferSink<string>();
  const inspectionModule = flow.module("LaunchWorkspaceOutputInspection", {
    machines: { helper: helperMachine },
  });
  const acquireRuntime = () =>
    flow.runtime(
      flow.app({ modules: [inspectionModule] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

  await runInspectionScope(
    {
      acquireRuntime,
      releaseRuntime: (runtime) => runtime.dispose(),
      acquireSinkSubscription: (runtime) =>
        attachInspectionSink(runtime.inspection, sink, {
          includeHistory: true,
          redact: (event) => ({
            type: event.type,
            id: event.id,
            sequence: event.sequence,
            correlationId: "correlationId" in event ? event.correlationId : undefined,
            eventType: "eventType" in event ? event.eventType : undefined,
          }),
          serialize: (event) =>
            [
              event.sequence,
              event.type,
              event.id,
              event.eventType ?? "no-event-type",
              event.correlationId ?? "no-correlation",
            ].join("|"),
        }),
      releaseSinkSubscription: (subscription) => subscription.unsubscribe(),
      acquireRuntimeSubscription: (runtime) =>
        runtime.inspection.subscribe((event) => {
          liveEvents.push({
            type: event.type,
            id: event.id,
            sequence: event.sequence,
            correlationId: "correlationId" in event ? event.correlationId : undefined,
            eventType: "eventType" in event ? event.eventType : undefined,
          });
        }),
      releaseRuntimeSubscription: (subscription) => subscription.unsubscribe(),
      acquireActor: (runtime) => runtime.createActor(helperMachine),
      releaseActor: (actor) => actor.dispose(),
    },
    async ({ runtime, actor: helperActor }) => {
      helperActor.send({ type: "STOP" });
      helperActor.send({ type: "START" });
      helperActor.send({ type: "STOP" });
      await helperActor.flush();

      const inspectionEntries = runtime.inspection.entries();
      const helperTrace = captureTrace(helperActor.getSnapshot(), {
        includeSnapshots: true as const,
      });
      const helperTraceArtifact = exportTraceArtifact(helperTrace);
      const importedTrace = importTraceArtifact(helperTraceArtifact);
      const compressedTrace = await compressTraceArtifact(helperTrace);
      const decompressedTrace =
        compressedTrace === undefined ? undefined : await decompressTraceArtifact(compressedTrace);
      const helperAnalysis = analyzeTrace(helperMachine, helperTrace);
      const helperDiff = diffTrace(launchWorkspaceTrace, helperTrace);
      const helperSummary = summarizeTrace(helperTrace);
      const localProof = createLocalInspectionProof(helperTrace, inspectionEntries);
      const firstInspectionEvent = inspectionEntries[0];

      await writer.writeJson(
        "inspect/graphOf.helper-machine.json",
        graphSummary(graphOf(helperMachine)),
        "inspect",
        "graphOf",
        "Serializable graph descriptor for the helper inspection machine.",
      );
      await writer.writeJson(
        "inspect/captureTrace.helper-machine.json",
        traceSummary(helperTrace),
        "inspect",
        "captureTrace",
        "Trace summary after one no-transition and one happy-path run.",
      );
      await writer.writeJson(
        "inspect/analyzeTrace.helper-machine.json",
        analysisSummary(helperAnalysis),
        "inspect",
        "analyzeTrace",
        "Machine-aware wrapper over the captured helper trace.",
      );
      await writer.writeJson(
        "inspect/diffTrace.launchworkspace-initial-vs-helper.json",
        {
          kind: helperDiff.kind,
          summary: helperDiff.summary,
          changedSections: helperDiff.summary.changedSections,
        },
        "inspect",
        "diffTrace",
        "Structured trace diff between Launch Workspace initial trace and the helper trace.",
      );
      await writer.writeJson(
        "inspect/exportTraceArtifact.helper-machine.json",
        helperTraceArtifact,
        "inspect",
        "exportTraceArtifact",
        "Portable JSON trace artifact.",
      );
      await writer.writeJson(
        "inspect/importTraceArtifact.helper-machine.json",
        importedTraceSummary(importedTrace),
        "inspect",
        "importTraceArtifact",
        "Imported trace descriptor summary from the exported artifact.",
      );
      await writer.writeJson(
        "inspect/compressTraceArtifact.helper-machine.json",
        {
          compressed: compressedTrace !== undefined,
          byteLength: compressedTrace?.byteLength ?? 0,
        },
        "inspect",
        "compressTraceArtifact",
        "Compressed trace artifact byte summary.",
      );
      await writer.writeJson(
        "inspect/decompressTraceArtifact.helper-machine.json",
        importedTraceSummary(decompressedTrace),
        "inspect",
        "decompressTraceArtifact",
        "Imported trace descriptor summary after decompressing the compressed artifact.",
      );
      await writer.writeJson(
        "inspect/summarizeTrace.helper-machine.json",
        helperSummary,
        "inspect",
        "summarizeTrace",
        "Incident-style summary derived from the helper trace.",
      );
      await writer.writeJson(
        "inspect/createLocalInspectionProof.helper-machine.json",
        {
          kind: localProof.kind,
          machineId: localProof.machineId,
          correlationCount: localProof.correlations.length,
          eventCount: localProof.eventTimeline.length,
          formattedKeys: Object.keys(localProof.formatted),
          actorTree: localProof.actorTree,
        },
        "inspect",
        "createLocalInspectionProof",
        "Local inspection proof summary plus actor tree.",
      );
      await writer.writeJson(
        "inspect/createInspectionBufferSink.helper-machine.json",
        sink.messages(),
        "inspect",
        "createInspectionBufferSink",
        "Buffered serialized inspection messages after attaching to a live runtime.",
      );
      await writer.writeJson(
        "inspect/attachInspectionSink.helper-machine.json",
        liveEvents,
        "inspect",
        "attachInspectionSink",
        "Live runtime inspection events observed while the sink was attached.",
      );
      if (firstInspectionEvent !== undefined) {
        await writer.writeText(
          "inspect/formatInspectionEvent.helper-machine.txt",
          formatInspectionEvent(firstInspectionEvent),
          "inspect",
          "formatInspectionEvent",
          "Compact single-line formatting for the first inspection event.",
        );
        await writer.writeText(
          "inspect/formatInspectionEventPretty.helper-machine.txt",
          formatInspectionEventPretty(firstInspectionEvent),
          "inspect",
          "formatInspectionEventPretty",
          "Expanded formatting for the first inspection event.",
        );
      }
      await writer.writeText(
        "inspect/formatInspectionTimeline.helper-machine.txt",
        formatInspectionTimeline(inspectionEntries),
        "inspect",
        "formatInspectionTimeline",
        "Compact inspection timeline.",
      );
      await writer.writeText(
        "inspect/formatInspectionTimelinePretty.helper-machine.txt",
        formatInspectionTimelinePretty(inspectionEntries),
        "inspect",
        "formatInspectionTimelinePretty",
        "Expanded inspection timeline.",
      );
      await writer.writeText(
        "inspect/formatTrace.helper-machine.txt",
        formatTrace(helperTrace),
        "inspect",
        "formatTrace",
        "Compact trace formatting.",
      );
      await writer.writeText(
        "inspect/formatTracePretty.helper-machine.txt",
        formatTracePretty(helperTrace),
        "inspect",
        "formatTracePretty",
        "Expanded trace formatting.",
      );
      await writer.writeJson(
        "inspect/inspectTransition.helper-machine.json",
        inspectTransition(helperMachine, helperMachine.getInitialSnapshot(), { type: "START" }),
        "inspect",
        "inspectTransition",
        "Transition candidate analysis for START from idle.",
      );
      await writer.writeJson(
        "inspect/inspectMicrosteps.helper-machine.json",
        inspectMicrosteps(helperMachine, helperMachine.getInitialSnapshot(), { type: "START" }),
        "inspect",
        "inspectMicrosteps",
        "Microstep-by-microstep transition analysis for START from idle.",
      );
      await writer.writeJson(
        "inspect/inspectActions.helper-machine.json",
        inspectActions(helperMachine, helperMachine.getInitialSnapshot(), { type: "START" }),
        "inspect",
        "inspectActions",
        "Action/update facts for START from idle.",
      );

      const unknownNoTransition = whyNoTransition(
        helperMachine,
        helperMachine.getInitialSnapshot(),
        { type: "UNKNOWN" },
      );
      const blockedNoTransition = whyNoTransition(
        helperMachine,
        helperMachine.getInitialSnapshot(),
        { type: "LOCKED" },
      );
      await writer.writeJson(
        "inspect/whyNoTransition.unknown.json",
        unknownNoTransition,
        "inspect",
        "whyNoTransition",
        "Why UNKNOWN cannot transition from idle.",
      );
      await writer.writeJson(
        "inspect/whyNoTransition.locked.json",
        blockedNoTransition,
        "inspect",
        "whyNoTransition",
        "Why LOCKED is guard-blocked from idle.",
      );
      if (unknownNoTransition !== undefined) {
        await writer.writeText(
          "inspect/formatNoTransitionSummary.unknown.txt",
          formatNoTransitionSummary(unknownNoTransition),
          "inspect",
          "formatNoTransitionSummary",
          "Semantic explanation for an unhandled event.",
        );
      }
      if (blockedNoTransition !== undefined) {
        await writer.writeText(
          "inspect/formatNoTransitionSummary.locked.txt",
          formatNoTransitionSummary(blockedNoTransition),
          "inspect",
          "formatNoTransitionSummary",
          "Semantic explanation for a guard-blocked event.",
        );
      }
      await writer.writeText(
        "inspect/formatResourceFreshnessReport.semantic-trace.txt",
        formatResourceFreshnessReport(semanticTrace),
        "inspect",
        "formatResourceFreshnessReport",
        "Resource freshness summary over a synthetic semantic trace.",
      );
      await writer.writeText(
        "inspect/formatTransactionOverlapSummary.semantic-trace.txt",
        formatTransactionOverlapSummary(semanticTrace),
        "inspect",
        "formatTransactionOverlapSummary",
        "Transaction queue/overlap summary over a synthetic semantic trace.",
      );
      await writer.writeText(
        "inspect/formatRehydrationSummary.rehydration-trace.txt",
        formatRehydrationSummary(rehydrationTrace),
        "inspect",
        "formatRehydrationSummary",
        "Restore-path summary over a synthetic rehydration trace.",
      );
    },
  );
}
