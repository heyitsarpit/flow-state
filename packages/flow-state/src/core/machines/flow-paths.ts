import {
  actionCountsForTransition,
  applyMachineEventWithMeta,
  canMachineTransition,
  planMachineEvent,
} from "./machine-transition.js";
import {
  serializeQueueCapacity,
  transactionConcurrencyKey,
} from "../orchestrator/orchestrator-transaction-concurrency.js";
import { transactionPreviewReceiptFacts } from "../orchestrator/transaction-inspection-facts.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import {
  resolveTransactionParams,
  resolveTransactionPreviewPatches,
} from "../transactions/transaction-callbacks.js";
import type {
  FlowEvent,
  FlowModelPath,
  FlowModelStep,
  FlowModelTraversalOptions,
  FlowSnapshot,
  UnknownFlowTransactionDefinition,
} from "../api/types.js";

type FlowPathFromEventsOptions<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly fromState?: FlowSnapshot<Context, State, Event>;
  readonly toState?: (snapshot: FlowSnapshot<Context, State, Event>) => boolean;
}>;

const emptySteps = Object.freeze([]) as ReadonlyArray<never>;

function defaultSerializeState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): string {
  return JSON.stringify({
    value: snapshot.value,
    context: snapshot.context,
  });
}

function defaultSerializeEvent<Event extends FlowEvent>(event: Event): string {
  return JSON.stringify(event);
}

function formatEvent<Event extends FlowEvent>(event: Event): string {
  const { type, ...rest } = event;
  return Object.keys(rest).length === 0 ? type : `${type} (${JSON.stringify(rest)})`;
}

function formatDescription<Context, Event extends FlowEvent, State extends string>(
  path: FlowModelPath<Context, Event, State>,
): string {
  const target = JSON.stringify(path.state.value);

  if (path.steps.length === 0) {
    return `Reaches state ${target}`;
  }

  return `Reaches state ${target}: ${path.steps.map((step) => formatEvent(step.event)).join(" -> ")}`;
}

function createPath<Context, Event extends FlowEvent, State extends string>(
  state: FlowSnapshot<Context, State, Event>,
  steps: ReadonlyArray<FlowModelStep<Context, Event, State>>,
): FlowModelPath<Context, Event, State> {
  const path = Object.freeze({
    state,
    steps,
    weight: steps.length,
    description: "",
  });

  return Object.freeze({
    ...path,
    description: formatDescription(path),
  });
}

function extendPath<Context, Event extends FlowEvent, State extends string>(
  path: FlowModelPath<Context, Event, State>,
  event: Event,
  state: FlowSnapshot<Context, State, Event>,
): FlowModelPath<Context, Event, State> {
  return createPath(
    state,
    Object.freeze([
      ...path.steps,
      Object.freeze({
        event,
        state,
      }),
    ]),
  );
}

function configuredEventsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  options: FlowModelTraversalOptions<Context, Event, State>,
): ReadonlyArray<Event> {
  if (typeof options.events === "function") {
    return options.events(snapshot);
  }

  if (options.events !== undefined) {
    return options.events;
  }

  const eventTypes = Object.keys(snapshot.machine.config.states[snapshot.value]?.on ?? {});
  return Object.freeze(eventTypes.map((type) => ({ type }) as Event));
}

function nextEventsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  options: FlowModelTraversalOptions<Context, Event, State>,
): ReadonlyArray<Event> {
  return configuredEventsForSnapshot(snapshot, options).filter((event) => {
    if (!canMachineTransition(snapshot, event)) {
      return false;
    }

    return options.filterEvents?.(snapshot, event) ?? true;
  });
}

function invokeArgsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
) {
  return {
    context: snapshot.context,
    value: snapshot.value,
    snapshot,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
  };
}

function nextTransactionGeneration<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  transactionId: string,
): number {
  for (let index = snapshot.receipts.length - 1; index >= 0; index -= 1) {
    const receipt = snapshot.receipts[index];
    if (receipt?.id === transactionId && typeof receipt.generation === "number") {
      return receipt.generation + 1;
    }
  }

  return 1;
}

function activeTransactionCountForQueueKey<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  queueKey: string,
): number {
  let activeCount = 0;

  for (const receipt of snapshot.receipts) {
    if (receipt.queueKey !== queueKey) {
      continue;
    }

    if (receipt.type === "transaction:start" || receipt.type === "transaction:dequeue") {
      activeCount += 1;
      continue;
    }

    if (
      receipt.type === "transaction:success" ||
      receipt.type === "transaction:failure" ||
      receipt.type === "transaction:defect" ||
      receipt.type === "transaction:interrupt"
    ) {
      activeCount = Math.max(0, activeCount - 1);
    }
  }

  return activeCount;
}

function queuedTransactionCountForQueueKey<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  queueKey: string,
): number {
  let queuedCount = 0;

  for (const receipt of snapshot.receipts) {
    if (receipt.queueKey !== queueKey) {
      continue;
    }

    if (receipt.type === "transaction:queue") {
      queuedCount += 1;
      continue;
    }

    if (receipt.type === "transaction:dequeue") {
      queuedCount = Math.max(0, queuedCount - 1);
    }
  }

  return queuedCount;
}

function applySubmitPreviewPatch<Value>(
  previousSnapshot: Readonly<{ readonly value?: Value }> | undefined,
  previewPatch: Readonly<{ readonly ref: Readonly<{ readonly id: string }> }>,
  patch: Readonly<{ readonly replace: Value } | { readonly patch: unknown }>,
) {
  const previousValue = previousSnapshot?.value;
  const nextValue =
    "replace" in patch ? patch.replace : applyResourcePatch(previousValue, patch.patch);

  return Object.freeze({
    id: previewPatch.ref.id,
    status: "success" as const,
    availability: "value" as const,
    activity: "idle" as const,
    freshness: "fresh" as const,
    value: nextValue,
    ...(previousValue === undefined ? {} : { previousValue }),
    isPlaceholderData: false,
  });
}

function applyEventOwnedSubmitEffects<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  submit: UnknownFlowTransactionDefinition<Event>,
): FlowSnapshot<Context, State, Event> {
  const params = resolveTransactionParams(submit, {
    ...invokeArgsForSnapshot(snapshot),
    event,
  });

  if (params === null) {
    return snapshot;
  }

  const queueKey = transactionConcurrencyKey(submit);
  if (
    submit.config.concurrency === "serialize" &&
    activeTransactionCountForQueueKey(snapshot, queueKey) > 0 &&
    queuedTransactionCountForQueueKey(snapshot, queueKey) < serializeQueueCapacity(submit)
  ) {
    return Object.freeze<FlowSnapshot<Context, State, Event>>({
      ...snapshot,
      receipts: Object.freeze([
        ...snapshot.receipts,
        Object.freeze({
          type: "transaction:queue" as const,
          id: submit.id,
          queueKey,
          overlapCause: "active-attempt" as const,
          parentState: snapshot.value,
        }),
      ]),
    });
  }

  const generation = nextTransactionGeneration(snapshot, submit.id);
  const previewPatches = resolveTransactionPreviewPatches(submit, params);
  let nextResources = snapshot.resources;
  let nextReceipts = Object.freeze([
    ...snapshot.receipts,
    Object.freeze({
      type: "transaction:start" as const,
      id: submit.id,
      generation,
      trigger: "event" as const,
      queueKey,
      startedAt: 0,
      parentState: snapshot.value,
    }),
  ]);

  for (const [index, previewPatch] of previewPatches.entries()) {
    nextResources = Object.freeze({
      ...nextResources,
      [previewPatch.ref.id]: applySubmitPreviewPatch(
        nextResources[previewPatch.ref.id],
        previewPatch,
        "replace" in previewPatch
          ? { replace: previewPatch.replace }
          : { patch: previewPatch.patch },
      ),
    });
    nextReceipts = Object.freeze([
      ...nextReceipts,
      Object.freeze({
        type: "transaction:preview-patch" as const,
        id: submit.id,
        ...transactionPreviewReceiptFacts(generation, queueKey, [previewPatch])[0],
        previewIndex: index + 1,
        previewCount: previewPatches.length,
        parentState: snapshot.value,
      }),
    ]);
  }

  return Object.freeze<FlowSnapshot<Context, State, Event>>({
    ...snapshot,
    resources: nextResources,
    transactions: {
      ...snapshot.transactions,
      [submit.id]: {
        id: submit.id,
        status: "pending",
      },
    },
    receipts: nextReceipts,
  });
}

function transitionSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): Readonly<{
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly reentered: boolean;
  readonly sameKeyStepIsObservable: boolean;
}> {
  const plan = planMachineEvent(snapshot, event);
  const applied = applyMachineEventWithMeta(plan);

  if (!plan.matched) {
    return Object.freeze({
      ...applied,
      sameKeyStepIsObservable: false,
    });
  }

  const nextValue = plan.transition.target ?? snapshot.value;
  const actionCounts = actionCountsForTransition(snapshot, nextValue, plan.transition);
  const nextSnapshot = (
    plan.transition.submit === undefined
      ? applied.snapshot
      : applyEventOwnedSubmitEffects(applied.snapshot, event, plan.transition.submit)
  ) as FlowSnapshot<Context, State, Event>;
  const sameKeyStepIsObservable =
    applied.reentered ||
    plan.transition.submit !== undefined ||
    actionCounts.exit > 0 ||
    actionCounts.transition > 0 ||
    actionCounts.entry > 0;

  return Object.freeze<{
    readonly snapshot: FlowSnapshot<Context, State, Event>;
    readonly reentered: boolean;
    readonly sameKeyStepIsObservable: boolean;
  }>({
    snapshot: nextSnapshot,
    reentered: applied.reentered,
    sameKeyStepIsObservable,
  });
}

function isCoveredSubpath<Context, Event extends FlowEvent, State extends string>(
  candidate: FlowModelPath<Context, Event, State>,
  other: FlowModelPath<Context, Event, State>,
  serializeState: (snapshot: FlowSnapshot<Context, State, Event>) => string,
  serializeEvent: (event: Event) => string,
): boolean {
  if (candidate.steps.length >= other.steps.length) {
    return false;
  }

  for (const [index, step] of candidate.steps.entries()) {
    const otherStep = other.steps[index];
    if (otherStep === undefined) {
      return false;
    }
    if (serializeEvent(step.event) !== serializeEvent(otherStep.event)) {
      return false;
    }
    if (serializeState(step.state) !== serializeState(otherStep.state)) {
      return false;
    }
  }

  return true;
}

function filterPaths<Context, Event extends FlowEvent, State extends string>(
  paths: ReadonlyArray<FlowModelPath<Context, Event, State>>,
  options: FlowModelTraversalOptions<Context, Event, State>,
): ReadonlyArray<FlowModelPath<Context, Event, State>> {
  const filtered =
    options.toState === undefined ? paths : paths.filter((path) => options.toState?.(path.state));

  if (options.allowDuplicatePaths === true) {
    return filtered;
  }

  const serializeState = options.serializeState ?? defaultSerializeState<Context, Event, State>;
  const serializeEvent = options.serializeEvent ?? defaultSerializeEvent<Event>;

  return filtered.filter(
    (candidate, candidateIndex) =>
      !filtered.some(
        (other, otherIndex) =>
          otherIndex !== candidateIndex &&
          isCoveredSubpath(candidate, other, serializeState, serializeEvent),
      ),
  );
}

export function shortestFlowPaths<Context, Event extends FlowEvent, State extends string>(
  initial: FlowSnapshot<Context, State, Event>,
  options: FlowModelTraversalOptions<Context, Event, State> = {},
): ReadonlyArray<FlowModelPath<Context, Event, State>> {
  const serializeState = options.serializeState ?? defaultSerializeState<Context, Event, State>;
  const maxDepth = options.maxDepth ?? 8;
  const limit = options.limit ?? 256;
  const initialPath = createPath(initial, emptySteps);
  const queue: Array<FlowModelPath<Context, Event, State>> = [initialPath];
  const visited = new Set<string>([serializeState(initial)]);
  const discovered: Array<FlowModelPath<Context, Event, State>> = [initialPath];
  let traversed = 0;

  while (queue.length > 0 && traversed < limit) {
    const current = queue.shift();
    if (current === undefined || current.steps.length >= maxDepth) {
      continue;
    }

    for (const event of nextEventsForSnapshot(current.state, options)) {
      const nextTransition = transitionSnapshot(current.state, event);
      const next = nextTransition.snapshot;
      const nextKey = serializeState(next);
      const nextPath = extendPath(current, event, next);
      if (visited.has(nextKey)) {
        if (nextTransition.sameKeyStepIsObservable) {
          discovered.push(nextPath);
          traversed += 1;
          if (traversed >= limit) {
            break;
          }
        }
        continue;
      }

      visited.add(nextKey);
      discovered.push(nextPath);
      queue.push(nextPath);
      traversed += 1;

      if (traversed >= limit) {
        break;
      }
    }
  }

  return filterPaths(discovered, options);
}

export function simpleFlowPaths<Context, Event extends FlowEvent, State extends string>(
  initial: FlowSnapshot<Context, State, Event>,
  options: FlowModelTraversalOptions<Context, Event, State> = {},
): ReadonlyArray<FlowModelPath<Context, Event, State>> {
  const serializeState = options.serializeState ?? defaultSerializeState<Context, Event, State>;
  const maxDepth = options.maxDepth ?? 8;
  const limit = options.limit ?? 256;
  const initialPath = createPath(initial, emptySteps);
  const discovered: Array<FlowModelPath<Context, Event, State>> = [initialPath];
  let traversed = 0;

  const visit = (current: FlowModelPath<Context, Event, State>, seen: ReadonlySet<string>) => {
    if (current.steps.length >= maxDepth || traversed >= limit) {
      return;
    }

    for (const event of nextEventsForSnapshot(current.state, options)) {
      const nextTransition = transitionSnapshot(current.state, event);
      const next = nextTransition.snapshot;
      const nextKey = serializeState(next);
      const nextPath = extendPath(current, event, next);
      if (seen.has(nextKey)) {
        if (nextTransition.sameKeyStepIsObservable) {
          discovered.push(nextPath);
          traversed += 1;
          if (traversed >= limit) {
            break;
          }
        }
        continue;
      }

      discovered.push(nextPath);
      traversed += 1;
      visit(nextPath, new Set([...seen, nextKey]));

      if (traversed >= limit) {
        break;
      }
    }
  };

  visit(initialPath, new Set([serializeState(initial)]));
  return filterPaths(discovered, options);
}

export function flowPathFromEvents<Context, Event extends FlowEvent, State extends string>(
  initial: FlowSnapshot<Context, State, Event>,
  events: ReadonlyArray<Event>,
  options?: FlowPathFromEventsOptions<Context, Event, State>,
): FlowModelPath<Context, Event, State> | undefined {
  let path = createPath(initial, emptySteps);
  let current = initial;

  for (const event of events) {
    if (!canMachineTransition(current, event)) {
      return undefined;
    }

    current = transitionSnapshot(current, event).snapshot;
    path = extendPath(path, event, current);
  }

  if (options?.toState !== undefined && !options.toState(path.state)) {
    return undefined;
  }

  return path;
}

export function createFlowPathUtilities<Context, Event extends FlowEvent, State extends string>(
  initial: FlowSnapshot<Context, State, Event>,
) {
  return Object.freeze({
    shortestPaths: (options: FlowModelTraversalOptions<Context, Event, State> = {}) =>
      shortestFlowPaths(options.fromState ?? initial, options),
    simplePaths: (options: FlowModelTraversalOptions<Context, Event, State> = {}) =>
      simpleFlowPaths(options.fromState ?? initial, options),
    pathFromEvents: (
      events: ReadonlyArray<Event>,
      options?: FlowPathFromEventsOptions<Context, Event, State>,
    ) => flowPathFromEvents(options?.fromState ?? initial, events, options),
  });
}
