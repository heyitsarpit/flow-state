import * as flow from "flow-state";
import { captureTrace } from "flow-state/inspect";

export const helperMachine = flow.machine<
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

export const semanticTrace = captureTrace(
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

export const rehydrationTrace = captureTrace(
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
