import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import {
  analyzeTrace,
  captureTrace,
  compressTraceArtifact,
  decompressTraceArtifact,
  diffTrace,
  exportTraceArtifact,
  flowStories,
  importTraceArtifact,
  summarizeTrace,
} from "./inspect.js";

describe("inspect trace reports", () => {
  it("captures receipt categories and produces machine-aware trace analysis deterministically", () => {
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
    const analysis = analyzeTrace(machine, trace);
    const analysisAgain = analyzeTrace(machine, trace);

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

    expect(analysis.kind).toBe("trace-analysis");
    expect(analysis.receipts).toEqual(trace.receipts);
    expect(analysis.report).toEqual(trace.report);
    expect(analysis.graph.kind).toBe("graph");
    expect(analysis.graph.machine).toBe(machine);
    expect(analysisAgain.report).toEqual(analysis.report);
    expect(analysisAgain.graph.toJSON()).toEqual(analysis.graph.toJSON());
    expect(analysis.report.lanes.success.map((receipt) => receipt.type)).toEqual([
      "transaction:success",
      "stream:done",
    ]);
    expect(analysis.report.lanes.failure.map((receipt) => receipt.type)).toEqual([
      "transaction:failure",
    ]);
    expect(analysis.report.lanes.defect.map((receipt) => receipt.type)).toEqual([
      "transaction:defect",
    ]);
    expect(analysis.report.lanes.interrupt.map((receipt) => receipt.type)).toEqual([
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

  it("diffs traces by event sequence, transitions, issues, resource patches, and transaction outcomes", () => {
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "SAVE" }>,
      "idle" | "editing" | "saving" | "saved"
    >({
      id: "flow-trace.diff.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        editing: {},
        saving: {},
        saved: {},
      },
    });

    const left = captureTrace(
      Object.freeze({
        ...machine.getInitialSnapshot(),
        receipts: [
          {
            type: "machine:event",
            id: machine.id,
            eventType: "START",
            correlationId: "flow-trace.diff.machine:event:1",
            targetActorId: machine.id,
          },
          {
            type: "machine:transition",
            id: machine.id,
            from: "idle",
            to: "editing",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "resource:patch",
            id: "editor.buffer",
            patch: { title: "draft" },
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "resource:freshness",
            id: "editor.buffer",
            from: "fresh",
            to: "stale",
            reason: "patch",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "stream:start",
            id: "editor.autosave",
            parentState: "editing",
            generation: 1,
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "stream:done",
            id: "editor.autosave",
            parentState: "editing",
            generation: 1,
            emitted: 1,
            lastValueAvailable: true,
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "child:start",
            id: "editor.preview",
            actorId: "workspace/editor.preview",
            parentState: "editing",
            state: "active",
            supervision: "continue-on-failure",
            spawnReason: "state-entry",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "child:interrupt",
            id: "editor.preview",
            actorId: "workspace/editor.preview",
            parentState: "editing",
            state: "active",
            supervision: "continue-on-failure",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "timer:start",
            id: "editor.autosave.timer",
            parentState: "editing",
            generation: 1,
            startedAt: 1_000,
            dueAt: 1_500,
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "timer:fire",
            id: "editor.autosave.timer",
            parentState: "editing",
            generation: 1,
            startedAt: 1_000,
            dueAt: 1_500,
            endedAt: 1_500,
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "machine:event",
            id: machine.id,
            eventType: "SAVE",
            correlationId: "flow-trace.diff.machine:event:2",
            targetActorId: machine.id,
          },
          {
            type: "machine:transition",
            id: machine.id,
            from: "editing",
            to: "saving",
            correlationId: "flow-trace.diff.machine:event:2",
          },
          {
            type: "transaction:failure",
            id: "workspace.save",
            parentState: "saving",
            correlationId: "flow-trace.diff.machine:event:2",
            error: "conflict",
          },
        ],
      }),
      { side: "left" as const },
    );
    const right = captureTrace(
      Object.freeze({
        ...machine.getInitialSnapshot(),
        receipts: [
          {
            type: "machine:event",
            id: machine.id,
            eventType: "START",
            correlationId: "flow-trace.diff.machine:event:1",
            targetActorId: machine.id,
          },
          {
            type: "machine:transition",
            id: machine.id,
            from: "idle",
            to: "editing",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "resource:patch",
            id: "editor.buffer",
            patch: { title: "published" },
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "resource:freshness",
            id: "editor.buffer",
            from: "fresh",
            to: "invalidated",
            reason: "invalidate:transaction",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "stream:start",
            id: "editor.autosave",
            parentState: "editing",
            generation: 1,
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "stream:defect",
            id: "editor.autosave",
            parentState: "editing",
            generation: 1,
            emitted: 1,
            lastValueAvailable: false,
            cause: "boom",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "child:start",
            id: "editor.preview",
            actorId: "workspace/editor.preview",
            parentState: "editing",
            state: "active",
            supervision: "continue-on-failure",
            spawnReason: "state-entry",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "child:success",
            id: "editor.preview",
            actorId: "workspace/editor.preview",
            parentState: "editing",
            state: "done",
            supervision: "continue-on-failure",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "timer:start",
            id: "editor.autosave.timer",
            parentState: "editing",
            generation: 1,
            startedAt: 1_000,
            dueAt: 1_500,
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "timer:interrupt",
            id: "editor.autosave.timer",
            parentState: "editing",
            generation: 1,
            startedAt: 1_000,
            dueAt: 1_500,
            endedAt: 1_200,
            interruptReason: "state-exit",
            correlationId: "flow-trace.diff.machine:event:1",
          },
          {
            type: "machine:event",
            id: machine.id,
            eventType: "SAVE",
            correlationId: "flow-trace.diff.machine:event:2",
            targetActorId: machine.id,
          },
          {
            type: "machine:transition",
            id: machine.id,
            from: "editing",
            to: "saved",
            correlationId: "flow-trace.diff.machine:event:2",
          },
          {
            type: "transaction:success",
            id: "workspace.save",
            parentState: "saved",
            correlationId: "flow-trace.diff.machine:event:2",
          },
        ],
      }),
      { side: "right" as const },
    );

    const diff = diffTrace(left, right);

    expect(diff.kind).toBe("trace-diff");
    expect(diff.left).toBe(left);
    expect(diff.right).toBe(right);
    expect(diff.summary).toEqual({
      matches: false,
      changedSections: [
        "transitions",
        "state-changes",
        "issues",
        "resource-patches",
        "resource-freshness",
        "transaction-outcomes",
        "stream-outcomes",
        "child-outcomes",
        "timer-behavior",
      ],
    });
    expect(diff.eventSequence.matches).toBe(true);
    expect(diff.eventSequence.firstDifferenceIndex).toBeUndefined();
    expect(diff.transitions.matches).toBe(false);
    expect(diff.transitions.firstDifferenceIndex).toBe(1);
    expect(diff.stateChanges.matches).toBe(false);
    expect(diff.stateChanges.firstDifferenceIndex).toBe(1);
    expect(diff.stateChanges.left).toEqual([
      {
        correlationId: "flow-trace.diff.machine:event:1",
        eventType: "START",
        stateBefore: "idle",
        stateAfter: "editing",
      },
      {
        correlationId: "flow-trace.diff.machine:event:2",
        eventType: "SAVE",
        stateBefore: "editing",
        stateAfter: "saving",
      },
    ]);
    expect(diff.stateChanges.right).toEqual([
      {
        correlationId: "flow-trace.diff.machine:event:1",
        eventType: "START",
        stateBefore: "idle",
        stateAfter: "editing",
      },
      {
        correlationId: "flow-trace.diff.machine:event:2",
        eventType: "SAVE",
        stateBefore: "editing",
        stateAfter: "saved",
      },
    ]);
    expect(diff.resourcePatches.matches).toBe(false);
    expect(diff.resourcePatches.firstDifferenceIndex).toBe(0);
    expect(diff.resourceFreshness.matches).toBe(false);
    expect(diff.resourceFreshness.firstDifferenceIndex).toBe(0);
    expect(diff.resourceFreshness.left[0]).toMatchObject({
      id: "editor.buffer",
      freshnessChanges: [{ from: "fresh", to: "stale", reason: "patch" }],
    });
    expect(diff.resourceFreshness.right[0]).toMatchObject({
      id: "editor.buffer",
      freshnessChanges: [{ from: "fresh", to: "invalidated", reason: "invalidate:transaction" }],
      invalidationReasons: ["transaction"],
    });
    expect(diff.issues.matches).toBe(false);
    expect(diff.issues.firstDifferenceIndex).toBe(0);
    expect(diff.transactionOutcomes.matches).toBe(false);
    expect(diff.transactionOutcomes.firstDifferenceIndex).toBe(0);
    expect(diff.streamOutcomes.matches).toBe(false);
    expect(diff.streamOutcomes.firstDifferenceIndex).toBe(0);
    expect(diff.streamOutcomes.left[0]).toMatchObject({
      id: "editor.autosave",
      statusAfter: "success",
      completion: "done",
      emittedCount: 1,
      lastValueAvailable: true,
    });
    expect(diff.streamOutcomes.right[0]).toMatchObject({
      id: "editor.autosave",
      statusAfter: "failure",
      completion: "defect",
      emittedCount: 1,
      lastValueAvailable: false,
    });
    expect(diff.childOutcomes.matches).toBe(false);
    expect(diff.childOutcomes.firstDifferenceIndex).toBe(0);
    expect(diff.childOutcomes.left[0]).toMatchObject({
      id: "editor.preview",
      statusAfter: "interrupt",
      stateAfter: "active",
      outcome: "interrupt",
    });
    expect(diff.childOutcomes.right[0]).toMatchObject({
      id: "editor.preview",
      statusAfter: "success",
      stateAfter: "done",
      outcome: "success",
    });
    expect(diff.timerBehavior.matches).toBe(false);
    expect(diff.timerBehavior.firstDifferenceIndex).toBe(0);
    expect(diff.timerBehavior.left[0]).toMatchObject({
      id: "editor.autosave.timer",
      statusAfter: "fired",
      outcome: "fire",
      scheduledMillis: 500,
      elapsedMillis: 500,
    });
    expect(diff.timerBehavior.right[0]).toMatchObject({
      id: "editor.autosave.timer",
      statusAfter: "interrupt",
      outcome: "interrupt",
      scheduledMillis: 500,
      elapsedMillis: 200,
      interruptReason: "state-exit",
    });
    expect(diff.transactionOutcomes.left).toEqual([
      {
        kind: "failure",
        source: "transaction",
        type: "transaction:failure",
        id: "workspace.save",
        correlationId: "flow-trace.diff.machine:event:2",
        parentState: "saving",
      },
    ]);
    expect(diff.transactionOutcomes.right).toEqual([
      {
        kind: "success",
        source: "transaction",
        type: "transaction:success",
        id: "workspace.save",
        correlationId: "flow-trace.diff.machine:event:2",
        parentState: "saved",
      },
    ]);
  });

  it("exports, imports, and gzip-roundtrips versioned trace artifacts", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "done"
    >({
      id: "flow-trace.artifact.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
        done: {},
      },
    });

    const trace = captureTrace(
      Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "done" as const,
        receipts: [
          {
            type: "machine:event",
            id: machine.id,
            eventType: "ADVANCE",
            correlationId: "flow-trace.artifact.machine:event:1",
            targetActorId: machine.id,
          },
          {
            type: "machine:transition",
            id: machine.id,
            from: "idle",
            to: "done",
            correlationId: "flow-trace.artifact.machine:event:1",
          },
        ],
      }),
      { artifactId: "trace-1" as const },
    );

    const artifact = exportTraceArtifact(trace);

    expect(artifact).toEqual({
      kind: "trace-artifact",
      version: "flow-state/trace-artifact.v1",
      snapshot: {
        machineId: "flow-trace.artifact.machine",
        value: "done",
        context: {
          count: 0,
        },
        resources: {},
        transactions: {},
        streams: {},
        timers: {},
        children: {},
        receipts: [
          {
            type: "machine:event",
            id: machine.id,
            eventType: "ADVANCE",
            correlationId: "flow-trace.artifact.machine:event:1",
            targetActorId: machine.id,
          },
          {
            type: "machine:transition",
            id: machine.id,
            from: "idle",
            to: "done",
            correlationId: "flow-trace.artifact.machine:event:1",
          },
        ],
      },
      options: {
        artifactId: "trace-1",
      },
    });
    const imported = importTraceArtifact(artifact);
    expect(imported?.report).toEqual(trace.report);
    expect(imported?.receipts).toEqual(trace.receipts);
    expect(imported?.snapshot.machine.id).toBe(trace.snapshot.machine.id);
    expect(imported?.options).toEqual(trace.options);
    expect(
      importTraceArtifact({
        kind: "trace-artifact",
        version: "flow-state/trace-artifact.v0",
        snapshot: artifact.snapshot,
      }),
    ).toBeUndefined();

    const compressed = await compressTraceArtifact(trace);
    expect(compressed instanceof Uint8Array).toBe(true);
    expect(compressed?.byteLength).toBeGreaterThan(0);
    const decompressed = compressed && (await decompressTraceArtifact(compressed));
    expect(decompressed?.report).toEqual(trace.report);
    expect(decompressed?.receipts).toEqual(trace.receipts);
    expect(decompressed?.snapshot.machine.id).toBe(trace.snapshot.machine.id);
    expect(decompressed?.options).toEqual(trace.options);
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

  it("builds a concise shareable incident summary from a captured trace", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "done"
    >({
      id: "flow-trace.summary.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
        done: {},
      },
    });

    const trace = captureTrace(
      Object.freeze({
        ...machine.getInitialSnapshot(),
        value: "done" as const,
        receipts: [
          {
            type: "machine:event",
            id: machine.id,
            eventType: "ADVANCE",
            correlationId: "flow-trace.summary.machine:event:1",
            targetActorId: machine.id,
          },
          {
            type: "machine:transition",
            id: machine.id,
            from: "idle",
            to: "done",
            correlationId: "flow-trace.summary.machine:event:1",
          },
          {
            type: "transaction:success",
            id: "trace.transaction.success",
            correlationId: "flow-trace.summary.machine:event:1",
            parentState: "idle",
          },
          {
            type: "transaction:failure",
            id: "trace.transaction.failure",
            correlationId: "flow-trace.summary.machine:event:1",
            parentState: "idle",
            error: "denied",
          },
          {
            type: "stream:defect",
            id: "trace.stream.defect",
            correlationId: "flow-trace.summary.machine:event:1",
            cause: "boom",
          },
        ],
      }),
      { artifactId: "trace-summary-1" as const },
    );

    expect(summarizeTrace(trace)).toEqual({
      kind: "trace-summary",
      machineId: "flow-trace.summary.machine",
      finalState: "done",
      headline: "flow-trace.summary.machine ended in done after ADVANCE with 2 issue(s)",
      receiptCount: 5,
      correlationCount: 1,
      issueCount: 2,
      bucketCounts: {
        events: 1,
        transitions: 1,
        resources: 0,
        transactions: 2,
        streams: 1,
        children: 0,
        timers: 0,
        actors: 0,
        other: 0,
      },
      outcomeCounts: {
        success: 1,
        failure: 1,
        defect: 1,
        interrupt: 0,
      },
      receiptTypes: [
        "machine:event",
        "machine:transition",
        "transaction:success",
        "transaction:failure",
        "stream:defect",
      ],
      relatedIds: [
        "flow-trace.summary.machine",
        "trace.transaction.success",
        "trace.transaction.failure",
        "trace.stream.defect",
      ],
      issues: trace.report.issues,
      correlations: [
        {
          correlationId: "flow-trace.summary.machine:event:1",
          headline: "ADVANCE: idle -> done; 2 issue(s)",
          eventType: "ADVANCE",
          stateBefore: "idle",
          stateAfter: "done",
          receiptCount: 5,
          issueCount: 2,
          outcomeCounts: {
            success: 1,
            failure: 1,
            defect: 1,
            interrupt: 0,
          },
          receiptTypes: [
            "machine:event",
            "machine:transition",
            "transaction:success",
            "transaction:failure",
            "stream:defect",
          ],
          relatedIds: [
            "flow-trace.summary.machine",
            "trace.transaction.success",
            "trace.transaction.failure",
            "trace.stream.defect",
          ],
        },
      ],
      options: {
        artifactId: "trace-summary-1",
      },
    });
  });

  it("captures typed story descriptors without pretending stories execute yet", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "SAVE" }>,
      "idle" | "editing" | "saved"
    >({
      id: "flow-stories.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
        editing: {},
        saved: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "editing" as const,
    });

    expect(
      flowStories(machine, [
        {
          id: "save-happy-path",
          title: "Save happy path",
          description: "Start editing and save without conflicts.",
          start: {
            kind: "snapshot",
            snapshot,
          },
          events: [{ type: "SAVE" }],
          expectedState: "saved",
          expectedFacts: {
            receiptTypes: ["transaction:success"],
            relatedIds: ["workspace.save"],
            outcomeKinds: ["success"],
            outcomeSources: ["transaction"],
          },
          tags: ["docs", "happy-path"],
        },
        {
          id: "resume-existing-draft",
          title: "Resume existing draft",
          start: {
            kind: "setup",
            description: "Seed an existing draft before the flow starts.",
          },
          events: [{ type: "START" }],
          expectedState: "editing",
          tags: ["repro"],
        },
      ]),
    ).toEqual({
      kind: "stories",
      machine,
      stories: [
        {
          id: "save-happy-path",
          title: "Save happy path",
          description: "Start editing and save without conflicts.",
          start: {
            kind: "snapshot",
            snapshot,
          },
          events: [{ type: "SAVE" }],
          expectedState: "saved",
          expectedFacts: {
            receiptTypes: ["transaction:success"],
            relatedIds: ["workspace.save"],
            outcomeKinds: ["success"],
            outcomeSources: ["transaction"],
          },
          tags: ["docs", "happy-path"],
        },
        {
          id: "resume-existing-draft",
          title: "Resume existing draft",
          start: {
            kind: "setup",
            description: "Seed an existing draft before the flow starts.",
          },
          events: [{ type: "START" }],
          expectedState: "editing",
          tags: ["repro"],
        },
      ],
    });
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

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      resources: {
        "trace.resource": {
          id: "trace.resource",
          status: "stale",
          availability: "value",
          activity: "idle",
          freshness: "invalidated",
          value: { id: "trace.resource", name: "Cached trace resource" },
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
          value: "second",
        },
        "trace.stream.interrupt": {
          id: "trace.stream.interrupt",
          status: "interrupt",
          generation: 4,
          emitted: 1,
          value: "last",
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
        "trace.timer.interrupt": {
          id: "trace.timer.interrupt",
          status: "interrupt",
          generation: 6,
          parentState: "idle",
          startedAt: 2_000,
          dueAt: 3_000,
          endedAt: 2_400,
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
          type: "resource:start",
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
          emitted: 0,
          lastValueAvailable: false,
          restored: false,
          parentState: "idle",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "stream:done",
          id: "trace.stream",
          generation: 3,
          emitted: 2,
          lastValueAvailable: true,
          restored: false,
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "stream:start",
          id: "trace.stream.interrupt",
          generation: 4,
          emitted: 0,
          lastValueAvailable: false,
          restored: false,
          parentState: "idle",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "stream:interrupt",
          id: "trace.stream.interrupt",
          generation: 4,
          emitted: 1,
          lastValueAvailable: true,
          restored: false,
          interruptReason: "state-exit",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "timer:start",
          id: "trace.timer",
          generation: 5,
          parentState: "idle",
          startedAt: 1_000,
          dueAt: 2_000,
          scheduledMillis: 1_000,
          restored: false,
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "timer:fire",
          id: "trace.timer",
          generation: 5,
          parentState: "idle",
          startedAt: 1_000,
          dueAt: 2_000,
          endedAt: 2_000,
          scheduledMillis: 1_000,
          elapsedMillis: 1_000,
          restored: false,
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "timer:start",
          id: "trace.timer.interrupt",
          generation: 6,
          parentState: "idle",
          startedAt: 2_000,
          dueAt: 3_000,
          scheduledMillis: 1_000,
          restored: false,
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "timer:interrupt",
          id: "trace.timer.interrupt",
          generation: 6,
          parentState: "idle",
          startedAt: 2_000,
          dueAt: 3_000,
          endedAt: 2_400,
          scheduledMillis: 1_000,
          elapsedMillis: 400,
          restored: false,
          interruptReason: "state-exit",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "child:start",
          id: "trace.child",
          actorId: "trace.machine/trace.child",
          ownerPath: "trace.app/trace.module/editor",
          supervision: "continue-on-failure",
          state: "waiting",
          spawnReason: "state-entry",
          parentState: "idle",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "child:interrupt",
          id: "trace.child",
          actorId: "trace.machine/trace.child",
          ownerPath: "trace.app/trace.module/editor",
          supervision: "continue-on-failure",
          state: "waiting",
          parentState: "idle",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "child:start",
          id: "trace.child.retry",
          actorId: "trace.machine/trace.child.retry",
          ownerPath: "trace.app/trace.module/editor",
          supervision: "stop-on-failure",
          state: "running",
          spawnReason: "state-entry",
          parentState: "idle",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "child:failure",
          id: "trace.child.retry",
          actorId: "trace.machine/trace.child.retry",
          ownerPath: "trace.app/trace.module/editor",
          supervision: "stop-on-failure",
          state: "running",
          parentState: "idle",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "child:retry",
          id: "trace.child.retry",
          actorId: "trace.machine/trace.child.retry",
          ownerPath: "trace.app/trace.module/editor",
          supervision: "stop-on-failure",
          state: "running",
          retryCause: "manual",
          parentState: "idle",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "child:start",
          id: "trace.child.retry",
          actorId: "trace.machine/trace.child.retry",
          ownerPath: "trace.app/trace.module/editor",
          supervision: "stop-on-failure",
          state: "running",
          spawnReason: "retry",
          parentState: "idle",
          correlationId: "flow-trace.detail.machine:event:1",
        },
        {
          type: "child:stop",
          id: "trace.child.retry",
          actorId: "trace.machine/trace.child.retry",
          ownerPath: "trace.app/trace.module/editor",
          supervision: "stop-on-failure",
          state: "running",
          stopReason: "state-exit",
          parentState: "idle",
          correlationId: "flow-trace.detail.machine:event:1",
        },
      ],
    } satisfies ReturnType<typeof machine.getInitialSnapshot>);

    const trace = captureTrace(snapshot, { includeSnapshots: true });

    expect(trace.report.correlations[0]?.details).toEqual({
      resources: [
        {
          id: "trace.resource",
          receiptTypes: [
            "resource:start",
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
          restored: false,
          lastValueAvailable: true,
        },
        {
          id: "trace.stream.interrupt",
          receiptTypes: ["stream:start", "stream:interrupt"],
          relatedIds: ["trace.stream.interrupt"],
          parentState: "idle",
          statusAfter: "interrupt",
          generation: 4,
          emittedCount: 1,
          completion: "interrupt",
          restored: false,
          lastValueAvailable: true,
          interruptReason: "state-exit",
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
          restored: false,
        },
        {
          id: "trace.timer.interrupt",
          receiptTypes: ["timer:start", "timer:interrupt"],
          relatedIds: ["trace.timer.interrupt"],
          parentState: "idle",
          statusAfter: "interrupt",
          generation: 6,
          dueAt: 3_000,
          startedAt: 2_000,
          endedAt: 2_400,
          scheduledMillis: 1_000,
          elapsedMillis: 400,
          outcome: "interrupt",
          restored: false,
          interruptReason: "state-exit",
        },
      ],
      children: [
        {
          id: "trace.child",
          receiptTypes: ["child:start", "child:interrupt"],
          relatedIds: ["trace.child"],
          parentState: "idle",
          actorId: "trace.machine/trace.child",
          ownerPath: "trace.app/trace.module/editor",
          stateAfter: "waiting",
          statusAfter: "interrupt",
          supervision: "continue-on-failure",
          spawnReasons: ["state-entry"],
          stopReasons: [],
          retryCauses: [],
          outcome: "interrupt",
        },
        {
          id: "trace.child.retry",
          receiptTypes: [
            "child:start",
            "child:failure",
            "child:retry",
            "child:start",
            "child:stop",
          ],
          relatedIds: ["trace.child.retry"],
          parentState: "idle",
          actorId: "trace.machine/trace.child.retry",
          ownerPath: "trace.app/trace.module/editor",
          stateAfter: "running",
          statusAfter: "stopped",
          supervision: "stop-on-failure",
          spawnReasons: ["state-entry", "retry"],
          stopReasons: ["state-exit"],
          retryCauses: ["manual"],
          outcome: "stop",
        },
      ],
    });
  });
});
