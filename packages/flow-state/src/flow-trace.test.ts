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

  it("adds subsystem-specific correlation details when receipts and final state allow them", () => {
    const machine = flow.machine<{}, Readonly<{ readonly type: "ADVANCE" }>, "idle">({
      id: "flow-trace.detail.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });

    const trace = captureTrace(
      Object.freeze({
        ...machine.getInitialSnapshot(),
        resources: {
          "trace.resource": {
            id: "trace.resource",
            status: "stale",
            availability: "value",
            activity: "idle",
            freshness: "invalidated",
            updatedAt: 150,
            invalidatedAt: 200,
            isPlaceholderData: false,
          },
        },
        transactions: {
          "trace.transaction": {
            id: "trace.transaction",
            status: "success",
          },
          "trace.transaction.rollback": {
            id: "trace.transaction.rollback",
            status: "failure",
            error: "conflict",
          },
        },
        streams: {
          "trace.stream": {
            id: "trace.stream",
            status: "success",
            generation: 3,
            emitted: 2,
          },
        },
        timers: {
          "trace.timer": {
            id: "trace.timer",
            status: "fired",
            generation: 5,
            parentState: "idle",
            startedAt: 1_000,
            dueAt: 2_000,
            endedAt: 2_000,
          },
        },
        children: {
          "trace.child": {
            id: "trace.child",
            actorId: "trace.machine/trace.child",
            status: "interrupt",
            state: "waiting",
            parentState: "idle",
            supervision: "continue-on-failure",
          },
        },
        receipts: [
          {
            type: "machine:event",
            id: machine.id,
            eventType: "ADVANCE",
            correlationId: "flow-trace.detail.machine:event:1",
            targetActorId: machine.id,
          },
          {
            type: "query:start",
            id: "trace.resource",
            mode: "observe",
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "resource:placeholder",
            id: "trace.resource",
            mode: "observe",
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
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
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "resource:freshness",
            id: "trace.resource",
            from: "fresh",
            to: "invalidated",
            reason: "invalidate:transaction",
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "resource:invalidate",
            id: "trace.resource",
            reason: "transaction",
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "transaction:queue",
            id: "trace.transaction",
            queueKey: "trace.transaction.scope",
            overlapCause: "serialize-scope",
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "transaction:dequeue",
            id: "trace.transaction",
            queueKey: "trace.transaction.scope",
            overlapCause: "serialize-scope",
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "transaction:start",
            id: "trace.transaction",
            generation: 2,
            trigger: "event",
            queueKey: "trace.transaction.scope",
            startedAt: 100,
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
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
            correlationId: "flow-trace.detail.machine:event:1",
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
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "transaction:start",
            id: "trace.transaction.rollback",
            generation: 3,
            trigger: "event",
            queueKey: "trace.transaction.rollback",
            startedAt: 200,
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "transaction:preview-patch",
            id: "trace.transaction.rollback",
            generation: 3,
            queueKey: "trace.transaction.rollback",
            refId: "trace.resource",
            previewIndex: 1,
            previewCount: 1,
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "transaction:failure",
            id: "trace.transaction.rollback",
            generation: 3,
            queueKey: "trace.transaction.rollback",
            startedAt: 200,
            endedAt: 275,
            durationMillis: 75,
            routedEventType: "SAVE_FAILED",
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "transaction:rollback",
            id: "trace.transaction.rollback",
            generation: 3,
            queueKey: "trace.transaction.rollback",
            refId: "trace.resource",
            rollbackIndex: 1,
            rollbackCount: 1,
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "stream:start",
            id: "trace.stream",
            generation: 3,
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "stream:done",
            id: "trace.stream",
            generation: 3,
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "timer:start",
            id: "trace.timer",
            generation: 5,
            parentState: "idle",
            dueAt: 2_000,
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "timer:fire",
            id: "trace.timer",
            generation: 5,
            parentState: "idle",
            dueAt: 2_000,
            endedAt: 2_000,
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "child:start",
            id: "trace.child",
            actorId: "trace.machine/trace.child",
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
          {
            type: "child:interrupt",
            id: "trace.child",
            actorId: "trace.machine/trace.child",
            parentState: "idle",
            correlationId: "flow-trace.detail.machine:event:1",
          },
        ],
      }),
      { includeSnapshots: true },
    );

    expect(trace.report.correlations[0]?.details).toEqual({
      resources: [
        {
          id: "trace.resource",
          receiptTypes: [
            "query:start",
            "resource:placeholder",
            "resource:success",
            "resource:freshness",
            "resource:invalidate",
          ],
          relatedIds: ["trace.resource"],
          parentState: "idle",
          queryModes: ["observe"],
          fetchOutcomes: ["success"],
          usedPlaceholder: true,
          freshnessChanges: [
            {
              from: "fresh",
              to: "invalidated",
              reason: "invalidate:transaction",
            },
          ],
          invalidationReasons: ["transaction"],
          statusAfter: "stale",
          availabilityAfter: "value",
          activityAfter: "idle",
          freshnessAfter: "invalidated",
          updatedAt: 150,
          invalidatedAt: 200,
        },
      ],
      transactions: [
        {
          id: "trace.transaction",
          receiptTypes: [
            "transaction:queue",
            "transaction:dequeue",
            "transaction:start",
            "transaction:preview-patch",
            "transaction:success",
          ],
          relatedIds: ["trace.transaction"],
          parentState: "idle",
          statusAfter: "success",
          trigger: "event",
          generation: 2,
          queued: true,
          dequeued: true,
          queueCause: "serialize-overlap",
          attempts: 1,
          queueKey: "trace.transaction.scope",
          overlapCauses: ["serialize-scope"],
          attemptTimings: [
            {
              generation: 2,
              startedAt: 100,
              endedAt: 145,
              durationMillis: 45,
            },
          ],
          previews: [
            {
              generation: 2,
              refIds: ["trace.resource"],
            },
          ],
          rollbacks: [],
          routedEvents: [
            {
              lane: "success",
              eventType: "SAVE_OK",
              generation: 2,
            },
          ],
        },
        {
          id: "trace.transaction.rollback",
          receiptTypes: [
            "transaction:start",
            "transaction:preview-patch",
            "transaction:failure",
            "transaction:rollback",
          ],
          relatedIds: ["trace.transaction.rollback"],
          parentState: "idle",
          statusAfter: "failure",
          trigger: "event",
          generation: 3,
          queued: false,
          dequeued: false,
          attempts: 1,
          queueKey: "trace.transaction.rollback",
          overlapCauses: [],
          attemptTimings: [
            {
              generation: 3,
              startedAt: 200,
              endedAt: 275,
              durationMillis: 75,
            },
          ],
          previews: [
            {
              generation: 3,
              refIds: ["trace.resource"],
            },
          ],
          rollbacks: [
            {
              generation: 3,
              refIds: ["trace.resource"],
            },
          ],
          routedEvents: [
            {
              lane: "failure",
              eventType: "SAVE_FAILED",
              generation: 3,
            },
          ],
        },
      ],
      streams: [
        {
          id: "trace.stream",
          receiptTypes: ["stream:start", "stream:done"],
          relatedIds: ["trace.stream"],
          parentState: "idle",
          statusAfter: "success",
          generation: 3,
          emittedCount: 2,
          completion: "done",
        },
      ],
      timers: [
        {
          id: "trace.timer",
          receiptTypes: ["timer:start", "timer:fire"],
          relatedIds: ["trace.timer"],
          parentState: "idle",
          statusAfter: "fired",
          generation: 5,
          dueAt: 2_000,
          startedAt: 1_000,
          endedAt: 2_000,
          scheduledMillis: 1_000,
          elapsedMillis: 1_000,
          outcome: "fire",
        },
      ],
      children: [
        {
          id: "trace.child",
          receiptTypes: ["child:start", "child:interrupt"],
          relatedIds: ["trace.child"],
          parentState: "idle",
          actorId: "trace.machine/trace.child",
          statusAfter: "interrupt",
          supervision: "continue-on-failure",
          outcome: "interrupt",
        },
      ],
    });
  });
});
