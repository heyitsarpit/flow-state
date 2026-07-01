import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { captureTrace, replayTrace } from "./inspect.js";

describe("inspect trace reports", () => {
  it("captures receipt categories and preserves replay lanes deterministically", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle"
    >({
      id: "flow-trace.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      receipts: [
        { type: "machine:event", id: machine.id, eventType: "ADVANCE" },
        { type: "machine:transition", id: machine.id, from: "idle", to: "idle" },
        { type: "resource:patch", id: "trace.resource" },
        { type: "transaction:success", id: "trace.transaction.success" },
        { type: "transaction:failure", id: "trace.transaction.failure", error: "denied" },
        { type: "transaction:defect", id: "trace.transaction.defect", cause: "boom" },
        { type: "stream:done", id: "trace.stream.success" },
        { type: "child:interrupt", id: "trace.child.interrupt" },
        { type: "timer:interrupt", id: "trace.timer.interrupt" },
        { type: "actor:start", id: "trace.actor" },
        { type: "domain:custom", id: "trace.domain" },
      ],
    });

    const trace = captureTrace(snapshot, { includeSnapshots: true });
    const replay = replayTrace(machine, trace);
    const replayAgain = replayTrace(machine, trace);

    expect(trace.kind).toBe("trace");
    expect(trace.receipts).toEqual(snapshot.receipts);
    expect(trace.report.events.map((receipt) => receipt.type)).toEqual(["machine:event"]);
    expect(trace.report.transitions.map((receipt) => receipt.type)).toEqual(["machine:transition"]);
    expect(trace.report.resources.map((receipt) => receipt.type)).toEqual(["resource:patch"]);
    expect(trace.report.transactions.map((receipt) => receipt.type)).toEqual([
      "transaction:success",
      "transaction:failure",
      "transaction:defect",
    ]);
    expect(trace.report.streams.map((receipt) => receipt.type)).toEqual(["stream:done"]);
    expect(trace.report.children.map((receipt) => receipt.type)).toEqual(["child:interrupt"]);
    expect(trace.report.timers.map((receipt) => receipt.type)).toEqual(["timer:interrupt"]);
    expect(trace.report.actors.map((receipt) => receipt.type)).toEqual(["actor:start"]);
    expect(trace.report.other.map((receipt) => receipt.type)).toEqual(["domain:custom"]);
    expect(trace.report.summary).toMatchObject({
      receiptTypes: [
        "machine:event",
        "machine:transition",
        "resource:patch",
        "transaction:success",
        "transaction:failure",
        "transaction:defect",
        "stream:done",
        "child:interrupt",
        "timer:interrupt",
        "actor:start",
        "domain:custom",
      ],
      relatedIds: [
        "flow-trace.machine",
        "trace.resource",
        "trace.transaction.success",
        "trace.transaction.failure",
        "trace.transaction.defect",
        "trace.stream.success",
        "trace.child.interrupt",
        "trace.timer.interrupt",
        "trace.actor",
        "trace.domain",
      ],
    });

    expect(replay.kind).toBe("replay");
    expect(replay.receipts).toEqual(trace.receipts);
    expect(replay.report).toEqual(trace.report);
    expect(replayAgain.report).toEqual(replay.report);
    expect(replay.report.lanes.success.map((receipt) => receipt.type)).toEqual([
      "transaction:success",
      "stream:done",
    ]);
    expect(replay.report.lanes.failure.map((receipt) => receipt.type)).toEqual([
      "transaction:failure",
    ]);
    expect(replay.report.lanes.defect.map((receipt) => receipt.type)).toEqual([
      "transaction:defect",
    ]);
    expect(replay.report.lanes.interrupt.map((receipt) => receipt.type)).toEqual([
      "child:interrupt",
      "timer:interrupt",
    ]);
  });

  it("groups correlated receipts by the originating machine event", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }> | Readonly<{ readonly type: "TIMEOUT" }>,
      "idle" | "ready"
    >({
      id: "flow-trace.correlation.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
        ready: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      receipts: [
        {
          type: "machine:event",
          id: machine.id,
          eventType: "ADVANCE",
          correlationId: "flow-trace.correlation.machine:event:1",
          targetActorId: machine.id,
        },
        {
          type: "machine:transition",
          id: machine.id,
          from: "idle",
          to: "ready",
          correlationId: "flow-trace.correlation.machine:event:1",
        },
        {
          type: "resource:patch",
          id: "trace.resource",
          correlationId: "flow-trace.correlation.machine:event:1",
        },
        {
          type: "transaction:start",
          id: "trace.transaction",
          correlationId: "flow-trace.correlation.machine:event:1",
        },
        {
          type: "stream:start",
          id: "trace.stream",
          correlationId: "flow-trace.correlation.machine:event:1",
        },
        {
          type: "child:start",
          id: "trace.child",
          correlationId: "flow-trace.correlation.machine:event:1",
        },
        {
          type: "timer:start",
          id: "trace.timer",
          correlationId: "flow-trace.correlation.machine:event:1",
        },
        {
          type: "timer:fire",
          id: "trace.timer",
          correlationId: "flow-trace.correlation.machine:event:1",
        },
        {
          type: "machine:event",
          id: machine.id,
          eventType: "TIMEOUT",
          correlationId: "flow-trace.correlation.machine:event:2",
          targetActorId: machine.id,
        },
        {
          type: "machine:no-transition",
          id: machine.id,
          eventType: "TIMEOUT",
          correlationId: "flow-trace.correlation.machine:event:2",
        },
      ],
    });

    const trace = captureTrace(snapshot, { includeSnapshots: true });
    const advanceCorrelation = trace.report.correlations.find(
      (correlation) => correlation.correlationId === "flow-trace.correlation.machine:event:1",
    );
    const timeoutCorrelation = trace.report.correlations.find(
      (correlation) => correlation.correlationId === "flow-trace.correlation.machine:event:2",
    );

    expect(trace.report.correlations).toHaveLength(2);
    expect(advanceCorrelation).toMatchObject({
      correlationId: "flow-trace.correlation.machine:event:1",
      index: 0,
      event: expect.objectContaining({
        type: "machine:event",
        eventType: "ADVANCE",
      }),
      stateBefore: "idle",
      stateAfter: "ready",
      summary: {
        eventType: "ADVANCE",
        receiptTypes: [
          "machine:event",
          "machine:transition",
          "resource:patch",
          "transaction:start",
          "stream:start",
          "child:start",
          "timer:start",
          "timer:fire",
        ],
        relatedIds: [
          "flow-trace.correlation.machine",
          "trace.resource",
          "trace.transaction",
          "trace.stream",
          "trace.child",
          "trace.timer",
        ],
      },
    });
    expect(advanceCorrelation?.transitions.map((receipt) => receipt.type)).toEqual([
      "machine:transition",
    ]);
    expect(advanceCorrelation?.resources.map((receipt) => receipt.type)).toEqual([
      "resource:patch",
    ]);
    expect(advanceCorrelation?.transactions.map((receipt) => receipt.type)).toEqual([
      "transaction:start",
    ]);
    expect(advanceCorrelation?.streams.map((receipt) => receipt.type)).toEqual(["stream:start"]);
    expect(advanceCorrelation?.children.map((receipt) => receipt.type)).toEqual(["child:start"]);
    expect(advanceCorrelation?.timers.map((receipt) => receipt.type)).toEqual([
      "timer:start",
      "timer:fire",
    ]);
    expect(timeoutCorrelation?.transitions.map((receipt) => receipt.type)).toEqual([
      "machine:no-transition",
    ]);
    expect(timeoutCorrelation).toMatchObject({
      correlationId: "flow-trace.correlation.machine:event:2",
      index: 1,
      stateBefore: "ready",
      stateAfter: "ready",
    });
    expect(timeoutCorrelation?.summary).toEqual({
      eventType: "TIMEOUT",
      receiptTypes: ["machine:event", "machine:no-transition"],
      relatedIds: ["flow-trace.correlation.machine"],
    });
    expect(trace.report.timeline.map((entry) => entry.correlationId)).toEqual([
      "flow-trace.correlation.machine:event:1",
      "flow-trace.correlation.machine:event:2",
    ]);
  });

  it("derives issue summaries and per-correlation outcomes from receipt lanes", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle"
    >({
      id: "flow-trace.outcomes.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      receipts: [
        {
          type: "machine:event",
          id: machine.id,
          eventType: "ADVANCE",
          correlationId: "flow-trace.outcomes.machine:event:1",
          targetActorId: machine.id,
        },
        {
          type: "transaction:success",
          id: "trace.transaction.success",
          correlationId: "flow-trace.outcomes.machine:event:1",
          parentState: "idle",
        },
        {
          type: "transaction:failure",
          id: "trace.transaction.failure",
          correlationId: "flow-trace.outcomes.machine:event:1",
          parentState: "idle",
          error: "denied",
        },
        {
          type: "stream:defect",
          id: "trace.stream.defect",
          correlationId: "flow-trace.outcomes.machine:event:1",
          cause: "boom",
        },
        {
          type: "child:interrupt",
          id: "trace.child.interrupt",
          correlationId: "flow-trace.outcomes.machine:event:1",
          childActorId: "trace.child.actor",
          parentState: "idle",
        },
        {
          type: "timer:fire",
          id: "trace.timer.fire",
          correlationId: "flow-trace.outcomes.machine:event:1",
          parentState: "idle",
        },
      ],
    });

    const trace = captureTrace(snapshot, { includeSnapshots: true });
    const correlation = trace.report.correlations[0];

    expect(trace.report.outcomes).toEqual([
      {
        kind: "success",
        source: "transaction",
        type: "transaction:success",
        id: "trace.transaction.success",
        correlationId: "flow-trace.outcomes.machine:event:1",
        parentState: "idle",
      },
      {
        kind: "failure",
        source: "transaction",
        type: "transaction:failure",
        id: "trace.transaction.failure",
        correlationId: "flow-trace.outcomes.machine:event:1",
        parentState: "idle",
      },
      {
        kind: "defect",
        source: "stream",
        type: "stream:defect",
        id: "trace.stream.defect",
        correlationId: "flow-trace.outcomes.machine:event:1",
      },
      {
        kind: "interrupt",
        source: "child",
        type: "child:interrupt",
        id: "trace.child.interrupt",
        correlationId: "flow-trace.outcomes.machine:event:1",
        parentState: "idle",
      },
      {
        kind: "success",
        source: "timer",
        type: "timer:fire",
        id: "trace.timer.fire",
        correlationId: "flow-trace.outcomes.machine:event:1",
        parentState: "idle",
      },
    ]);
    expect(correlation?.outcomes).toEqual(trace.report.outcomes);
    expect(trace.report.issues).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "trace.transaction.failure",
        correlationId: "flow-trace.outcomes.machine:event:1",
        parentState: "idle",
      }),
      expect.objectContaining({
        kind: "defect",
        source: "stream",
        id: "trace.stream.defect",
        correlationId: "flow-trace.outcomes.machine:event:1",
      }),
      expect.objectContaining({
        kind: "interrupt",
        source: "child",
        id: "trace.child.interrupt",
        correlationId: "flow-trace.outcomes.machine:event:1",
        parentState: "idle",
      }),
    ]);
    expect(correlation?.issues).toEqual(trace.report.issues);
  });

  it("captures actor hierarchy from nested child snapshots", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "busy"
    >({
      id: "flow-trace.actor-hierarchy.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
        busy: {},
      },
    });

    const trace = captureTrace(
      Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "busy" as const,
        children: {
          "child.editor": {
            id: "child.editor",
            actorId: "trace.root/child.editor",
            status: "active" as const,
            state: "waiting",
            parentState: "busy",
            supervision: "continue-on-failure" as const,
            snapshot: {
              value: "waiting",
              context: { step: 1 },
              resources: {},
              transactions: {},
              streams: {},
              timers: {},
              children: {
                "child.timer": {
                  id: "child.timer",
                  actorId: "trace.root/child.editor/child.timer",
                  status: "success" as const,
                  state: "done",
                  parentState: "waiting",
                },
              },
              receipts: [],
            },
          },
        },
      }),
      { includeSnapshots: true },
    );

    expect(trace.actorHierarchy).toEqual({
      id: "flow-trace.actor-hierarchy.machine",
      state: "busy",
      children: {
        "child.editor": {
          id: "child.editor",
          actorId: "trace.root/child.editor",
          status: "active",
          state: "waiting",
          parentState: "busy",
          supervision: "continue-on-failure",
          children: {
            "child.timer": {
              id: "child.timer",
              actorId: "trace.root/child.editor/child.timer",
              status: "success",
              state: "done",
              parentState: "waiting",
              children: {},
            },
          },
        },
      },
    });
  });
});
