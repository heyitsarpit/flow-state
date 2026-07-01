import { flow } from "../dist/index.mjs";
import { captureTrace, flowStories, graphOf, replayTrace } from "../dist/inspect.mjs";

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
  { name: "Idle", state: "idle" },
  { name: "Running", state: "running" },
]);

const snapshotWithReceipts = Object.freeze({
  ...machine.getInitialSnapshot(),
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
const replay = replayTrace(machine, trace);

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
actor.send({ type: "START" });
actor.send({ type: "STOP" });
await actor.flush();
unsubscribe();

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
  replayTrace: {
    kind: replay.kind,
    machineId: replay.machine.id,
    sameReceiptCount: replay.receipts.length,
    sameSummary: replay.report.summary,
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
