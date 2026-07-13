import { Effect, Exit, Stream } from "effect";

import type {
  FlowIssue,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowReceipt,
  FlowSnapshot,
  FlowStreamSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import {
  type StreamTimerInterruptReason,
  streamReceiptFacts,
} from "./stream-timer-inspection-facts.js";
import {
  resolveCoalescedStreamPressureKey,
  resolveStreamParams,
  resolveStreamRouteEventWithDiagnostics,
  resolveStreamSubscription,
} from "../streams/stream-callbacks.js";
import { controlledStreamSourceOf } from "../streams/controlled-stream-source.js";
import { createTerminalStreamSnapshot } from "../streams/stream-snapshot.js";
import { clearIssue, interruptIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";
import type { OwnedEffectRunner } from "../runtime/owned-effect-runner.js";

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type AnyFlowStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;

type StreamOwnershipDeps<Machine extends FlowMachine> = Readonly<{
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
  readonly runEffect: OwnedEffectRunner;
  readonly invokeArgsForSnapshot: (
    snapshot: SnapshotForMachine<Machine>,
  ) => Record<string, unknown>;
  readonly streamsForState: (
    snapshot: SnapshotForMachine<Machine>,
  ) => ReadonlyArray<AnyFlowStreamDefinition>;
}>;

type OwnedStreamEntry = {
  readonly definition: AnyFlowStreamDefinition;
  readonly generation: number;
  readonly restored: boolean;
  readonly correlationId: string | undefined;
  interrupt: (interruptor?: number) => void;
  awaitExit: Effect.Effect<void, unknown>;
};

export function createStreamOwnershipController<Machine extends FlowMachine>(
  deps: StreamOwnershipDeps<Machine>,
) {
  const ownedStreams = new Map<string, OwnedStreamEntry>();
  const streamGenerations = new Map<string, number>();
  const interruptedFinalizers: Array<Effect.Effect<void, unknown>> = [];

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

  const createStreamEntry = (
    definition: AnyFlowStreamDefinition,
    generation: number,
    restored: boolean,
    correlationId: string | undefined,
  ): OwnedStreamEntry => ({
    definition,
    generation,
    restored,
    correlationId,
    interrupt: () => {},
    awaitExit: Effect.void,
  });

  const replaceRunningStreamValue = (
    definition: AnyFlowStreamDefinition,
    entry: OwnedStreamEntry,
    value: unknown,
  ) => {
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
            generation: entry.generation,
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

  const createStreamValueApplier = (
    definition: AnyFlowStreamDefinition,
    entry: OwnedStreamEntry,
  ) => {
    const applyStreamValueNow = (value: unknown) => {
      replaceRunningStreamValue(definition, entry, value);
    };

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
  };

  const createStreamExitHandler =
    (definition: AnyFlowStreamDefinition, entry: OwnedStreamEntry) =>
    (exit: Exit.Exit<unknown, unknown>) => {
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
        if (!Exit.isSuccess(exit) && issue === undefined) {
          return;
        }
        const previousStream = currentSnapshot.streams[definition.id];
        const nextStream = createTerminalStreamSnapshot({
          id: definition.id,
          generation: entry.generation,
          emitted: previousStream?.emitted ?? 0,
          value: previousStream?.value,
          ...(issue === undefined ? {} : { issue }),
        });
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
              [definition.id]: nextStream,
            },
            receipts: [
              ...currentSnapshot.receipts,
              receiptWithCorrelation(
                {
                  type:
                    nextStream.status === "success"
                      ? "stream:done"
                      : nextStream.status === "interrupt"
                        ? "stream:interrupt"
                        : nextStream.status === "defect"
                          ? "stream:defect"
                          : "stream:failure",
                  id: definition.id,
                  generation: entry.generation,
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

  const ownStream = (
    definition: AnyFlowStreamDefinition,
    current: SnapshotForMachine<Machine>,
    entry: OwnedStreamEntry,
  ) => {
    ownedStreams.set(definition.id, entry);
    const params = resolveStreamParams(definition, deps.invokeArgsForSnapshot(current));
    const stream = resolveStreamSubscription(definition, params);
    const applyStreamValue = createStreamValueApplier(definition, entry);
    const finishStream = createStreamExitHandler(definition, entry);
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
      return;
    }

    const handle = deps.runEffect(
      Stream.runForEach(stream, (value) => Effect.sync(() => applyStreamValue(value))),
      finishStream,
    );
    entry.interrupt = handle;
    entry.awaitExit = handle.awaitExit;
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

      ownStream(
        definition,
        current,
        createStreamEntry(definition, generation, true, deps.currentCorrelationId()),
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

      ownStream(
        definition,
        current,
        createStreamEntry(definition, generation, false, deps.currentCorrelationId()),
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
      if (interruptReason === "dispose") {
        interruptedFinalizers.push(entry.awaitExit);
      }
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
          } satisfies FlowReceipt,
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
          } satisfies FlowReceipt,
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
    drainInterruptedFinalizers: () => {
      const finalizers = interruptedFinalizers.splice(0);
      return finalizers;
    },
    rehydrateStateOwnedStreams,
    startStateOwnedStreams,
    stopStateOwnedStreams,
  };
}
