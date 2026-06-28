import { Effect, Exit, Stream } from "effect";
import * as Duration from "effect/Duration";

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
} from "../public/types.js";
import { controlledStreamSourceOf } from "../testing/controlled-stream.js";
import { clearIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";

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
      readonly startedAt: number;
      readonly dueAt: number;
      readonly endedAt: number;
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
      interrupt: (interruptor?: number) => void;
    }
  >();
  const ownedAfters = new Map<
    string,
    {
      readonly definition: AnyFlowAfterDefinition;
      readonly generation: number;
      readonly parentState: InferMachineState<Machine>;
      readonly startedAt: number;
      readonly dueAt: number;
      interrupt: (interruptor?: number) => void;
    }
  >();
  const streamGenerations = new Map<string, number>();
  const timerGenerations = new Map<string, number>();

  const startStateOwnedAfters = (
    current: SnapshotForMachine<Machine>,
  ): SnapshotForMachine<Machine> => {
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
      const startedAt = deps.now();
      const generation = (timerGenerations.get(definition.id) ?? 0) + 1;
      const dueAt =
        startedAt + Duration.toMillis(Duration.fromInputUnsafe(definition.config.delay));
      timerGenerations.set(definition.id, generation);
      nextTimers[definition.id] = {
        id: definition.id,
        status: "scheduled",
        generation,
        parentState: current.value,
        startedAt,
        dueAt,
      };
      nextReceipts.push({
        type: "timer:start",
        id: definition.id,
        generation,
        parentState: current.value,
        dueAt,
      });

      const entry: {
        readonly definition: AnyFlowAfterDefinition;
        readonly generation: number;
        readonly parentState: InferMachineState<Machine>;
        readonly startedAt: number;
        readonly dueAt: number;
        interrupt: (interruptor?: number) => void;
      } = {
        definition,
        generation,
        parentState: current.value,
        startedAt,
        dueAt,
        interrupt: () => {},
      };
      ownedAfters.set(definition.id, entry);
      entry.interrupt = deps.runEffect(Effect.sleep(definition.config.delay), (exit) => {
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
              startedAt: entry.startedAt,
              dueAt: entry.dueAt,
              endedAt,
            }),
            true,
          );
        });
      });
    }

    return changed
      ? Object.freeze({
          ...current,
          timers: nextTimers,
          receipts: nextReceipts,
        })
      : current;
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
      nextReceipts.push({
        type: "stream:start",
        id: definition.id,
        generation,
        parentState: current.value,
      });
      nextIssues = clearIssue(nextIssues, "stream", definition.id);

      const entry: {
        readonly definition: AnyFlowStreamDefinition;
        readonly generation: number;
        interrupt: (interruptor?: number) => void;
      } = {
        definition,
        generation,
        interrupt: () => {},
      };
      ownedStreams.set(definition.id, entry);
      const params = definition.config.params?.(deps.invokeArgsForSnapshot(current) as never);
      const stream = definition.config.subscribe({ params } as never);
      const applyStreamValue = (value: unknown) => {
        deps.enqueue(() => {
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

          const routedValue = definition.config.routes?.value?.(value as never);
          if (routedValue !== undefined) {
            deps.dispatchOwnedMachineEvent(routedValue as InferMachineEvent<Machine>);
          }
        });
      };
      const finishStream = (exit: Exit.Exit<unknown, unknown>) => {
        deps.enqueue(() => {
          if (deps.isDisposed() || ownedStreams.get(definition.id) !== entry) {
            return;
          }

          ownedStreams.delete(definition.id);
          const issue = issueFromExit("stream", definition.id, exit);
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
          const currentSnapshot = deps.currentSnapshot();
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
                {
                  type: `stream:${status === "success" ? "done" : issue?.kind === "interrupt" ? "interrupt" : issue?.kind === "defect" ? "defect" : "failure"}`,
                  id: definition.id,
                  generation,
                } satisfies FlowReceipt,
              ],
            }),
            true,
          );

          const routedEvent = Exit.isSuccess(exit)
            ? definition.config.routes?.done?.()
            : issue?.kind === "interrupt"
              ? definition.config.routes?.interrupt?.()
              : issue?.kind === "failure"
                ? definition.config.routes?.failure?.(issue.error as never)
                : issue?.kind === "defect"
                  ? definition.config.routes?.defect?.(issue.cause)
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
  ): SnapshotForMachine<Machine> => {
    if (ownedAfters.size === 0) {
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
      nextReceipts.push({
        type: "timer:interrupt",
        id: afterId,
        generation: entry.generation,
        parentState: entry.parentState,
        dueAt: entry.dueAt,
        endedAt,
      });
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
  ): SnapshotForMachine<Machine> => {
    if (ownedStreams.size === 0) {
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
      nextReceipts.push({
        type: "stream:interrupt",
        id: streamId,
        generation: entry.generation,
        parentState,
      });
      nextIssues = replaceIssue(nextIssues, {
        kind: "interrupt",
        source: "stream",
        id: streamId,
      });

      const routedInterrupt = routeInterrupts
        ? entry.definition.config.routes?.interrupt?.()
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

    deps.replaceIssues(nextIssues);
    return Object.freeze({
      ...current,
      streams: nextStreams,
      receipts: nextReceipts,
    });
  };

  return {
    startStateOwnedAfters,
    startStateOwnedStreams,
    stopStateOwnedAfters,
    stopStateOwnedStreams,
  };
}
