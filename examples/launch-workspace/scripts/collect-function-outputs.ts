/// <reference types="node" />

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import * as flow from "flow-state";
import {
  analyzeTrace,
  attachInspectionSink,
  buildBehaviorContract,
  captureTrace,
  compressTraceArtifact,
  createInspectionBufferSink,
  createLocalInspectionProof,
  decompressTraceArtifact,
  diffBehaviorContracts,
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
  renderBehaviorContract,
  renderBehaviorCoverage,
  renderBehaviorDiff,
  sliceBehaviorContract,
  storyToDoc,
  summarizeTrace,
  whyNoTransition,
} from "flow-state/inspect";
import {
  formatHarnessTracePretty,
  formatPendingWorkPretty,
  formatScenarioTranscript,
  formatTransactionEventsPretty,
  flowTest,
  runFlowScenario,
  scenarioToReport,
} from "flow-state/testing";

import { BehaviorGateway } from "../src/app/behavior";
import {
  LaunchWorkspaceApp,
  LaunchWorkspaceModule,
  Project,
  launchWorkspaceMachine,
  launchWorkspaceStories,
  launchWorkspaceTrace,
} from "../src/launchWorkspace";

type ManifestEntry = Readonly<{
  area: "inventory" | "behavior" | "testing" | "inspect";
  functionName: string;
  outputPath: string;
  format: "json" | "txt";
  note: string;
}>;

const outputRoot = resolve(process.argv[2] ?? "./.eval-artifacts/latest/function-outputs");
const repoRoot = resolve(process.argv[3] ?? "../..");
const manifest: Array<ManifestEntry> = [];

async function ensureParent(path: string) {
  await mkdir(dirname(path), { recursive: true });
}

async function writeJson(
  relativePath: string,
  value: unknown,
  area: ManifestEntry["area"],
  functionName: string,
  note: string,
) {
  const target = resolve(outputRoot, relativePath);
  await ensureParent(target);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  manifest.push({
    area,
    functionName,
    outputPath: relativePath,
    format: "json",
    note,
  });
}

async function writeText(
  relativePath: string,
  value: string,
  area: ManifestEntry["area"],
  functionName: string,
  note: string,
) {
  const target = resolve(outputRoot, relativePath);
  await ensureParent(target);
  await writeFile(target, `${value}\n`, "utf8");
  manifest.push({
    area,
    functionName,
    outputPath: relativePath,
    format: "txt",
    note,
  });
}

function traceSummary(trace: ReturnType<typeof captureTrace>) {
  const actorIds: Array<string> = [];
  const visitActor = (node: Readonly<{ id: string; children?: Record<string, unknown> }>) => {
    actorIds.push(node.id);
    const children = node.children;
    if (children === undefined || typeof children !== "object" || children === null) {
      return;
    }

    for (const child of Object.values(children)) {
      if (
        typeof child === "object" &&
        child !== null &&
        "id" in child &&
        typeof child.id === "string"
      ) {
        visitActor(child as Readonly<{ id: string; children?: Record<string, unknown> }>);
      }
    }
  };

  visitActor(trace.actorHierarchy);

  return {
    kind: trace.kind,
    receiptCount: trace.receipts.length,
    correlationCount: trace.report.correlations.length,
    issueCount: trace.report.issues.length,
    outcomeCount: trace.report.outcomes.length,
    summary: trace.report.summary,
    actorIds,
  };
}

function scenarioOutcomeSummary(outcome: Awaited<ReturnType<typeof runFlowScenario>>) {
  if (outcome.kind === "story-run-blocked") {
    return {
      kind: outcome.kind,
      status: "blocked" as const,
      storyId: outcome.story.id,
      reason: outcome.reason,
    };
  }

  if (outcome.kind === "scenario-internal-error") {
    return {
      kind: outcome.kind,
      status: "internal-error" as const,
      storyId: outcome.story.id,
      message: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
    };
  }

  return {
    kind: outcome.kind,
    status: outcome.status,
    storyId: outcome.story.id,
    finalState: outcome.finalSnapshot.value,
    receiptCount: outcome.receipts.length,
    issueCount: outcome.issues.length,
    trace: traceSummary(outcome.trace),
  };
}

function scenarioReportSummary(report: ReturnType<typeof scenarioToReport>) {
  return {
    kind: report.kind,
    storyId: report.story.id,
    ok: report.ok,
    checks: report.checks,
    failures: report.failures,
  };
}

function importedTraceSummary(trace: ReturnType<typeof importTraceArtifact>) {
  if (trace === undefined) {
    return {
      imported: false,
    };
  }

  return {
    imported: true,
    ...traceSummary(trace),
  };
}

function graphSummary(graph: ReturnType<typeof graphOf>) {
  return graph.toJSON();
}

function analysisSummary(analysis: ReturnType<typeof analyzeTrace>) {
  return {
    kind: analysis.kind,
    machineId: analysis.machine.id,
    graph: analysis.graph.toJSON(),
    receiptCount: analysis.receipts.length,
    summary: analysis.report.summary,
  };
}

const helperMachine = flow.machine<
  { readonly allowed: boolean; readonly count: number },
  | Readonly<{ readonly type: "START" }>
  | Readonly<{ readonly type: "STOP" }>
  | Readonly<{ readonly type: "LOCKED" }>
  | Readonly<{ readonly type: "UNKNOWN" }>,
  "idle" | "running" | "done"
>({
  id: "launch-workspace.eval.inspect.helper-machine",
  initial: "idle",
  context: () => ({
    allowed: false,
    count: 0,
  }),
  states: {
    idle: {
      on: {
        START: {
          target: "running",
          update: ({ context }) => ({
            count: context.count + 1,
          }),
          actions: () => [
            {
              type: "transaction:start",
              id: "launch-workspace.eval.inspect.transaction",
            },
          ],
        },
        LOCKED: {
          target: "running",
          guard: ({ context }) => context.allowed,
        },
      },
    },
    running: {
      on: {
        STOP: {
          target: "done",
        },
      },
    },
    done: {},
  },
});

function createTimerMachine(id: string) {
  return flow.machine<{ readonly ticks: number }, never, "waiting" | "done">({
    id,
    initial: "waiting",
    context: () => ({ ticks: 0 }),
    states: {
      waiting: {
        after: flow.after({
          id: `${id}.dismiss`,
          delay: "2 seconds",
          target: "done",
          update: ({ context }) => ({ ticks: context.ticks + 1 }),
        }),
      },
      done: {},
    },
  });
}

const semanticTrace = captureTrace(
  Object.freeze({
    ...helperMachine.getInitialSnapshot(),
    resources: {
      "trace.resource": {
        id: "trace.resource",
        status: "stale" as const,
        availability: "value" as const,
        activity: "idle" as const,
        freshness: "invalidated" as const,
        updatedAt: 150,
        invalidatedAt: 200,
        isPlaceholderData: false,
        value: { title: "Draft" },
      },
    },
    transactions: {
      "trace.transaction": {
        id: "trace.transaction",
        status: "success" as const,
        value: { saved: true },
      },
    },
    receipts: [
      {
        type: "machine:event",
        id: helperMachine.id,
        eventType: "START",
        targetActorId: helperMachine.id,
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "resource:start",
        id: "trace.resource",
        mode: "observe",
        parentState: "idle",
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "resource:placeholder",
        id: "trace.resource",
        parentState: "idle",
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "resource:success",
        id: "trace.resource",
        mode: "observe",
        parentState: "idle",
        status: "stale",
        availability: "value",
        freshness: "invalidated",
        updatedAt: 150,
        invalidatedAt: 200,
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "resource:freshness",
        id: "trace.resource",
        from: "fresh",
        to: "invalidated",
        reason: "invalidate:transaction",
        parentState: "idle",
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "resource:invalidate",
        id: "trace.resource",
        reason: "transaction",
        parentState: "idle",
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "transaction:queue",
        id: "trace.transaction",
        queueKey: "trace.transaction.scope",
        overlapCause: "serialize-scope",
        parentState: "idle",
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "transaction:dequeue",
        id: "trace.transaction",
        queueKey: "trace.transaction.scope",
        overlapCause: "serialize-scope",
        parentState: "idle",
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "transaction:start",
        id: "trace.transaction",
        generation: 2,
        trigger: "event",
        queueKey: "trace.transaction.scope",
        startedAt: 100,
        parentState: "idle",
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "transaction:preview-patch",
        id: "trace.transaction",
        generation: 2,
        queueKey: "trace.transaction.scope",
        refId: "trace.resource",
        previewIndex: 1,
        previewCount: 1,
        parentState: "idle",
        correlationId: "trace.semantic:event:1",
      },
      {
        type: "transaction:success",
        id: "trace.transaction",
        generation: 2,
        queueKey: "trace.transaction.scope",
        startedAt: 100,
        endedAt: 145,
        durationMillis: 45,
        routedEventType: "SAVE_OK",
        parentState: "idle",
        correlationId: "trace.semantic:event:1",
      },
    ],
  }),
);

const rehydrationMachine = flow.machine<
  { readonly token: string },
  Readonly<{ readonly type: "STOP" }>,
  "idle" | "busy"
>({
  id: "launch-workspace.eval.inspect.rehydration-machine",
  initial: "idle",
  context: () => ({ token: "" }),
  states: {
    idle: {},
    busy: {},
  },
});

const rehydrationTrace = captureTrace(
  Object.freeze({
    ...rehydrationMachine.getInitialSnapshot(),
    value: "busy" as const,
    context: { token: "seeded" },
    resources: {
      "rehydration.project": {
        id: "rehydration.project",
        status: "success" as const,
        availability: "value" as const,
        activity: "idle" as const,
        freshness: "fresh" as const,
        updatedAt: 250,
        isPlaceholderData: false,
        value: { id: "project-1", name: "Seeded" },
      },
    },
    transactions: {
      "rehydration.save": {
        id: "rehydration.save",
        status: "interrupt" as const,
      },
    },
    streams: {
      "rehydration.stream": {
        id: "rehydration.stream",
        status: "running" as const,
        generation: 3,
        emitted: 1,
        hasValue: true as const,
        value: "seeded",
      },
    },
    timers: {
      "rehydration.timer": {
        id: "rehydration.timer",
        status: "scheduled" as const,
        generation: 2,
        parentState: "busy",
        startedAt: 0,
        dueAt: 1_000,
      },
    },
    receipts: [
      { type: "actor:start", id: "rehydration.actor" },
      {
        type: "actor:restore",
        id: "rehydration.actor",
        correlationId: "rehydration.actor:restore:1",
      },
      {
        type: "resource:hydrate",
        id: "rehydration.project",
        status: "success",
        availability: "value",
        freshness: "fresh",
        updatedAt: 250,
        parentState: "busy",
        correlationId: "rehydration.actor:restore:1",
      },
      {
        type: "timer:resume",
        id: "rehydration.timer",
        generation: 2,
        parentState: "busy",
        startedAt: 0,
        dueAt: 1_000,
        restored: true,
        correlationId: "rehydration.actor:restore:1",
      },
      {
        type: "stream:resume",
        id: "rehydration.stream",
        generation: 3,
        parentState: "busy",
        emitted: 1,
        lastValueAvailable: true,
        restored: true,
        correlationId: "rehydration.actor:restore:1",
      },
      {
        type: "transaction:interrupt",
        id: "rehydration.save",
        generation: 1,
        parentState: "busy",
        correlationId: "rehydration.actor:restore:1",
      },
    ],
  }),
);

async function main() {
  await mkdir(outputRoot, { recursive: true });

  await writeJson(
    "inventory/LaunchWorkspaceModule.inventory.json",
    LaunchWorkspaceModule.inventory(),
    "inventory",
    "LaunchWorkspaceModule.inventory",
    "Module-level inventory shape from the flagship example.",
  );
  await writeJson(
    "inventory/LaunchWorkspaceApp.inventory.json",
    LaunchWorkspaceApp.inventory(),
    "inventory",
    "LaunchWorkspaceApp.inventory",
    "App-level inventory shape consumed by behavior composition and harness tooling.",
  );
  await writeJson(
    "inventory/Project.inventory.json",
    Project.inventory(),
    "inventory",
    "Project.inventory",
    "Smaller module inventory example.",
  );

  const behaviorContract = buildBehaviorContract(BehaviorGateway);
  const docsContract = JSON.parse(
    await readFile(resolve(repoRoot, "apps/docs/src/generated/behavior-contract.json"), "utf8"),
  );
  const launchWorkspaceSlice = sliceBehaviorContract(behaviorContract, "LaunchWorkspace");
  const behaviorDiff = diffBehaviorContracts(behaviorContract, docsContract, {
    moduleId: "LaunchWorkspace",
  });

  await writeJson(
    "behavior/buildBehaviorContract.json",
    behaviorContract,
    "behavior",
    "buildBehaviorContract",
    "Canonical behavior contract built from the explicit behavior gateway.",
  );
  await writeJson(
    "behavior/sliceBehaviorContract.LaunchWorkspace.json",
    launchWorkspaceSlice,
    "behavior",
    "sliceBehaviorContract",
    "Module slice derived from the canonical app contract.",
  );
  await writeText(
    "behavior/renderBehaviorContract.txt",
    renderBehaviorContract(behaviorContract),
    "behavior",
    "renderBehaviorContract",
    "Shared brief renderer over the canonical contract.",
  );
  await writeText(
    "behavior/renderBehaviorContract.LaunchWorkspace.txt",
    renderBehaviorContract(behaviorContract, { moduleId: "LaunchWorkspace" }),
    "behavior",
    "renderBehaviorContract",
    "Module-slice shared brief renderer.",
  );
  await writeText(
    "behavior/renderBehaviorCoverage.LaunchWorkspace.txt",
    renderBehaviorCoverage(BehaviorGateway, { moduleId: "LaunchWorkspace" }),
    "behavior",
    "renderBehaviorCoverage",
    "Coverage renderer over the live behavior gateway.",
  );
  await writeJson(
    "behavior/diffBehaviorContracts.LaunchWorkspace-vs-docs.json",
    behaviorDiff,
    "behavior",
    "diffBehaviorContracts",
    "Structured contract diff between the live Launch Workspace contract and the committed docs contract.",
  );
  await writeText(
    "behavior/renderBehaviorDiff.LaunchWorkspace-vs-docs.txt",
    renderBehaviorDiff(behaviorDiff),
    "behavior",
    "renderBehaviorDiff",
    "Human-readable behavior diff for the module slice.",
  );

  const overviewStory = launchWorkspaceStories.stories[0]!;
  const assistantStory = launchWorkspaceStories.stories[1]!;
  const overviewRun = await runFlowScenario(
    LaunchWorkspaceApp,
    launchWorkspaceMachine,
    overviewStory,
  );
  const assistantRun = await runFlowScenario(
    LaunchWorkspaceApp,
    launchWorkspaceMachine,
    assistantStory,
  );

  await writeJson(
    "testing/flowStories.LaunchWorkspace.json",
    {
      kind: launchWorkspaceStories.kind,
      machineId: launchWorkspaceStories.machine.id,
      storyIds: launchWorkspaceStories.stories.map((story) => story.id),
      stories: launchWorkspaceStories.stories,
    },
    "testing",
    "flowStories",
    "Curated story registry attached to the Launch Workspace machine.",
  );
  await writeJson(
    "testing/storyToDoc.overview-ready.json",
    storyToDoc(overviewStory),
    "testing",
    "storyToDoc",
    "Docs-friendly story descriptor for the ready overview story.",
  );
  await writeJson(
    "testing/storyToDoc.assistant-running.json",
    storyToDoc(assistantStory),
    "testing",
    "storyToDoc",
    "Docs-friendly story descriptor for the assistant-running story.",
  );
  await writeJson(
    "testing/runFlowScenario.overview-ready.json",
    scenarioOutcomeSummary(overviewRun),
    "testing",
    "runFlowScenario",
    "Runnable story outcome for the ready overview story.",
  );
  await writeJson(
    "testing/runFlowScenario.assistant-running.json",
    scenarioOutcomeSummary(assistantRun),
    "testing",
    "runFlowScenario",
    "Runnable story outcome for the assistant-running story.",
  );
  await writeJson(
    "testing/scenarioToReport.overview-ready.json",
    scenarioReportSummary(scenarioToReport(overviewRun)),
    "testing",
    "scenarioToReport",
    "Story-backed test report for the ready overview story.",
  );
  await writeJson(
    "testing/scenarioToReport.assistant-running.json",
    scenarioReportSummary(scenarioToReport(assistantRun)),
    "testing",
    "scenarioToReport",
    "Story-backed test report for the assistant-running story.",
  );

  const timerHarness = flowTest(createTimerMachine("launch-workspace.eval.timer")).start();
  const harnessTrace = timerHarness.captureTrace();
  await writeText(
    "testing/formatPendingWorkPretty.txt",
    formatPendingWorkPretty(timerHarness.pendingWork()),
    "testing",
    "formatPendingWorkPretty",
    "Readable snapshot of pending harness timers/mailbox state.",
  );
  await writeText(
    "testing/formatHarnessTracePretty.txt",
    formatHarnessTracePretty(harnessTrace),
    "testing",
    "formatHarnessTracePretty",
    "Readable harness trace summary.",
  );
  await writeText(
    "testing/formatScenarioTranscript.txt",
    formatScenarioTranscript(harnessTrace.receipts),
    "testing",
    "formatScenarioTranscript",
    "Scenario-style receipt transcript from a tiny timer harness.",
  );
  await writeText(
    "testing/formatTransactionEventsPretty.txt",
    formatTransactionEventsPretty([
      {
        type: "transaction:start",
        id: "launch.save",
        parentState: "editing",
      },
      {
        type: "transaction:success",
        id: "launch.save",
        parentState: "editing",
      },
    ]),
    "testing",
    "formatTransactionEventsPretty",
    "Readable transaction receipt list formatting.",
  );

  const helperGraph = graphOf(helperMachine);
  const helperTransition = inspectTransition(helperMachine, helperMachine.getInitialSnapshot(), {
    type: "START",
  });
  const helperMicrosteps = inspectMicrosteps(helperMachine, helperMachine.getInitialSnapshot(), {
    type: "START",
  });
  const helperActions = inspectActions(helperMachine, helperMachine.getInitialSnapshot(), {
    type: "START",
  });
  const blockedNoTransition = whyNoTransition(helperMachine, helperMachine.getInitialSnapshot(), {
    type: "LOCKED",
  });
  const unknownNoTransition = whyNoTransition(helperMachine, helperMachine.getInitialSnapshot(), {
    type: "UNKNOWN",
  });

  const runtime = flow.runtime(
    flow.app({ modules: [] }).layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
    }),
  );
  const liveEvents: Array<{
    readonly type: string;
    readonly id: string;
    readonly sequence: number;
    readonly correlationId?: string;
    readonly eventType?: string;
  }> = [];
  const sink = createInspectionBufferSink<string>();
  const sinkSubscription = attachInspectionSink(runtime.inspection, sink, {
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
  });
  const runtimeSubscription = runtime.inspection.subscribe((event) => {
    liveEvents.push({
      type: event.type,
      id: event.id,
      sequence: event.sequence,
      correlationId: "correlationId" in event ? event.correlationId : undefined,
      eventType: "eventType" in event ? event.eventType : undefined,
    });
  });

  const helperActor = runtime.createActor(helperMachine);
  helperActor.send({ type: "STOP" });
  helperActor.send({ type: "START" });
  helperActor.send({ type: "STOP" });
  await helperActor.flush();

  const inspectionEntries = runtime.inspection.entries();
  const helperTrace = captureTrace(helperActor.snapshot(), {
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

  await writeJson(
    "inspect/graphOf.helper-machine.json",
    graphSummary(helperGraph),
    "inspect",
    "graphOf",
    "Serializable graph descriptor for the helper inspection machine.",
  );
  await writeJson(
    "inspect/captureTrace.helper-machine.json",
    traceSummary(helperTrace),
    "inspect",
    "captureTrace",
    "Trace summary after one no-transition and one happy-path run.",
  );
  await writeJson(
    "inspect/analyzeTrace.helper-machine.json",
    analysisSummary(helperAnalysis),
    "inspect",
    "analyzeTrace",
    "Machine-aware wrapper over the captured helper trace.",
  );
  await writeJson(
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
  await writeJson(
    "inspect/exportTraceArtifact.helper-machine.json",
    helperTraceArtifact,
    "inspect",
    "exportTraceArtifact",
    "Portable JSON trace artifact.",
  );
  await writeJson(
    "inspect/importTraceArtifact.helper-machine.json",
    importedTraceSummary(importedTrace),
    "inspect",
    "importTraceArtifact",
    "Imported trace descriptor summary from the exported artifact.",
  );
  await writeJson(
    "inspect/compressTraceArtifact.helper-machine.json",
    {
      compressed: compressedTrace !== undefined,
      byteLength: compressedTrace?.byteLength ?? 0,
    },
    "inspect",
    "compressTraceArtifact",
    "Compressed trace artifact byte summary.",
  );
  await writeJson(
    "inspect/decompressTraceArtifact.helper-machine.json",
    importedTraceSummary(decompressedTrace),
    "inspect",
    "decompressTraceArtifact",
    "Imported trace descriptor summary after decompressing the compressed artifact.",
  );
  await writeJson(
    "inspect/summarizeTrace.helper-machine.json",
    helperSummary,
    "inspect",
    "summarizeTrace",
    "Incident-style summary derived from the helper trace.",
  );
  await writeJson(
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
  await writeJson(
    "inspect/createInspectionBufferSink.helper-machine.json",
    sink.messages(),
    "inspect",
    "createInspectionBufferSink",
    "Buffered serialized inspection messages after attaching to a live runtime.",
  );
  await writeJson(
    "inspect/attachInspectionSink.helper-machine.json",
    liveEvents,
    "inspect",
    "attachInspectionSink",
    "Live runtime inspection events observed while the sink was attached.",
  );
  if (firstInspectionEvent !== undefined) {
    await writeText(
      "inspect/formatInspectionEvent.helper-machine.txt",
      formatInspectionEvent(firstInspectionEvent),
      "inspect",
      "formatInspectionEvent",
      "Compact single-line formatting for the first inspection event.",
    );
    await writeText(
      "inspect/formatInspectionEventPretty.helper-machine.txt",
      formatInspectionEventPretty(firstInspectionEvent),
      "inspect",
      "formatInspectionEventPretty",
      "Expanded formatting for the first inspection event.",
    );
  }
  await writeText(
    "inspect/formatInspectionTimeline.helper-machine.txt",
    formatInspectionTimeline(inspectionEntries),
    "inspect",
    "formatInspectionTimeline",
    "Compact inspection timeline.",
  );
  await writeText(
    "inspect/formatInspectionTimelinePretty.helper-machine.txt",
    formatInspectionTimelinePretty(inspectionEntries),
    "inspect",
    "formatInspectionTimelinePretty",
    "Expanded inspection timeline.",
  );
  await writeText(
    "inspect/formatTrace.helper-machine.txt",
    formatTrace(helperTrace),
    "inspect",
    "formatTrace",
    "Compact trace formatting.",
  );
  await writeText(
    "inspect/formatTracePretty.helper-machine.txt",
    formatTracePretty(helperTrace),
    "inspect",
    "formatTracePretty",
    "Expanded trace formatting.",
  );
  await writeJson(
    "inspect/inspectTransition.helper-machine.json",
    helperTransition,
    "inspect",
    "inspectTransition",
    "Transition candidate analysis for START from idle.",
  );
  await writeJson(
    "inspect/inspectMicrosteps.helper-machine.json",
    helperMicrosteps,
    "inspect",
    "inspectMicrosteps",
    "Microstep-by-microstep transition analysis for START from idle.",
  );
  await writeJson(
    "inspect/inspectActions.helper-machine.json",
    helperActions,
    "inspect",
    "inspectActions",
    "Action/update facts for START from idle.",
  );
  await writeJson(
    "inspect/whyNoTransition.unknown.json",
    unknownNoTransition,
    "inspect",
    "whyNoTransition",
    "Why UNKNOWN cannot transition from idle.",
  );
  await writeJson(
    "inspect/whyNoTransition.locked.json",
    blockedNoTransition,
    "inspect",
    "whyNoTransition",
    "Why LOCKED is guard-blocked from idle.",
  );
  if (unknownNoTransition !== undefined) {
    await writeText(
      "inspect/formatNoTransitionSummary.unknown.txt",
      formatNoTransitionSummary(unknownNoTransition),
      "inspect",
      "formatNoTransitionSummary",
      "Semantic explanation for an unhandled event.",
    );
  }
  if (blockedNoTransition !== undefined) {
    await writeText(
      "inspect/formatNoTransitionSummary.locked.txt",
      formatNoTransitionSummary(blockedNoTransition),
      "inspect",
      "formatNoTransitionSummary",
      "Semantic explanation for a guard-blocked event.",
    );
  }
  await writeText(
    "inspect/formatResourceFreshnessReport.semantic-trace.txt",
    formatResourceFreshnessReport(semanticTrace),
    "inspect",
    "formatResourceFreshnessReport",
    "Resource freshness summary over a synthetic semantic trace.",
  );
  await writeText(
    "inspect/formatTransactionOverlapSummary.semantic-trace.txt",
    formatTransactionOverlapSummary(semanticTrace),
    "inspect",
    "formatTransactionOverlapSummary",
    "Transaction queue/overlap summary over a synthetic semantic trace.",
  );
  await writeText(
    "inspect/formatRehydrationSummary.rehydration-trace.txt",
    formatRehydrationSummary(rehydrationTrace),
    "inspect",
    "formatRehydrationSummary",
    "Restore-path summary over a synthetic rehydration trace.",
  );

  runtimeSubscription.unsubscribe();
  sinkSubscription.unsubscribe();
  await helperActor.dispose();
  await runtime.dispose();

  await writeJson("manifest.json", manifest, "behavior", "manifest", "Function-to-output index.");
}

await main();
