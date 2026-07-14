import { Effect, Exit, Stream } from "effect";

import type {
  FlowEvent,
  FlowIssue,
  FlowInvokeDescriptor,
  FlowReceipt,
  FlowSnapshot,
  FlowStreamDefinition,
  FlowTestStreamSnapshot,
} from "../core/api/types.js";
import {
  clearIssue,
  interruptIssue,
  issueFromExit,
  replaceIssue,
} from "../core/orchestrator/orchestrator-issues.js";
import {
  type StreamTimerInterruptReason,
  streamReceiptFacts,
} from "../core/orchestrator/stream-timer-inspection-facts.js";
import { controlledStreamSourceOf } from "../core/streams/controlled-stream-source.js";
import { createTerminalStreamSnapshot } from "../core/streams/stream-snapshot.js";
import {
  resolveStreamParams,
  resolveStreamRouteEventWithDiagnostics,
  resolveStreamSubscription,
} from "../core/streams/stream-callbacks.js";

type HarnessSnapshot<Context, Event extends FlowEvent, State extends string> = FlowSnapshot<
  Context,
  State,
  Event
>;

type AnyStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;
type RunnableStreamDefinition<Event extends FlowEvent> = FlowStreamDefinition<
  unknown,
  unknown,
  unknown,
  Event,
  unknown,
  string,
  unknown
>;

function asRunnableStreamDefinition<Event extends FlowEvent>(
  definition: AnyStreamDefinition,
): RunnableStreamDefinition<Event> {
  return definition as unknown as RunnableStreamDefinition<Event>;
}

type ActiveHarnessStream = Readonly<{
  readonly definition: AnyStreamDefinition;
  readonly generation: number;
  readonly restored: boolean;
  readonly correlationId: string | undefined;
  readonly unsubscribe: () => void;
}>;

type FlowTestStreamOwnershipDeps<
  Context,
  Event extends FlowEvent,
  State extends string,
> = Readonly<{
  readonly currentSnapshot: () => HarnessSnapshot<Context, Event, State>;
  readonly replaceSnapshot: (next: HarnessSnapshot<Context, Event, State>) => void;
  readonly materializeSnapshot: (
    base: HarnessSnapshot<Context, Event, State>,
  ) => HarnessSnapshot<Context, Event, State>;
  readonly currentStreamSnapshots: () => Readonly<Record<string, FlowTestStreamSnapshot>>;
  readonly replaceStreamSnapshots: (next: Readonly<Record<string, FlowTestStreamSnapshot>>) => void;
  readonly currentIssues: () => ReadonlyArray<FlowIssue>;
  readonly replaceIssues: (next: ReadonlyArray<FlowIssue>) => void;
  readonly appendReceipt: (
    current: HarnessSnapshot<Context, Event, State>,
    receipt: FlowReceipt,
  ) => HarnessSnapshot<Context, Event, State>;
  readonly streamInvokesForState: (
    snapshot: HarnessSnapshot<Context, Event, State>,
  ) => ReadonlyArray<AnyStreamDefinition>;
  readonly invokeArgsForSnapshot: (
    snapshot: HarnessSnapshot<Context, Event, State>,
  ) => Record<string, unknown>;
  readonly dispatchOwnedMachineEvent: (event: Event) => void;
  readonly enqueue: (work: () => void) => void;
  readonly withInspectionCorrelation: <Value>(
    correlationId: string | undefined,
    work: () => Value,
  ) => Value;
  readonly currentCorrelationId: () => string | undefined;
}>;

function replaceStreamSnapshot(
  streams: Readonly<Record<string, FlowTestStreamSnapshot>>,
  id: string,
  snapshotForId: FlowTestStreamSnapshot,
): Readonly<Record<string, FlowTestStreamSnapshot>> {
  return Object.freeze({
    ...streams,
    [id]: snapshotForId,
  });
}

export function createFlowTestStreamOwnership<
  Context,
  Event extends FlowEvent,
  State extends string,
>(deps: FlowTestStreamOwnershipDeps<Context, Event, State>) {
  const activeStreams = new Map<string, ActiveHarnessStream>();
  const streamGenerations = new Map<string, number>();

  const startStateOwnedStreams = (
    current: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = deps.streamInvokesForState(current);
    if (definitions.length === 0) {
      return current;
    }

    let next = current;

    for (const definition of definitions) {
      if (activeStreams.has(definition.id)) {
        continue;
      }

      const generation = (streamGenerations.get(definition.id) ?? 0) + 1;
      streamGenerations.set(definition.id, generation);
      deps.replaceIssues(clearIssue(deps.currentIssues(), "stream", definition.id));
      deps.replaceStreamSnapshots(
        replaceStreamSnapshot(deps.currentStreamSnapshots(), definition.id, {
          id: definition.id,
          status: "running",
          generation,
          emitted: 0,
          hasValue: false,
        }),
      );
      next = deps.appendReceipt(next, {
        type: "stream:start",
        id: definition.id,
        generation,
        parentState: current.value,
        ...streamReceiptFacts(undefined, false),
      });

      const runnableDefinition = asRunnableStreamDefinition<Event>(definition);
      const params = resolveStreamParams(runnableDefinition, deps.invokeArgsForSnapshot(current));
      const stream = resolveStreamSubscription(runnableDefinition, params);

      const applyStreamValue = (value: unknown) => {
        deps.enqueue(() => {
          const active = activeStreams.get(definition.id);
          if (active === undefined || active.generation !== generation) {
            return;
          }

          const previous = deps.currentStreamSnapshots()[definition.id];
          deps.replaceStreamSnapshots(
            replaceStreamSnapshot(deps.currentStreamSnapshots(), definition.id, {
              id: definition.id,
              status: "running",
              generation,
              emitted: (previous?.emitted ?? 0) + 1,
              hasValue: true,
              value,
            }),
          );
          deps.replaceSnapshot(deps.currentSnapshot());

          const routedValue = resolveStreamRouteEventWithDiagnostics(
            runnableDefinition,
            "value",
            value,
          );
          if (routedValue !== undefined) {
            deps.dispatchOwnedMachineEvent(routedValue as Event);
          }
        });
      };

      const finishStream = (exit: Exit.Exit<unknown, unknown>) => {
        deps.enqueue(() => {
          const active = activeStreams.get(definition.id);
          if (active === undefined || active.generation !== generation) {
            return;
          }

          deps.withInspectionCorrelation(active.correlationId, () => {
            activeStreams.delete(definition.id);
            const currentSnapshot = deps.currentSnapshot();
            const issue = issueFromExit("stream", definition.id, exit, {
              correlationId: active.correlationId,
              parentState: currentSnapshot.value,
              receipts: currentSnapshot.receipts,
            });
            if (!Exit.isSuccess(exit) && issue === undefined) {
              return;
            }
            deps.replaceIssues(
              issue === undefined
                ? clearIssue(deps.currentIssues(), "stream", definition.id)
                : replaceIssue(deps.currentIssues(), issue),
            );

            const previous = deps.currentStreamSnapshots()[definition.id];
            const nextStream: FlowTestStreamSnapshot = createTerminalStreamSnapshot({
              id: definition.id,
              generation,
              emitted: previous?.emitted ?? 0,
              hasValue: previous?.hasValue ?? false,
              value: previous?.value,
              ...(issue === undefined ? {} : { issue }),
            });
            deps.replaceStreamSnapshots(
              replaceStreamSnapshot(deps.currentStreamSnapshots(), definition.id, nextStream),
            );

            deps.replaceSnapshot(
              deps.appendReceipt(currentSnapshot, {
                type:
                  nextStream.status === "success"
                    ? "stream:done"
                    : nextStream.status === "interrupt"
                      ? "stream:interrupt"
                      : nextStream.status === "defect"
                        ? "stream:defect"
                        : "stream:failure",
                id: definition.id,
                generation,
                ...streamReceiptFacts(previous, active.restored),
              }),
            );

            const routedEvent = Exit.isSuccess(exit)
              ? resolveStreamRouteEventWithDiagnostics(runnableDefinition, "done")
              : issue?.kind === "interrupt"
                ? resolveStreamRouteEventWithDiagnostics(runnableDefinition, "interrupt")
                : issue?.kind === "failure"
                  ? resolveStreamRouteEventWithDiagnostics(
                      runnableDefinition,
                      "failure",
                      issue.error,
                    )
                  : issue?.kind === "defect"
                    ? resolveStreamRouteEventWithDiagnostics(
                        runnableDefinition,
                        "defect",
                        issue.cause,
                      )
                    : undefined;
            if (routedEvent !== undefined) {
              deps.dispatchOwnedMachineEvent(routedEvent as Event);
            }
          });
        });
      };

      const controlledStreamSource = controlledStreamSourceOf(stream);
      if (controlledStreamSource !== undefined) {
        activeStreams.set(definition.id, {
          definition,
          generation,
          restored: false,
          correlationId: deps.currentCorrelationId(),
          unsubscribe: controlledStreamSource.subscribe({
            onValue: applyStreamValue,
            onFailure: (error) => {
              finishStream(Exit.fail(error));
            },
            onDone: () => {
              finishStream(Exit.void);
            },
          }),
        });
        continue;
      }

      const interrupt = Effect.runCallback(
        Stream.runForEach(stream as Stream.Stream<unknown, unknown, never>, (value) =>
          Effect.sync(() => {
            applyStreamValue(value);
          }),
        ),
        {
          onExit: finishStream,
        },
      );

      activeStreams.set(definition.id, {
        definition,
        generation,
        restored: false,
        correlationId: deps.currentCorrelationId(),
        unsubscribe: () => {
          interrupt();
        },
      });
    }

    return deps.materializeSnapshot(next);
  };

  const stopStateOwnedStreams = (
    current: HarnessSnapshot<Context, Event, State>,
    parentState: State = current.value,
    interruptReason: StreamTimerInterruptReason = "state-exit",
  ): HarnessSnapshot<Context, Event, State> => {
    if (activeStreams.size === 0) {
      return current;
    }

    let next = current;

    for (const [streamId, active] of Array.from(activeStreams.entries())) {
      activeStreams.delete(streamId);
      active.unsubscribe();

      const previous = deps.currentStreamSnapshots()[streamId];
      deps.replaceStreamSnapshots(
        replaceStreamSnapshot(deps.currentStreamSnapshots(), streamId, {
          id: streamId,
          status: "interrupt",
          generation: active.generation,
          emitted: previous?.emitted ?? 0,
          ...(previous?.hasValue === true
            ? { hasValue: true as const, value: previous.value }
            : { hasValue: false as const }),
        }),
      );
      next = deps.appendReceipt(next, {
        type: "stream:interrupt",
        id: streamId,
        generation: active.generation,
        parentState,
        interruptReason,
        ...streamReceiptFacts(previous, active.restored),
      });
      deps.replaceIssues(
        replaceIssue(
          deps.currentIssues(),
          interruptIssue("stream", streamId, {
            correlationId: active.correlationId,
            parentState,
            receipts: next.receipts,
          }),
        ),
      );

      const routedInterrupt = resolveStreamRouteEventWithDiagnostics(
        asRunnableStreamDefinition<Event>(active.definition),
        "interrupt",
      );
      if (routedInterrupt !== undefined) {
        deps.enqueue(() => {
          const latest = deps.currentStreamSnapshots()[streamId];
          if (latest?.status !== "interrupt" || latest.generation !== active.generation) {
            return;
          }

          deps.dispatchOwnedMachineEvent(routedInterrupt as Event);
        });
      }
    }

    return deps.materializeSnapshot(next);
  };

  return Object.freeze({
    activeStreamIds: () => Array.from(activeStreams.keys()),
    startStateOwnedStreams,
    stopStateOwnedStreams,
  });
}
