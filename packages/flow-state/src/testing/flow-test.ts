import { Cause, Effect, Exit, Stream } from "effect";

import type {
  FlowAppDefinition,
  FlowEvent,
  FlowIssue,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowReceipt,
  FlowResourceSnapshot,
  FlowSeededResource,
  FlowSnapshot,
  FlowStartedTestBuilder,
  FlowStreamSnapshot,
  FlowTestBuilder,
  FlowTestCache,
  FlowTestHarness,
  FlowTestStreamSnapshot,
  FlowTransactionSnapshot,
} from "../public/types.js";
import {
  applyMachineEvent,
  canMachineTransition,
  planMachineEvent,
} from "../machine-transition.js";
import { enqueueReadyWork, flushReadyWork } from "../ready-work.js";
import { controlledStreamSourceOf } from "./controlled-stream.js";

type BuilderState = Readonly<{
  readonly app?: FlowAppDefinition;
  readonly resources: ReadonlyArray<FlowSeededResource>;
  readonly fixtures: ReadonlyArray<string>;
}>;

type HarnessSnapshot<Context, Event extends FlowEvent, State extends string> = FlowSnapshot<
  Context,
  State,
  Event
>;

type AnyStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;

type ActiveHarnessStream = Readonly<{
  readonly generation: number;
  readonly unsubscribe: () => void;
}>;

function createIdleSnapshot(id: string): FlowResourceSnapshot {
  return {
    id,
    status: "idle",
    availability: "empty",
    activity: "idle",
    freshness: "fresh",
    isPlaceholderData: false,
  };
}

function createSuccessSnapshot(id: string, value: unknown): FlowResourceSnapshot {
  return {
    id,
    status: "success",
    availability: "value",
    activity: "idle",
    freshness: "fresh",
    value,
    isPlaceholderData: false,
  };
}

function createCache(resources: ReadonlyArray<FlowSeededResource>): FlowTestCache {
  const byId = new Map<string, FlowResourceSnapshot>();
  for (const resource of resources) {
    byId.set(resource.ref.id, createSuccessSnapshot(resource.ref.id, resource.value));
  }
  return {
    query: (id) => byId.get(id),
  };
}

function normalizeInvokes(
  configured: FlowInvokeDescriptor | ReadonlyArray<FlowInvokeDescriptor> | undefined,
): ReadonlyArray<FlowInvokeDescriptor> {
  if (configured === undefined) {
    return [];
  }

  if (Array.isArray(configured)) {
    return configured;
  }

  return [configured as FlowInvokeDescriptor];
}

function streamInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
  value: State = snapshot.value,
): ReadonlyArray<AnyStreamDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyStreamDefinition => invoke.kind === "stream",
  );
}

function invokeArgsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: HarnessSnapshot<Context, Event, State>,
): Readonly<{
  readonly context: Context;
  readonly value: State;
  readonly snapshot: HarnessSnapshot<Context, Event, State>;
  readonly resources: HarnessSnapshot<Context, Event, State>["resources"];
  readonly transactions: HarnessSnapshot<Context, Event, State>["transactions"];
  readonly streams: HarnessSnapshot<Context, Event, State>["streams"];
  readonly children: HarnessSnapshot<Context, Event, State>["children"];
  readonly receipts: HarnessSnapshot<Context, Event, State>["receipts"];
}> {
  return {
    context: snapshot.context,
    value: snapshot.value,
    snapshot,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    children: snapshot.children,
    receipts: snapshot.receipts,
  };
}

function replaceIssue(
  issues: ReadonlyArray<FlowIssue>,
  nextIssue: FlowIssue,
): ReadonlyArray<FlowIssue> {
  return Object.freeze([
    ...issues.filter((issue) => !(issue.source === nextIssue.source && issue.id === nextIssue.id)),
    nextIssue,
  ]);
}

function clearIssue(
  issues: ReadonlyArray<FlowIssue>,
  source: FlowIssue["source"],
  id: string,
): ReadonlyArray<FlowIssue> {
  return Object.freeze(issues.filter((issue) => !(issue.source === source && issue.id === id)));
}

function issueFromExit(
  source: FlowIssue["source"],
  id: string,
  exit: Exit.Exit<unknown, unknown>,
): FlowIssue | undefined {
  if (Exit.isSuccess(exit)) {
    return undefined;
  }

  if (Cause.hasInterruptsOnly(exit.cause)) {
    return {
      kind: "interrupt",
      source,
      id,
      cause: exit.cause,
    };
  }

  const failReason = exit.cause.reasons.find(Cause.isFailReason);
  if (failReason !== undefined) {
    return {
      kind: "failure",
      source,
      id,
      error: failReason.error,
      cause: exit.cause,
    };
  }

  return {
    kind: "defect",
    source,
    id,
    cause: exit.cause,
  };
}

function createHarness<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  resources: ReadonlyArray<FlowSeededResource>,
): FlowStartedTestBuilder<Context, Event, State> {
  const cache = createCache(resources);
  const activeStreams = new Map<string, ActiveHarnessStream>();
  const streamGenerations = new Map<string, number>();
  const transactions: Readonly<Record<string, FlowTransactionSnapshot>> = {};
  let issues: ReadonlyArray<FlowIssue> = [];
  let streamSnapshots: Readonly<Record<string, FlowTestStreamSnapshot>> = {};

  const materializeResources = () =>
    Object.fromEntries(
      resources.map((resource) => [
        resource.ref.id,
        cache.query(resource.ref.id) ?? createIdleSnapshot(resource.ref.id),
      ]),
    );

  const materializeSnapshot = (
    base: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> =>
    Object.freeze({
      ...base,
      resources: materializeResources(),
      transactions,
      streams: streamSnapshots,
    });

  let snapshot = materializeSnapshot(
    machine.getInitialSnapshot() as HarnessSnapshot<Context, Event, State>,
  );

  const replaceSnapshot = (next: HarnessSnapshot<Context, Event, State>) => {
    snapshot = materializeSnapshot(next);
  };

  const replaceStreamSnapshot = (
    id: string,
    snapshotForId: FlowTestStreamSnapshot,
  ): Readonly<Record<string, FlowTestStreamSnapshot>> =>
    Object.freeze({
      ...streamSnapshots,
      [id]: snapshotForId,
    });

  const appendReceipt = (
    current: HarnessSnapshot<Context, Event, State>,
    receipt: FlowReceipt,
  ): HarnessSnapshot<Context, Event, State> =>
    Object.freeze({
      ...current,
      receipts: [...current.receipts, receipt],
    });

  const startStateOwnedStreams = (
    current: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    const definitions = streamInvokesForState(current);
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
      issues = clearIssue(issues, "stream", definition.id);
      streamSnapshots = replaceStreamSnapshot(definition.id, {
        id: definition.id,
        status: "running",
        generation,
        emitted: 0,
      });
      next = appendReceipt(next, {
        type: "stream:start",
        id: definition.id,
        generation,
        parentState: current.value,
      });

      const params = definition.config.params?.(invokeArgsForSnapshot(current));
      const stream = definition.config.subscribe({ params } as never);

      const applyStreamValue = (value: unknown) => {
        enqueueReadyWork(harness, () => {
          const active = activeStreams.get(definition.id);
          if (active === undefined || active.generation !== generation) {
            return;
          }

          const previous = streamSnapshots[definition.id];
          streamSnapshots = replaceStreamSnapshot(definition.id, {
            id: definition.id,
            status: "running",
            generation,
            emitted: (previous?.emitted ?? 0) + 1,
            value,
          });
          replaceSnapshot(snapshot);

          const routedValue = definition.config.routes?.value?.(value as never);
          if (routedValue !== undefined) {
            harness.send(routedValue as Event);
          }
        });
      };

      const finishStream = (exit: Exit.Exit<unknown, unknown>) => {
        enqueueReadyWork(harness, () => {
          const active = activeStreams.get(definition.id);
          if (active === undefined || active.generation !== generation) {
            return;
          }

          activeStreams.delete(definition.id);
          const issue = issueFromExit("stream", definition.id, exit);
          issues =
            issue === undefined
              ? clearIssue(issues, "stream", definition.id)
              : replaceIssue(issues, issue);

          const previous = streamSnapshots[definition.id];
          const status: FlowStreamSnapshot["status"] = Exit.isSuccess(exit)
            ? "success"
            : issue?.kind === "interrupt"
              ? "interrupt"
              : "failure";
          streamSnapshots = replaceStreamSnapshot(definition.id, {
            id: definition.id,
            status,
            generation,
            emitted: previous?.emitted ?? 0,
            value: previous?.value,
            error: issue?.error,
          });

          replaceSnapshot(
            appendReceipt(snapshot, {
              type:
                status === "success"
                  ? "stream:done"
                  : issue?.kind === "interrupt"
                    ? "stream:interrupt"
                    : issue?.kind === "defect"
                      ? "stream:defect"
                      : "stream:failure",
              id: definition.id,
              generation,
            }),
          );

          const routedEvent = Exit.isSuccess(exit)
            ? definition.config.routes?.done?.()
            : issue?.kind === "interrupt"
              ? definition.config.routes?.interrupt?.()
              : issue?.kind === "failure"
                ? definition.config.routes?.failure?.(issue.error as never)
                : undefined;
          if (routedEvent !== undefined) {
            harness.send(routedEvent as Event);
          }
        });
      };

      const controlledStreamSource = controlledStreamSourceOf(stream);
      if (controlledStreamSource !== undefined) {
        activeStreams.set(definition.id, {
          generation,
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
        generation,
        unsubscribe: () => {
          interrupt();
        },
      });
    }

    return materializeSnapshot(next);
  };

  const stopStateOwnedStreams = (
    current: HarnessSnapshot<Context, Event, State>,
    parentState: State = current.value,
  ): HarnessSnapshot<Context, Event, State> => {
    if (activeStreams.size === 0) {
      return current;
    }

    let next = current;

    for (const [streamId, active] of Array.from(activeStreams.entries())) {
      activeStreams.delete(streamId);
      active.unsubscribe();
      issues = replaceIssue(issues, {
        kind: "interrupt",
        source: "stream",
        id: streamId,
      });

      const previous = streamSnapshots[streamId];
      streamSnapshots = replaceStreamSnapshot(streamId, {
        id: streamId,
        status: "interrupt",
        generation: active.generation,
        emitted: previous?.emitted ?? 0,
        value: previous?.value,
      });
      next = appendReceipt(next, {
        type: "stream:interrupt",
        id: streamId,
        generation: active.generation,
        parentState,
      });
    }

    return materializeSnapshot(next);
  };

  const reconcileStateOwnedStreams = (
    previous: HarnessSnapshot<Context, Event, State>,
    next: HarnessSnapshot<Context, Event, State>,
  ): HarnessSnapshot<Context, Event, State> => {
    if (previous.value === next.value) {
      return materializeSnapshot(next);
    }

    return startStateOwnedStreams(stopStateOwnedStreams(next, previous.value));
  };

  const streamInspector = Object.freeze({
    all: () => streamSnapshots,
    running: (id: string) => {
      const stream = streamSnapshots[id];
      return stream?.status === "running" ? stream : undefined;
    },
    cancelled: (id: string) => {
      const stream = streamSnapshots[id];
      return stream?.status === "interrupt" ? stream : undefined;
    },
    events: (id: string) =>
      snapshot.receipts.filter(
        (receipt) => receipt.id === id && receipt.type.startsWith("stream:"),
      ),
  });

  const harness: FlowTestHarness<Context, Event, State> = {
    state: () => snapshot.value,
    context: () => snapshot.context,
    snapshot: () => snapshot,
    send: (event) => {
      replaceSnapshot(
        reconcileStateOwnedStreams(snapshot, applyMachineEvent(planMachineEvent(snapshot, event))),
      );
      return harness;
    },
    can: (event) => canMachineTransition(snapshot, event),
    cache: () => cache,
    transactions: () => transactions,
    streams: () => streamInspector,
    issues: () => issues,
    flush: () => flushReadyWork(harness),
    advance: async (_duration) => undefined,
    settle: async (_bounds) => undefined,
  };

  replaceSnapshot(startStateOwnedStreams(snapshot));

  const started: FlowStartedTestBuilder<Context, Event, State> = Object.assign(harness, {
    provide: (_service: unknown) => started,
    clock: (_now: () => number) => started,
    start: () => harness,
  });

  return started;
}

function createBuilder(state: BuilderState = { resources: [], fixtures: [] }): FlowTestBuilder {
  return {
    app: (app) =>
      createBuilder({
        ...state,
        app,
      }),
    seedResources: (resources) =>
      createBuilder({
        ...state,
        resources,
      }),
    seedModuleFixtures: (fixture) =>
      createBuilder({
        ...state,
        fixtures: [...state.fixtures, fixture],
      }),
    start: <Context, Event extends FlowEvent, State extends string>(
      machine: FlowMachine<Context, Event, State>,
    ) => {
      void state.app;
      void state.fixtures;
      return createHarness(machine, state.resources);
    },
  };
}

export const flowTest = Object.assign(
  ((machine?: FlowMachine): FlowTestBuilder | FlowStartedTestBuilder => {
    const builder = createBuilder();
    return machine === undefined ? builder : builder.start(machine);
  }) as ((machine?: FlowMachine) => FlowTestBuilder | FlowStartedTestBuilder) & FlowTestBuilder,
  createBuilder(),
  {
    app: (app: FlowAppDefinition) => createBuilder().app(app),
    model: (machine: FlowMachine) =>
      Object.freeze({
        kind: "model" as const,
        machine,
      }),
  },
);
