import { Clock, type Layer } from "effect";

import type {
  FlowActor,
  FlowEvent,
  FlowMachine,
  FlowRehydratedTestHarness,
  FlowRuntime,
  FlowStartedTestBuilder,
  FlowTestCache,
  FlowTestPendingWork,
  FlowTestStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
} from "../core/api/types.js";
import { canMachineTransition } from "../core/machines/machine-transition.js";
import {
  flushReadyWork,
  readyWorkPendingCount,
  startReadyWork,
} from "../core/scheduling/ready-work.js";
import { ambiguousResourceDescriptorDiagnostic } from "../shared/diagnostics.js";
import { createFlowTestProgressControls } from "./flow-test-progress-controls.js";
import { createFlowTestReadSurface } from "./flow-test-read-surface.js";

function createRuntimeBackedCache<Context, Event extends FlowEvent, State extends string>(
  actor: FlowActor<Context, Event, State>,
): FlowTestCache {
  return Object.freeze({
    query: (id: string) => {
      const matches = Object.values(actor.getSnapshot().resources).filter(
        (snapshot) => snapshot.id === id,
      );
      if (matches.length === 0) {
        return undefined;
      }
      if (matches.length > 1) {
        throw ambiguousResourceDescriptorDiagnostic({
          resourceId: id,
          instanceCount: matches.length,
        });
      }
      return matches[0];
    },
  });
}

function currentStreamSnapshots<Context, Event extends FlowEvent, State extends string>(
  actor: FlowActor<Context, Event, State>,
): Readonly<Record<string, FlowTestStreamSnapshot>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(actor.getSnapshot().streams).map(([id, snapshot]) => [
        id,
        Object.freeze({
          ...snapshot,
          generation: snapshot.generation ?? 0,
          emitted: snapshot.emitted ?? 0,
        }),
      ]),
    ),
  );
}

function pendingTransactionIds<Context, Event extends FlowEvent, State extends string>(
  actor: FlowActor<Context, Event, State>,
): ReadonlyArray<string> {
  return Object.freeze(
    Object.values(actor.getSnapshot().transactions)
      .filter((snapshot) => snapshot.status === "pending")
      .map((snapshot) => snapshot.id),
  );
}

function runningStreamIds<Context, Event extends FlowEvent, State extends string>(
  actor: FlowActor<Context, Event, State>,
): ReadonlyArray<string> {
  return Object.freeze(
    Object.values(actor.getSnapshot().streams)
      .filter((snapshot) => snapshot.status === "running")
      .map((snapshot) => snapshot.id),
  );
}

function scheduledTimers<Context, Event extends FlowEvent, State extends string>(
  actor: FlowActor<Context, Event, State>,
): FlowTestPendingWork["timers"] {
  return Object.freeze(
    Object.values(actor.getSnapshot().timers)
      .filter((snapshot) => snapshot.status === "scheduled")
      .map((snapshot) =>
        Object.freeze({
          id: snapshot.id,
          dueAt: snapshot.dueAt,
          parentState: snapshot.parentState,
        }),
      ),
  );
}

export function createRuntimeBackedTestHarness<
  Context,
  Event extends FlowEvent,
  State extends string,
  RuntimeServices,
  LayerError,
>(
  runtime: FlowRuntime<RuntimeServices, LayerError>,
  actor: FlowActor<Context, Event, State>,
): FlowRehydratedTestHarness<Context, Event, State> {
  const cache = createRuntimeBackedCache(actor);
  const readSurface = createFlowTestReadSurface({
    currentSnapshot: () => actor.getSnapshot(),
    currentIssues: () => actor.issues(),
    currentTransactions: () =>
      actor.getSnapshot().transactions as Readonly<Record<string, FlowTransactionSnapshot>>,
    currentTimerSnapshots: () =>
      actor.getSnapshot().timers as Readonly<Record<string, FlowTimerSnapshot>>,
    currentStreamSnapshots: () => currentStreamSnapshots(actor),
    cache,
  });

  const progressControls = createFlowTestProgressControls({
    currentHarness: () => actor,
    currentSnapshot: () => actor.getSnapshot(),
    ensureRuntime: () => runtime as FlowRuntime<never, unknown>,
    currentRuntimeTimeMillis: (effectRuntime = runtime as FlowRuntime<never, unknown>) =>
      effectRuntime.managedRuntime.runSync(Clock.currentTimeMillis),
    activeTransactionIds: () => pendingTransactionIds(actor),
    activeTransactionFiberCount: () => pendingTransactionIds(actor).length,
    activeStreamIds: () => runningStreamIds(actor),
    activeAfterEntries: () => scheduledTimers(actor),
    defaultProgressBounds: Object.freeze({
      maxTicks: 20,
      maxFibers: 10,
    }),
  });

  const { pendingWorkSnapshot, advance, advanceToNextTimer, waitForProgress, settle } =
    progressControls;

  let harness!: FlowRehydratedTestHarness<Context, Event, State>;

  harness = Object.freeze({
    runtime,
    actor,
    state: () => actor.getSnapshot().value,
    context: () => actor.getSnapshot().context,
    snapshot: () => actor.getSnapshot(),
    send: (event) => {
      actor.send(event);
      return harness;
    },
    sendAll: (events) => {
      for (const event of events) {
        actor.send(event);
      }
      return harness;
    },
    can: (event) => canMachineTransition(actor.getSnapshot(), event),
    children: () => actor.children(),
    ...readSurface,
    pendingWork: () => pendingWorkSnapshot(),
    retryTransaction: (id) => actor.retryTransaction(id),
    resetTransaction: (id) => actor.resetTransaction(id),
    flush: () => actor.flush(),
    advance,
    advanceToNextTimer: () => advanceToNextTimer(),
    advanceUntilIdle: (bounds) =>
      waitForProgress(
        "advanceUntilIdle",
        () => {
          const pending = pendingWorkSnapshot();
          return pending.ready === 0 && pending.nextAfterMillis === undefined;
        },
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
      ),
    until: (predicate, bounds) =>
      waitForProgress(
        "until",
        () => predicate(harness),
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        "predicate",
      ),
    untilState: (target, bounds) =>
      waitForProgress(
        "untilState",
        () =>
          typeof target === "function"
            ? target(actor.getSnapshot().value, actor.getSnapshot())
            : actor.getSnapshot().value === target,
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        typeof target === "function" ? "state predicate" : `state '${target}'`,
      ),
    untilReceipt: (predicate, bounds) =>
      waitForProgress(
        "untilReceipt",
        () => actor.receipts().some((receipt) => predicate(receipt, actor.receipts())),
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        "receipt predicate",
      ),
    untilIssue: (predicate, bounds) =>
      waitForProgress(
        "untilIssue",
        () => actor.issues().some((issue) => predicate(issue, actor.issues())),
        (pending) => pending.ready === 0 && pending.nextAfterMillis === undefined,
        bounds,
        "issue predicate",
      ),
    settle,
    serialize: () => actor.serialize(),
    dispose: () => runtime.dispose(),
  });

  return harness;
}

export function createRuntimeBackedStartedBuilder<
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  machine: FlowMachine<Context, Event, State>,
  deps: Readonly<{
    readonly ensureRuntime: () => FlowRuntime<never, unknown>;
    readonly provide: (service: Layer.Any) => void;
    readonly clock: (now: () => number) => void;
  }>,
): FlowStartedTestBuilder<Context, Event, State> {
  let started!: FlowStartedTestBuilder<Context, Event, State>;
  let harness: FlowRehydratedTestHarness<Context, Event, State> | undefined;

  const ensureHarness = (): FlowRehydratedTestHarness<Context, Event, State> => {
    if (harness !== undefined) {
      return harness;
    }

    const runtime = deps.ensureRuntime();
    const actor = runtime.createActor(machine, { id: machine.id });
    harness = createRuntimeBackedTestHarness(runtime, actor);
    return harness;
  };

  started = Object.freeze({
    state: () => ensureHarness().state(),
    context: () => ensureHarness().context(),
    snapshot: () => ensureHarness().snapshot(),
    send: (event) => {
      ensureHarness().send(event);
      return started;
    },
    sendAll: (events) => {
      ensureHarness().sendAll(events);
      return started;
    },
    can: (event) => ensureHarness().can(event),
    children: () => ensureHarness().children(),
    childTree: () => ensureHarness().childTree(),
    childSummary: () => ensureHarness().childSummary(),
    cache: () => ensureHarness().cache(),
    transactions: () => ensureHarness().transactions(),
    timers: () => ensureHarness().timers(),
    receipts: () => ensureHarness().receipts(),
    receiptSummary: () => ensureHarness().receiptSummary(),
    streams: () => ensureHarness().streams(),
    issues: () => ensureHarness().issues(),
    issueSummary: () => ensureHarness().issueSummary(),
    pendingWork: () => {
      const current = ensureHarness().pendingWork();
      const externalReady = readyWorkPendingCount(started);
      const ready = current.ready + externalReady;
      return Object.freeze({
        ...current,
        ready,
        mailboxes:
          ready === 0
            ? Object.freeze([])
            : Object.freeze([
                Object.freeze({
                  id: machine.id,
                  pending: ready,
                }),
              ]),
      });
    },
    retryTransaction: (id) => ensureHarness().retryTransaction(id),
    resetTransaction: (id) => ensureHarness().resetTransaction(id),
    flush: async () => {
      const currentHarness = ensureHarness();
      while (true) {
        await flushReadyWork(started);
        await currentHarness.flush();
        if (readyWorkPendingCount(started) === 0 && currentHarness.pendingWork().ready === 0) {
          return;
        }
        await Promise.resolve();
      }
    },
    advance: (duration) => ensureHarness().advance(duration),
    advanceToNextTimer: () => ensureHarness().advanceToNextTimer(),
    advanceUntilIdle: (bounds) => ensureHarness().advanceUntilIdle(bounds),
    until: (predicate, bounds) => ensureHarness().until(predicate, bounds),
    untilState: (target, bounds) => ensureHarness().untilState(target, bounds),
    untilReceipt: (predicate, bounds) => ensureHarness().untilReceipt(predicate, bounds),
    untilIssue: (predicate, bounds) => ensureHarness().untilIssue(predicate, bounds),
    trace: (options) => ensureHarness().trace(options),
    captureTrace: (options) => ensureHarness().captureTrace(options),
    traceFor: (correlationId) => ensureHarness().traceFor(correlationId),
    settle: (bounds) => ensureHarness().settle(bounds),
    provide: (service) => {
      deps.provide(service);
      return started;
    },
    clock: (now) => {
      deps.clock(now);
      return started;
    },
    start: () => {
      ensureHarness();
      return started;
    },
  });
  startReadyWork(started);

  return started;
}
