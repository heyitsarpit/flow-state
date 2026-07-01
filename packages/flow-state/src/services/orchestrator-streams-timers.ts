import { Effect, Exit, Stream } from "effect";

import {
  createDelayedWorkPlan,
  createRestoredDelayedWorkPlan,
  seedDelayedWorkGenerations,
  type DelayedWorkPlan,
} from "../delayed-work.js";
import type {
  FlowAfterDefinition,
  FlowEvent,
  FlowIssue,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowReceipt,
  FlowSnapshot,
  FlowStreamSnapshot,
  FlowTimerSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../core/api/types.js";
import { receiptWithCorrelation } from "../receipt-correlation.js";
import {
  type StreamTimerInterruptReason,
  streamReceiptFacts,
  timerOutcomeReceiptFacts,
  timerScheduleReceiptFacts,
} from "../stream-timer-inspection-facts.js";
import {
  resolveCoalescedStreamPressureKey,
  resolveStreamParams,
  resolveStreamRouteEventWithDiagnostics,
  resolveStreamSubscription,
} from "../stream-callbacks.js";
import { controlledStreamSourceOf } from "../controlled-stream-source.js";
import { clearIssue, interruptIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type AnyFlowAfterDefinition = FlowAfterDefinition<string, unknown, FlowEvent>;
type AnyFlowStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;

type EffectRunner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  onExit?: (exit: Exit.Exit<A, E>) => void,
) => (interruptor?: number) => void;

type StreamTimerControllerDeps<Machine extends FlowMachine> = Readonly<{
  readonly currentSnapshot: () => SnapshotForMachine<Machine>;
  readonly replaceSnapshot: (
    next: SnapshotForMachine<Machine>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly currentIssues: () => ReadonlyArray<FlowIssue>;
  readonly replaceIssues: (
    nextIssues: ReadonlyArray<FlowIssue>,
    notifyListenersAfter?: boolean,
  ) => void;
  readonly dispatchOwnedMachineEvent: (event: InferMachineEvent<Machine>) => void;
  readonly enqueue: (work: () => void) => void;
  readonly currentCorrelationId: () => string | undefined;
  readonly isDisposed: () => boolean;
  readonly now: () => number;
  readonly runEffect: EffectRunner;
  readonly invokeArgsForSnapshot: (
    snapshot: SnapshotForMachine<Machine>,
  ) => Record<string, unknown>;
  readonly streamsForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<AnyFlowStreamDefinition>;
  readonly aftersForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<AnyFlowAfterDefinition>;
  readonly applyAfterTransition: (
    current: SnapshotForMachine<Machine>,
    definition: AnyFlowAfterDefinition,
    entry: Readonly<{
      readonly generation: number;
      readonly parentState: InferMachineState<Machine>;
      readonly restored: boolean;
      readonly startedAt: number;
      readonly dueAt: number;
      readonly endedAt: number;
      readonly correlationId: string | undefined;
    }>,
  ) => SnapshotForMachine<Machine>;
}>;

export function createStreamTimerController<Machine extends FlowMachine>(
  deps: StreamTimerControllerDeps<Machine>,
) {
  const ownedStreams = new Map<
    string,
    {
      readonly definition: AnyFlowStreamDefinition;
      readonly generation: number;
      readonly restored: boolean;
      readonly correlationId: string | undefined;
      interrupt: (interruptor?: number) => void;
    }
  >();
  const ownedAfters = new Map<
    string,
    {
      readonly definition: AnyFlowAfterDefinition;
      readonly generation: number;
      readonly parentState: InferMachineState<Machine>;
      readonly restored: boolean;
      readonly startedAt: number;
      readonly dueAt: number;
      readonly correlationId: string | undefined;
      interrupt: (interruptor?: number) => void;
    }
  >();
  const streamGenerations = new Map<string, number>();
  const timerGenerations = new Map<string, number>();

  const seedStreamGenerations = (
    streams: Readonly<Record<string, FlowStreamSnapshot>>,
    generations: Map<string, number>,
  ) => {
    for (const stream of Object.values(streams)) {
      if (stream.generation === undefined) {
        continue;
      }

      generations.set(stream.id, Math.max(generations.get(stream.id) ?? 0, stream.generation));
    }
  };

  const ownAfter = (
    definition: AnyFlowAfterDefinition,
    entry: {
      readonly definition: AnyFlowAfterDefinition;
      readonly generation: number;
      readonly parentState: InferMachineState<Machine>;
      readonly restored: boolean;
      readonly startedAt: number;
      readonly dueAt: number;
      readonly correlationId: string | undefined;
      interrupt: (interruptor?: number) => void;
    },
    plan: DelayedWorkPlan,
  ) => {
    ownedAfters.set(definition.id, entry);
    entry.interrupt = plan.run(deps.runEffect, (exit) => {
      deps.enqueue(() => {
        if (
          deps.isDisposed() ||
          ownedAfters.get(definition.id) !== entry ||
          !Exit.isSuccess(exit)
        ) {
          return;
        }

        ownedAfters.delete(definition.id);
        const endedAt = deps.now();
        deps.replaceSnapshot(
          deps.applyAfterTransition(deps.currentSnapshot(), definition, {
            generation: entry.generation,
            parentState: entry.parentState,
            restored: entry.restored,
            startedAt: entry.startedAt,
            dueAt: entry.dueAt,
            endedAt,
            correlationId: entry.correlationId,
          }),
          true,
        );
      });
    });
  };

  const startStateOwnedAfters = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    seedDelayedWorkGenerations(current.timers, timerGenerations);
    const definitions = deps.aftersForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextTimers: Record<string, FlowTimerSnapshot> = {
      ...current.timers,
    };
    const nextReceipts = [...current.receipts];
    let changed = false;

    for (const definition of definitions) {
      if (ownedAfters.has(definition.id)) {
        continue;
      }

      changed = true;
      const plan = createDelayedWorkPlan(definition.config.delay, deps.now);
      const generation = (timerGenerations.get(definition.id) ?? 0) + 1;
      timerGenerations.set(definition.id, generation);
      nextTimers[definition.id] = {
        id: definition.id,
        status: "scheduled",
        generation,
        parentState: current.value,
        startedAt: plan.startedAt,
        dueAt: plan.dueAt,
      };
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "timer:start",
            id: definition.id,
            generation,
            parentState: current.value,
            ...timerScheduleReceiptFacts(plan.startedAt, plan.dueAt, false),
          },
          deps.currentCorrelationId(),
        ),
      );

      const entry: {
        readonly definition: AnyFlowAfterDefinition;
        readonly generation: number;
        readonly parentState: InferMachineState<Machine>;
        readonly restored: boolean;
        readonly startedAt: number;
        readonly dueAt: number;
        readonly correlationId: string | undefined;
        interrupt: (interruptor?: number) => void;
      } = {
        definition,
        generation,
        parentState: current.value,
        restored: false,
        startedAt: plan.startedAt,
        dueAt: plan.dueAt,
        correlationId: deps.currentCorrelationId(),
        interrupt: () => {},
      };
      ownAfter(definition, entry, plan);
    }

    return changed
      ? Object.freeze({
          ...current,
          timers: nextTimers,
          receipts: nextReceipts,
        })
      : current;
  };

  const rehydrateStateOwnedAfters = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    seedDelayedWorkGenerations(current.timers, timerGenerations);
    const nextReceipts = [...current.receipts];
    let changed = false;

    for (const definition of deps.aftersForState(current)) {
      const priorTimer = current.timers[definition.id];
      if (priorTimer?.status !== "scheduled" || ownedAfters.has(definition.id)) {
        continue;
      }

      changed = true;
      const plan = createRestoredDelayedWorkPlan(priorTimer.startedAt, priorTimer.dueAt);
      const entry: {
        readonly definition: AnyFlowAfterDefinition;
        readonly generation: number;
        readonly parentState: InferMachineState<Machine>;
        readonly restored: boolean;
        readonly startedAt: number;
        readonly dueAt: number;
        readonly correlationId: string | undefined;
        interrupt: (interruptor?: number) => void;
      } = {
        definition,
        generation: priorTimer.generation,
        parentState: priorTimer.parentState as InferMachineState<Machine>,
        restored: true,
        startedAt: priorTimer.startedAt,
        dueAt: priorTimer.dueAt,
        correlationId: undefined,
        interrupt: () => {},
      };
      ownAfter(definition, entry, plan);
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "timer:resume",
            id: definition.id,
            generation: priorTimer.generation,
            parentState: priorTimer.parentState,
            ...timerScheduleReceiptFacts(priorTimer.startedAt, priorTimer.dueAt, true),
          },
          deps.currentCorrelationId(),
        ),
      );
    }

    return changed
      ? Object.freeze({
          ...current,
          receipts: nextReceipts,
        })
      : current;
  };

  const rehydrateStateOwnedStreams = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    seedStreamGenerations(current.streams, streamGenerations);

    const definitions = deps.streamsForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextReceipts = [...current.receipts];
    let nextIssues = deps.currentIssues();
    let changed = false;

    for (const definition of definitions) {
      const priorStream = current.streams[definition.id];
      if (priorStream?.status !== "running" || ownedStreams.has(definition.id)) {
        continue;
      }

      changed = true;
      const generation =
        priorStream.generation ?? Math.max(streamGenerations.get(definition.id) ?? 0, 1);
      streamGenerations.set(
        definition.id,
        Math.max(streamGenerations.get(definition.id) ?? 0, generation),
      );
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "stream:resume",
            id: definition.id,
            generation,
            parentState: current.value,
            ...streamReceiptFacts(priorStream, true),
          },
          deps.currentCorrelationId(),
        ),
      );
      nextIssues = clearIssue(nextIssues, "stream", definition.id);

      const entry: {
        readonly definition: AnyFlowStreamDefinition;
        readonly generation: number;
        readonly restored: boolean;
        readonly correlationId: string | undefined;
        interrupt: (interruptor?: number) => void;
      } = {
        definition,
        generation,
        restored: true,
        correlationId: deps.currentCorrelationId(),
        interrupt: () => {},
      };
      ownedStreams.set(definition.id, entry);
      const params = resolveStreamParams(definition, deps.invokeArgsForSnapshot(current));
      const stream = resolveStreamSubscription(definition, params);
      const applyStreamValueNow = (value: unknown) => {
        if (deps.isDisposed() || ownedStreams.get(definition.id) !== entry) {
          return;
        }

        const currentSnapshot = deps.currentSnapshot();
        deps.replaceSnapshot(
          Object.freeze({
            ...currentSnapshot,
            streams: {
              ...currentSnapshot.streams,
              [definition.id]: {
                id: definition.id,
                status: "running",
                generation,
                emitted: (currentSnapshot.streams[definition.id]?.emitted ?? 0) + 1,
                value,
              },
            },
          }),
          true,
        );

        const routedValue = resolveStreamRouteEventWithDiagnostics(definition, "value", value);
        if (routedValue !== undefined) {
          deps.dispatchOwnedMachineEvent(routedValue as InferMachineEvent<Machine>);
        }
      };
      const applyStreamValue = (() => {
        const pressure = definition.config.pressure;
        if (pressure === undefined) {
          return (value: unknown) => {
            deps.enqueue(() => {
              applyStreamValueNow(value);
            });
          };
        }

        if (pressure.strategy === "queue") {
          let pendingValues = 0;
          return (value: unknown) => {
            if (pressure.limit !== undefined && pendingValues >= pressure.limit) {
              return;
            }

            pendingValues += 1;
            deps.enqueue(() => {
              pendingValues -= 1;
              applyStreamValueNow(value);
            });
          };
        }

        const latestByKey = new Map<string, Readonly<{ value: unknown }>>();
        return (value: unknown) => {
          const key = resolveCoalescedStreamPressureKey(definition, pressure, value);
          const hasPending = latestByKey.has(key);
          latestByKey.set(key, { value });
          if (hasPending) {
            return;
          }

          deps.enqueue(() => {
            const pending = latestByKey.get(key);
            latestByKey.delete(key);
            if (pending === undefined) {
              return;
            }

            applyStreamValueNow(pending.value);
          });
        };
      })();
      const finishStream = (exit: Exit.Exit<unknown, unknown>) => {
        deps.enqueue(() => {
          if (deps.isDisposed() || ownedStreams.get(definition.id) !== entry) {
            return;
          }

          ownedStreams.delete(definition.id);
          const currentSnapshot = deps.currentSnapshot();
          const issue = issueFromExit("stream", definition.id, exit, {
            correlationId: entry.correlationId,
            parentState: currentSnapshot.value,
            receipts: currentSnapshot.receipts,
          });
          const status: FlowStreamSnapshot["status"] = Exit.isSuccess(exit)
            ? "success"
            : issue?.kind === "interrupt"
              ? "interrupt"
              : "failure";
          deps.replaceIssues(
            issue === undefined
              ? clearIssue(deps.currentIssues(), "stream", definition.id)
              : replaceIssue(deps.currentIssues(), issue),
          );
          deps.replaceSnapshot(
            Object.freeze({
              ...currentSnapshot,
              streams: {
                ...currentSnapshot.streams,
                [definition.id]: {
                  id: definition.id,
                  status,
                  generation,
                  emitted: currentSnapshot.streams[definition.id]?.emitted ?? 0,
                  value: currentSnapshot.streams[definition.id]?.value,
                  error: issue?.error,
                },
              },
              receipts: [
                ...currentSnapshot.receipts,
                receiptWithCorrelation(
                  {
                    type: `stream:${status === "success" ? "done" : issue?.kind === "interrupt" ? "interrupt" : issue?.kind === "defect" ? "defect" : "failure"}`,
                    id: definition.id,
                    generation,
                    ...streamReceiptFacts(currentSnapshot.streams[definition.id], entry.restored),
                  } satisfies FlowReceipt,
                  entry.correlationId,
                ),
              ],
            }),
            true,
          );

          const routedEvent = Exit.isSuccess(exit)
            ? resolveStreamRouteEventWithDiagnostics(definition, "done")
            : issue?.kind === "interrupt"
              ? resolveStreamRouteEventWithDiagnostics(definition, "interrupt")
              : issue?.kind === "failure"
                ? resolveStreamRouteEventWithDiagnostics(definition, "failure", issue.error)
                : issue?.kind === "defect"
                  ? resolveStreamRouteEventWithDiagnostics(definition, "defect", issue.cause)
                  : undefined;
          if (routedEvent !== undefined) {
            deps.dispatchOwnedMachineEvent(routedEvent as InferMachineEvent<Machine>);
          }
        });
      };
      const controlledStreamSource = controlledStreamSourceOf(stream);

      if (controlledStreamSource !== undefined) {
        const unsubscribe = controlledStreamSource.subscribe({
          onValue: applyStreamValue,
          onFailure: (error) => {
            finishStream(Exit.fail(error));
          },
          onDone: () => {
            finishStream(Exit.void);
          },
        });
        entry.interrupt = () => {
          unsubscribe();
        };
        continue;
      }

      entry.interrupt = deps.runEffect(
        Stream.runForEach(stream, (value) => Effect.sync(() => applyStreamValue(value))),
        finishStream,
      );
    }

    if (!changed) {
      return current;
    }

    deps.replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      receipts: nextReceipts,
    });
  };

  const startStateOwnedStreams = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
    const definitions = deps.streamsForState(current);
    if (definitions.length === 0) {
      return current;
    }

    const nextStreams: Record<string, FlowStreamSnapshot> = {
      ...current.streams,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = deps.currentIssues();
    let changed = false;

    for (const definition of definitions) {
      if (ownedStreams.has(definition.id)) {
        continue;
      }

      changed = true;
      const generation = (streamGenerations.get(definition.id) ?? 0) + 1;
      streamGenerations.set(definition.id, generation);
      nextStreams[definition.id] = {
        id: definition.id,
        status: "running",
        generation,
        emitted: 0,
      };
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "stream:start",
            id: definition.id,
            generation,
            parentState: current.value,
            ...streamReceiptFacts(undefined, false),
          },
          deps.currentCorrelationId(),
        ),
      );
      nextIssues = clearIssue(nextIssues, "stream", definition.id);

      const entry: {
        readonly definition: AnyFlowStreamDefinition;
        readonly generation: number;
        readonly restored: boolean;
        readonly correlationId: string | undefined;
        interrupt: (interruptor?: number) => void;
      } = {
        definition,
        generation,
        restored: false,
        correlationId: deps.currentCorrelationId(),
        interrupt: () => {},
      };
      ownedStreams.set(definition.id, entry);
      const params = resolveStreamParams(definition, deps.invokeArgsForSnapshot(current));
      const stream = resolveStreamSubscription(definition, params);
      const applyStreamValueNow = (value: unknown) => {
        if (deps.isDisposed() || ownedStreams.get(definition.id) !== entry) {
          return;
        }

        const currentSnapshot = deps.currentSnapshot();
        deps.replaceSnapshot(
          Object.freeze({
            ...currentSnapshot,
            streams: {
              ...currentSnapshot.streams,
              [definition.id]: {
                id: definition.id,
                status: "running",
                generation,
                emitted: (currentSnapshot.streams[definition.id]?.emitted ?? 0) + 1,
                value,
              },
            },
          }),
          true,
        );

        const routedValue = resolveStreamRouteEventWithDiagnostics(definition, "value", value);
        if (routedValue !== undefined) {
          deps.dispatchOwnedMachineEvent(routedValue as InferMachineEvent<Machine>);
        }
      };
      const applyStreamValue = (() => {
        const pressure = definition.config.pressure;
        if (pressure === undefined) {
          return (value: unknown) => {
            deps.enqueue(() => {
              applyStreamValueNow(value);
            });
          };
        }

        if (pressure.strategy === "queue") {
          let pendingValues = 0;
          return (value: unknown) => {
            if (pressure.limit !== undefined && pendingValues >= pressure.limit) {
              return;
            }

            pendingValues += 1;
            deps.enqueue(() => {
              pendingValues -= 1;
              applyStreamValueNow(value);
            });
          };
        }

        const latestByKey = new Map<string, Readonly<{ value: unknown }>>();
        return (value: unknown) => {
          const key = resolveCoalescedStreamPressureKey(definition, pressure, value);
          const hasPending = latestByKey.has(key);
          latestByKey.set(key, { value });
          if (hasPending) {
            return;
          }

          deps.enqueue(() => {
            const pending = latestByKey.get(key);
            latestByKey.delete(key);
            if (pending === undefined) {
              return;
            }

            applyStreamValueNow(pending.value);
          });
        };
      })();
      const finishStream = (exit: Exit.Exit<unknown, unknown>) => {
        deps.enqueue(() => {
          if (deps.isDisposed() || ownedStreams.get(definition.id) !== entry) {
            return;
          }

          ownedStreams.delete(definition.id);
          const currentSnapshot = deps.currentSnapshot();
          const issue = issueFromExit("stream", definition.id, exit, {
            correlationId: entry.correlationId,
            parentState: currentSnapshot.value,
            receipts: currentSnapshot.receipts,
          });
          const status: FlowStreamSnapshot["status"] = Exit.isSuccess(exit)
            ? "success"
            : issue?.kind === "interrupt"
              ? "interrupt"
              : "failure";
          deps.replaceIssues(
            issue === undefined
              ? clearIssue(deps.currentIssues(), "stream", definition.id)
              : replaceIssue(deps.currentIssues(), issue),
          );
          deps.replaceSnapshot(
            Object.freeze({
              ...currentSnapshot,
              streams: {
                ...currentSnapshot.streams,
                [definition.id]: {
                  id: definition.id,
                  status,
                  generation,
                  emitted: currentSnapshot.streams[definition.id]?.emitted ?? 0,
                  value: currentSnapshot.streams[definition.id]?.value,
                  error: issue?.error,
                },
              },
              receipts: [
                ...currentSnapshot.receipts,
                receiptWithCorrelation(
                  {
                    type: `stream:${status === "success" ? "done" : issue?.kind === "interrupt" ? "interrupt" : issue?.kind === "defect" ? "defect" : "failure"}`,
                    id: definition.id,
                    generation,
                    ...streamReceiptFacts(currentSnapshot.streams[definition.id], entry.restored),
                  } satisfies FlowReceipt,
                  entry.correlationId,
                ),
              ],
            }),
            true,
          );

          const routedEvent = Exit.isSuccess(exit)
            ? resolveStreamRouteEventWithDiagnostics(definition, "done")
            : issue?.kind === "interrupt"
              ? resolveStreamRouteEventWithDiagnostics(definition, "interrupt")
              : issue?.kind === "failure"
                ? resolveStreamRouteEventWithDiagnostics(definition, "failure", issue.error)
                : issue?.kind === "defect"
                  ? resolveStreamRouteEventWithDiagnostics(definition, "defect", issue.cause)
                  : undefined;
          if (routedEvent !== undefined) {
            deps.dispatchOwnedMachineEvent(routedEvent as InferMachineEvent<Machine>);
          }
        });
      };
      const controlledStreamSource = controlledStreamSourceOf(stream);

      if (controlledStreamSource !== undefined) {
        const unsubscribe = controlledStreamSource.subscribe({
          onValue: applyStreamValue,
          onFailure: (error) => {
            finishStream(Exit.fail(error));
          },
          onDone: () => {
            finishStream(Exit.void);
          },
        });
        entry.interrupt = () => {
          unsubscribe();
        };
        continue;
      }

      entry.interrupt = deps.runEffect(
        Stream.runForEach(stream, (value) => Effect.sync(() => applyStreamValue(value))),
        finishStream,
      );
    }

    if (!changed) {
      return current;
    }

    deps.replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      streams: nextStreams,
      receipts: nextReceipts,
    });
  };

  const stopStateOwnedAfters = (
    current: SnapshotForMachine<Machine>,
    ownershipSnapshot: SnapshotForMachine<Machine> = current,
    interruptReason: StreamTimerInterruptReason = "dispose",
  ): SnapshotForMachine<Machine> => {
    const snapshotOnlyAfterIds = deps
      .aftersForState(ownershipSnapshot)
      .map((definition) => definition.id)
      .filter(
        (afterId) => !ownedAfters.has(afterId) && current.timers[afterId]?.status === "scheduled",
      );
    if (ownedAfters.size === 0 && snapshotOnlyAfterIds.length === 0) {
      return current;
    }

    const nextTimers: Record<string, FlowTimerSnapshot> = {
      ...current.timers,
    };
    const nextReceipts = [...current.receipts];

    for (const [afterId, entry] of Array.from(ownedAfters.entries())) {
      ownedAfters.delete(afterId);
      entry.interrupt();
      const endedAt = deps.now();
      nextTimers[afterId] = {
        id: afterId,
        status: "interrupt",
        generation: entry.generation,
        parentState: entry.parentState,
        startedAt: entry.startedAt,
        dueAt: entry.dueAt,
        endedAt,
      };
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "timer:interrupt",
            id: afterId,
            generation: entry.generation,
            parentState: entry.parentState,
            interruptReason,
            ...timerOutcomeReceiptFacts(entry.startedAt, entry.dueAt, endedAt, entry.restored),
          },
          deps.currentCorrelationId(),
        ),
      );
    }

    for (const afterId of snapshotOnlyAfterIds) {
      const priorTimer = current.timers[afterId];
      if (priorTimer?.status !== "scheduled") {
        continue;
      }

      const endedAt = deps.now();
      nextTimers[afterId] = {
        ...priorTimer,
        status: "interrupt",
        endedAt,
      };
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "timer:interrupt",
            id: afterId,
            ...(priorTimer.generation === undefined ? {} : { generation: priorTimer.generation }),
            parentState: priorTimer.parentState,
            ...(priorTimer.dueAt === undefined || priorTimer.startedAt === undefined
              ? {}
              : timerOutcomeReceiptFacts(priorTimer.startedAt, priorTimer.dueAt, endedAt, true)),
            interruptReason,
          },
          deps.currentCorrelationId(),
        ),
      );
    }

    return Object.freeze({
      ...current,
      timers: nextTimers,
      receipts: nextReceipts,
    });
  };

  const stopStateOwnedStreams = (
    current: SnapshotForMachine<Machine>,
    parentState: InferMachineState<Machine> = current.value,
    routeInterrupts = false,
    ownershipSnapshot: SnapshotForMachine<Machine> = current,
    interruptReason: StreamTimerInterruptReason = "dispose",
  ): SnapshotForMachine<Machine> => {
    const snapshotOnlyStreamIds = deps
      .streamsForState(ownershipSnapshot)
      .map((definition) => definition.id)
      .filter(
        (streamId) =>
          !ownedStreams.has(streamId) && current.streams[streamId]?.status === "running",
      );
    if (ownedStreams.size === 0 && snapshotOnlyStreamIds.length === 0) {
      return current;
    }

    const nextStreams: Record<string, FlowStreamSnapshot> = {
      ...current.streams,
    };
    const nextReceipts = [...current.receipts];
    let nextIssues = deps.currentIssues();

    for (const [streamId, entry] of Array.from(ownedStreams.entries())) {
      ownedStreams.delete(streamId);
      entry.interrupt();
      const priorStream = current.streams[streamId];
      nextStreams[streamId] = {
        id: streamId,
        status: "interrupt",
        generation: entry.generation,
        ...(priorStream?.emitted === undefined ? {} : { emitted: priorStream.emitted }),
        value: priorStream?.value,
      };
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "stream:interrupt",
            id: streamId,
            generation: entry.generation,
            parentState,
            interruptReason,
            ...streamReceiptFacts(priorStream, entry.restored),
          },
          deps.currentCorrelationId(),
        ),
      );
      nextIssues = replaceIssue(
        nextIssues,
        interruptIssue("stream", streamId, {
          correlationId: deps.currentCorrelationId(),
          parentState,
          receipts: nextReceipts,
        }),
      );

      const routedInterrupt = routeInterrupts
        ? resolveStreamRouteEventWithDiagnostics(entry.definition, "interrupt")
        : undefined;
      if (routedInterrupt !== undefined) {
        deps.enqueue(() => {
          const latest = deps.currentSnapshot().streams[streamId];
          if (latest?.status !== "interrupt" || latest.generation !== entry.generation) {
            return;
          }

          deps.dispatchOwnedMachineEvent(routedInterrupt as InferMachineEvent<Machine>);
        });
      }
    }

    for (const streamId of snapshotOnlyStreamIds) {
      const priorStream = current.streams[streamId];
      if (priorStream?.status !== "running") {
        continue;
      }

      nextStreams[streamId] = {
        ...priorStream,
        status: "interrupt",
      };
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "stream:interrupt",
            id: streamId,
            ...(priorStream.generation === undefined ? {} : { generation: priorStream.generation }),
            parentState,
            interruptReason,
            ...streamReceiptFacts(priorStream, true),
          },
          deps.currentCorrelationId(),
        ),
      );
      nextIssues = replaceIssue(
        nextIssues,
        interruptIssue("stream", streamId, {
          correlationId: deps.currentCorrelationId(),
          parentState,
          receipts: nextReceipts,
        }),
      );
    }

    deps.replaceIssues(nextIssues);
    return Object.freeze({
      ...current,
      streams: nextStreams,
      receipts: nextReceipts,
    });
  };

  return {
    rehydrateStateOwnedAfters,
    rehydrateStateOwnedStreams,
    startStateOwnedAfters,
    startStateOwnedStreams,
    stopStateOwnedAfters,
    stopStateOwnedStreams,
  };
}
