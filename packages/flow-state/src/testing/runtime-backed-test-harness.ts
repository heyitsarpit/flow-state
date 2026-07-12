import { Clock } from "effect";

import type {
  FlowActor,
  FlowEvent,
  FlowRehydratedTestHarness,
  FlowRuntime,
  FlowTestCache,
  FlowTestPendingWork,
  FlowTestStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
} from "../core/api/types.js";
import { canMachineTransition } from "../core/machines/machine-transition.js";
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
>(
  runtime: FlowRuntime<any, any>,
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
