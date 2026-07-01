import { describe, expect, it } from "vite-plus/test";

import {
  captureTrace,
  formatNoTransitionSummary,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTransactionOverlapSummary,
  whyNoTransition,
} from "./inspect.js";
import { flow } from "./index.js";

describe("inspection semantic summaries", () => {
  it("renders no-transition explanations as semantic guidance", () => {
    const machine = flow.machine<
      { readonly allowed: boolean },
      | Readonly<{ readonly type: "ADVANCE" }>
      | Readonly<{ readonly type: "LOCKED" }>
      | Readonly<{ readonly type: "UNKNOWN" }>,
      "idle" | "ready"
    >({
      id: "inspection.semantic.no-transition",
      initial: "idle",
      context: () => ({ allowed: false }),
      states: {
        idle: {
          on: {
            ADVANCE: "ready",
            LOCKED: {
              target: "ready",
              guard: ({ context }) => context.allowed,
            },
          },
        },
        ready: {},
      },
    });

    const unknown = whyNoTransition(machine, machine.getInitialSnapshot(), {
      type: "UNKNOWN",
    });
    const blocked = whyNoTransition(machine, machine.getInitialSnapshot(), {
      type: "LOCKED",
    });

    expect(formatNoTransitionSummary(unknown!)).toContain(
      "Event UNKNOWN has no transition from idle.",
    );
    expect(formatNoTransitionSummary(unknown!)).toContain("not handled in any state");
    expect(formatNoTransitionSummary(blocked!)).toContain("Event LOCKED is blocked in idle");
    expect(formatNoTransitionSummary(blocked!)).toContain("guard(s) #0");
  });

  it("summarizes resource freshness and transaction overlap from a captured trace", () => {
    const machine = flow.machine<{}, Readonly<{ readonly type: "SAVE" }>, "idle">({
      id: "inspection.semantic.trace",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });

    const correlationId = "inspection.semantic.trace:event:1";
    const trace = captureTrace(
      Object.freeze({
        ...machine.getInitialSnapshot(),
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
          },
        },
        receipts: [
          {
            type: "machine:event",
            id: machine.id,
            eventType: "SAVE",
            targetActorId: machine.id,
            correlationId,
          },
          {
            type: "query:start",
            id: "trace.resource",
            mode: "observe",
            parentState: "idle",
            correlationId,
          },
          {
            type: "resource:placeholder",
            id: "trace.resource",
            parentState: "idle",
            correlationId,
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
            correlationId,
          },
          {
            type: "resource:freshness",
            id: "trace.resource",
            from: "fresh",
            to: "invalidated",
            reason: "invalidate:transaction",
            parentState: "idle",
            correlationId,
          },
          {
            type: "resource:invalidate",
            id: "trace.resource",
            reason: "transaction",
            parentState: "idle",
            correlationId,
          },
          {
            type: "transaction:queue",
            id: "trace.transaction",
            queueKey: "trace.transaction.scope",
            overlapCause: "serialize-scope",
            parentState: "idle",
            correlationId,
          },
          {
            type: "transaction:dequeue",
            id: "trace.transaction",
            queueKey: "trace.transaction.scope",
            overlapCause: "serialize-scope",
            parentState: "idle",
            correlationId,
          },
          {
            type: "transaction:start",
            id: "trace.transaction",
            generation: 2,
            trigger: "event",
            queueKey: "trace.transaction.scope",
            startedAt: 100,
            parentState: "idle",
            correlationId,
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
            correlationId,
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
            correlationId,
          },
        ],
      }),
    );

    const freshnessReport = formatResourceFreshnessReport(trace);
    expect(freshnessReport).toContain("trace.resource");
    expect(freshnessReport).toContain("final=invalidated");
    expect(freshnessReport).toContain("fresh->invalidated (invalidate:transaction)");

    const overlapSummary = formatTransactionOverlapSummary(trace);
    expect(overlapSummary).toContain("trace.transaction");
    expect(overlapSummary).toContain("queue=trace.transaction.scope");
    expect(overlapSummary).toContain("serialize-scope");
    expect(overlapSummary).toContain("45ms");
  });

  it("summarizes rehydration-specific restore activity from a captured trace", () => {
    const machine = flow.machine<
      { readonly token: string },
      Readonly<{ readonly type: "STOP" }>,
      "idle" | "busy"
    >({
      id: "inspection.semantic.rehydration",
      initial: "idle",
      context: () => ({ token: "" }),
      states: {
        idle: {},
        busy: {},
      },
    });

    const restoreCorrelationId = "rehydration.actor:restore:1";
    const trace = captureTrace(
      Object.freeze({
        ...machine.getInitialSnapshot(),
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
            correlationId: restoreCorrelationId,
          },
          {
            type: "resource:hydrate",
            id: "rehydration.project",
            status: "success",
            availability: "value",
            freshness: "fresh",
            updatedAt: 250,
            parentState: "busy",
            correlationId: restoreCorrelationId,
          },
          {
            type: "timer:resume",
            id: "rehydration.timer",
            generation: 2,
            parentState: "busy",
            startedAt: 0,
            dueAt: 1_000,
            correlationId: restoreCorrelationId,
          },
          {
            type: "stream:resume",
            id: "rehydration.stream",
            generation: 3,
            parentState: "busy",
            emitted: 1,
            lastValueAvailable: true,
            correlationId: restoreCorrelationId,
          },
          {
            type: "transaction:interrupt",
            id: "rehydration.save",
            generation: 1,
            parentState: "busy",
            correlationId: restoreCorrelationId,
          },
        ],
      }),
    );

    const summary = formatRehydrationSummary(trace);
    expect(summary).toContain("rehydration.actor");
    expect(summary).toContain("hydratedResources=1");
    expect(summary).toContain("resumedStreams=1");
    expect(summary).toContain("resumedTimers=1");
    expect(summary).toContain("reconciledTransactions=1");
    expect(summary).toContain("rehydration.project -> success/fresh");
  });
});
