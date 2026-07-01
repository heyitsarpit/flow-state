import { flow } from "../dist/index.mjs";
import {
  analyzeTrace,
  attachInspectionSink,
  captureTrace,
  createLocalInspectionProof,
  createInspectionBufferSink,
  formatInspectionTimelinePretty,
  formatNoTransitionSummary,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTracePretty,
  formatTransactionOverlapSummary,
  flowStories,
  graphOf,
  whyNoTransition,
} from "../../flow-state-inspect/dist/index.mjs";

const machine = flow.machine({
  id: "inspect.demo.machine",
  initial: "idle",
  context: () => ({
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

const graph = graphOf(machine);
const stories = flowStories(machine, [
  {
    id: "idle",
    title: "Idle",
    events: [],
    expectedState: "idle",
  },
  {
    id: "start-running",
    title: "Running",
    events: [{ type: "START" }],
    expectedState: "running",
  },
]);

const snapshotWithReceipts = Object.freeze({
  ...machine.getInitialSnapshot(),
  value: "running",
  context: {
    count: 1,
  },
  receipts: [
    {
      type: "machine:event",
      id: machine.id,
      eventType: "START",
      correlationId: "inspect.demo.machine:event:1",
      targetActorId: machine.id,
    },
    {
      type: "machine:transition",
      id: machine.id,
      from: "idle",
      to: "running",
      correlationId: "inspect.demo.machine:event:1",
    },
    {
      type: "resource:patch",
      id: "inspect.demo.resource",
      correlationId: "inspect.demo.machine:event:1",
    },
    {
      type: "transaction:success",
      id: "inspect.demo.tx",
      correlationId: "inspect.demo.machine:event:1",
    },
  ],
});

const trace = captureTrace(snapshotWithReceipts, {
  includeSnapshots: true,
});
const analysis = analyzeTrace(machine, trace);
const noTransition = whyNoTransition(machine, machine.getInitialSnapshot(), {
  type: "STOP",
});

const semanticTrace = captureTrace(
  Object.freeze({
    ...machine.getInitialSnapshot(),
    resources: {
      "inspect.semantic.resource": {
        id: "inspect.semantic.resource",
        status: "stale",
        availability: "value",
        activity: "idle",
        freshness: "invalidated",
        updatedAt: 150,
        invalidatedAt: 200,
        isPlaceholderData: false,
        value: { title: "Draft" },
      },
    },
    transactions: {
      "inspect.semantic.transaction": {
        id: "inspect.semantic.transaction",
        status: "success",
      },
    },
    receipts: [
      {
        type: "machine:event",
        id: machine.id,
        eventType: "START",
        targetActorId: machine.id,
        correlationId: "inspect.semantic:event:1",
      },
      {
        type: "query:start",
        id: "inspect.semantic.resource",
        mode: "observe",
        parentState: "idle",
        correlationId: "inspect.semantic:event:1",
      },
      {
        type: "resource:success",
        id: "inspect.semantic.resource",
        mode: "observe",
        parentState: "idle",
        status: "stale",
        availability: "value",
        freshness: "invalidated",
        updatedAt: 150,
        invalidatedAt: 200,
        correlationId: "inspect.semantic:event:1",
      },
      {
        type: "resource:freshness",
        id: "inspect.semantic.resource",
        from: "fresh",
        to: "invalidated",
        reason: "invalidate:transaction",
        parentState: "idle",
        correlationId: "inspect.semantic:event:1",
      },
      {
        type: "resource:invalidate",
        id: "inspect.semantic.resource",
        reason: "transaction",
        parentState: "idle",
        correlationId: "inspect.semantic:event:1",
      },
      {
        type: "transaction:queue",
        id: "inspect.semantic.transaction",
        queueKey: "inspect.semantic.transaction.scope",
        overlapCause: "serialize-scope",
        parentState: "idle",
        correlationId: "inspect.semantic:event:1",
      },
      {
        type: "transaction:dequeue",
        id: "inspect.semantic.transaction",
        queueKey: "inspect.semantic.transaction.scope",
        overlapCause: "serialize-scope",
        parentState: "idle",
        correlationId: "inspect.semantic:event:1",
      },
      {
        type: "transaction:start",
        id: "inspect.semantic.transaction",
        generation: 2,
        trigger: "event",
        queueKey: "inspect.semantic.transaction.scope",
        startedAt: 100,
        parentState: "idle",
        correlationId: "inspect.semantic:event:1",
      },
      {
        type: "transaction:success",
        id: "inspect.semantic.transaction",
        generation: 2,
        queueKey: "inspect.semantic.transaction.scope",
        startedAt: 100,
        endedAt: 145,
        durationMillis: 45,
        routedEventType: "START_OK",
        parentState: "idle",
        correlationId: "inspect.semantic:event:1",
      },
    ],
  }),
);

const rehydrationMachine = flow.machine({
  id: "inspect.rehydration.machine",
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
    value: "busy",
    context: { token: "seeded" },
    resources: {
      "rehydration.project": {
        id: "rehydration.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        updatedAt: 250,
        isPlaceholderData: false,
        value: { id: "project-1", name: "Seeded" },
      },
    },
    transactions: {
      "rehydration.save": {
        id: "rehydration.save",
        status: "interrupt",
      },
    },
    streams: {
      "rehydration.stream": {
        id: "rehydration.stream",
        status: "running",
        generation: 3,
        emitted: 1,
        value: "seeded",
      },
    },
    timers: {
      "rehydration.timer": {
        id: "rehydration.timer",
        status: "scheduled",
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

const runtime = flow.runtime(
  flow.app({ modules: [] }).layer({
    store: flow.store.test(),
    orchestrators: flow.orchestrators.test(),
  }),
);
const received = [];
const unsubscribe = runtime.inspection.subscribe((event) => {
  received.push(event);
});
const actor = runtime.createActor(machine);
const sink = createInspectionBufferSink();
const detachSink = attachInspectionSink(runtime.inspection, sink, {
  includeHistory: true,
  redact: (event) => ({
    type: event.type,
    id: event.id,
    sequence: event.sequence,
  }),
});
actor.send({ type: "START" });
actor.send({ type: "STOP" });
await actor.flush();
unsubscribe();
detachSink();

const output = {
  graphOf: {
    kind: graph.kind,
    machineId: graph.machine.id,
    initial: graph.machine.getInitialSnapshot().value,
    states: Object.keys(graph.machine.config.states),
  },
  flowStories: stories,
  captureTrace: {
    kind: trace.kind,
    receiptTypes: trace.report.summary.receiptTypes,
    relatedIds: trace.report.summary.relatedIds,
    bucketCounts: {
      events: trace.report.events.length,
      transitions: trace.report.transitions.length,
      resources: trace.report.resources.length,
      transactions: trace.report.transactions.length,
    },
    firstCorrelation: trace.report.correlations[0],
  },
  formattedTrace: formatTracePretty(trace),
  semanticSummaries: {
    noTransition: noTransition && formatNoTransitionSummary(noTransition),
    resourceFreshness: formatResourceFreshnessReport(semanticTrace),
    transactionOverlap: formatTransactionOverlapSummary(semanticTrace),
    rehydration: formatRehydrationSummary(rehydrationTrace),
  },
  analyzeTrace: {
    kind: analysis.kind,
    machineId: analysis.machine.id,
    sameReceiptCount: analysis.receipts.length,
    sameSummary: analysis.report.summary,
  },
  runtimeInspection: received.map((event) => ({
    type: event.type,
    id: event.id,
    eventType: "eventType" in event ? event.eventType : undefined,
    targetActorId: "targetActorId" in event ? event.targetActorId : undefined,
    correlationId: "correlationId" in event ? event.correlationId : undefined,
    state:
      event.type === "actor:snapshot" && event.snapshot !== undefined
        ? event.snapshot.value
        : undefined,
    })),
  inspectionSink: sink.messages(),
  formattedInspectionTimeline: formatInspectionTimelinePretty(runtime.inspection.entries()),
  localInspectionProof: createLocalInspectionProof(trace, runtime.inspection.entries()),
  actorReceipts: actor.receipts().map((receipt) => ({
    type: receipt.type,
    id: receipt.id,
    eventType: receipt.eventType,
    targetActorId: receipt.targetActorId,
    correlationId: receipt.correlationId,
  })),
};

console.log(JSON.stringify(output, null, 2));

await actor.dispose();
await runtime.dispose();
