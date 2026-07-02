import type * as Duration from "effect/Duration";
import { TestClock } from "effect/testing";

import type {
  FlowEvent,
  FlowRuntime,
  FlowSnapshot,
  FlowTestPendingWork,
  FlowTestProgressBounds,
} from "../core/api/types.js";
import { flushReadyWork, readyWorkPendingCount } from "../core/scheduling/ready-work.js";
import {
  createPendingWorkSnapshot,
  createSettleBoundsError,
  createTestControlBoundsError,
} from "./pending-work.js";

type HarnessSnapshot<Context, Event extends FlowEvent, State extends string> = FlowSnapshot<
  Context,
  State,
  Event
>;

type ProgressMethod = "advanceUntilIdle" | "until" | "untilState" | "untilReceipt" | "untilIssue";

type FlowTestProgressControlsDeps<
  Context,
  Event extends FlowEvent,
  State extends string,
> = Readonly<{
  readonly currentHarness: () => object;
  readonly currentSnapshot: () => HarnessSnapshot<Context, Event, State>;
  readonly ensureRuntime: () => FlowRuntime<never, unknown>;
  readonly currentRuntimeTimeMillis: (effectRuntime?: FlowRuntime<never, unknown>) => number;
  readonly activeTransactionIds: () => ReadonlyArray<string>;
  readonly activeTransactionFiberCount: () => number;
  readonly activeStreamIds: () => ReadonlyArray<string>;
  readonly activeAfterEntries: () => FlowTestPendingWork["timers"];
  readonly defaultProgressBounds: FlowTestProgressBounds;
}>;

export function createFlowTestProgressControls<
  Context,
  Event extends FlowEvent,
  State extends string,
>(deps: FlowTestProgressControlsDeps<Context, Event, State>) {
  const pendingWorkSnapshot = (effectRuntime = deps.ensureRuntime()): FlowTestPendingWork => {
    const ready = readyWorkPendingCount(deps.currentHarness());
    const transactionIds = deps.activeTransactionIds();
    const streamIds = deps.activeStreamIds();
    const afterEntries = deps.activeAfterEntries();
    const activeFibers =
      afterEntries.length + streamIds.length + deps.activeTransactionFiberCount();
    const snapshot = deps.currentSnapshot();
    const now =
      afterEntries.length === 0 ? undefined : deps.currentRuntimeTimeMillis(effectRuntime);
    return createPendingWorkSnapshot({
      machineId: snapshot.machine.id,
      ready,
      activeFibers,
      timers: afterEntries,
      streams: streamIds,
      transactions: transactionIds,
      children: snapshot.children,
      ...(now === undefined ? {} : { now }),
    });
  };

  const flushHarnessTurn = async () => {
    await flushReadyWork(deps.currentHarness());
    await Promise.resolve();
    await flushReadyWork(deps.currentHarness());
  };

  const normalizeProgressBounds = (
    bounds: FlowTestProgressBounds | undefined,
  ): FlowTestProgressBounds => bounds ?? deps.defaultProgressBounds;

  const advance = async (duration: Duration.Input) => {
    const effectRuntime = deps.ensureRuntime();
    await effectRuntime.managedRuntime.runPromise(TestClock.adjust(duration));
    await flushReadyWork(deps.currentHarness());
  };

  const advanceToNextTimer = async (effectRuntime = deps.ensureRuntime()) => {
    await flushHarnessTurn();
    const pending = pendingWorkSnapshot(effectRuntime);
    if (pending.nextAfterMillis === undefined) {
      return false;
    }

    await effectRuntime.managedRuntime.runPromise(TestClock.adjust(pending.nextAfterMillis));
    await flushReadyWork(deps.currentHarness());
    return true;
  };

  const waitForProgress = async (
    method: ProgressMethod,
    matches: () => boolean,
    isIdle: (pending: FlowTestPendingWork) => boolean,
    bounds?: FlowTestProgressBounds,
    awaiting?: string,
  ) => {
    if (matches()) {
      return;
    }

    const effectRuntime = deps.ensureRuntime();
    const resolvedBounds = normalizeProgressBounds(bounds);

    for (let tick = 0; tick < resolvedBounds.maxTicks; tick += 1) {
      await flushHarnessTurn();

      if (matches()) {
        return;
      }

      const pending = pendingWorkSnapshot(effectRuntime);
      if (pending.activeFibers > resolvedBounds.maxFibers) {
        throw createTestControlBoundsError({
          method,
          kind: "maxFibers",
          bounds: resolvedBounds,
          pending,
          ...(awaiting === undefined ? {} : { awaiting }),
        });
      }
      if (isIdle(pending)) {
        break;
      }
      if (pending.nextAfterMillis !== undefined) {
        await effectRuntime.managedRuntime.runPromise(TestClock.adjust(pending.nextAfterMillis));
        continue;
      }

      await Promise.resolve();
    }

    await flushHarnessTurn();
    if (matches()) {
      return;
    }

    const pending = pendingWorkSnapshot(effectRuntime);
    if (pending.activeFibers > resolvedBounds.maxFibers) {
      throw createTestControlBoundsError({
        method,
        kind: "maxFibers",
        bounds: resolvedBounds,
        pending,
        ...(awaiting === undefined ? {} : { awaiting }),
      });
    }

    throw createTestControlBoundsError({
      method,
      kind: "maxTicks",
      bounds: resolvedBounds,
      pending,
      ...(awaiting === undefined ? {} : { awaiting }),
    });
  };

  const settle = async (bounds: FlowTestProgressBounds) => {
    const effectRuntime = deps.ensureRuntime();

    for (let tick = 0; tick < bounds.maxTicks; tick += 1) {
      await flushHarnessTurn();

      const pending = pendingWorkSnapshot(effectRuntime);
      if (pending.activeFibers > bounds.maxFibers) {
        throw createSettleBoundsError("maxFibers", bounds, pending);
      }
      if (pending.ready === 0 && pending.activeFibers === 0 && pending.children.length === 0) {
        return;
      }

      if (pending.nextAfterMillis !== undefined) {
        await effectRuntime.managedRuntime.runPromise(TestClock.adjust(pending.nextAfterMillis));
        continue;
      }

      await Promise.resolve();
    }

    await flushHarnessTurn();
    const pending = pendingWorkSnapshot(effectRuntime);
    if (pending.activeFibers > bounds.maxFibers) {
      throw createSettleBoundsError("maxFibers", bounds, pending);
    }
    if (pending.ready === 0 && pending.activeFibers === 0 && pending.children.length === 0) {
      return;
    }

    throw createSettleBoundsError("maxTicks", bounds, pending);
  };

  return Object.freeze({
    pendingWorkSnapshot,
    advance,
    advanceToNextTimer,
    waitForProgress,
    settle,
  });
}
