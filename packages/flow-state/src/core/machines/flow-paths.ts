import {
  actionCountsForTransition,
  applyMachineEventWithMeta,
  afterDefinitionsForState,
  canMachineTransition,
  planMachineEvent,
} from "./machine-transition.js";
import {
  annotateNewMachineEventReceipts,
  type FlowInspectionEventMetadata,
} from "../inspection/inspection-receipts.js";
import { issueFactsFromReceipts, summarizeIssue } from "../inspection/receipt-summary.js";
import {
  rejectedWhileRunningTransactionDiagnostic,
  serializeQueueCapacityExceededDiagnostic,
} from "../../shared/diagnostics.js";
import {
  serializeQueueCapacity,
  transactionConcurrencyKey,
} from "../orchestrator/orchestrator-transaction-concurrency.js";
import { timerScheduleReceiptFacts } from "../orchestrator/stream-timer-inspection-facts.js";
import { transactionPreviewReceiptFacts } from "../orchestrator/transaction-inspection-facts.js";
import { createDelayedWorkPlan } from "../scheduling/delayed-work.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import {
  resolveTransactionParams,
  resolveTransactionPreviewPatches,
} from "../transactions/transaction-callbacks.js";
import type {
  FlowEvent,
  FlowIssue,
  FlowModelPath,
  FlowModelStep,
  FlowModelTraversalOptions,
  FlowReceipt,
  FlowTransactionReceipt,
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
  const issues = derivePathIssues(state.receipts);
  const path = Object.freeze({
    state,
    steps,
    issues,
    issueSummary: Object.freeze(
      issues.map((issue) =>
        summarizeIssue(issue, {
          receipts: state.receipts,
        }),
      ),
    ),
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
  const correlatedState = annotateNewMachineEventReceipts(
    state,
    path.state.receipts.length,
    createModelEventMetadata(state.machine.id, path.steps.length + 1),
  );
  return createPath(
    correlatedState,
    Object.freeze([
      ...path.steps,
      Object.freeze({
        event,
        state: correlatedState,
      }),
    ]),
  );
}

type RejectedTransactionReceipt = Extract<
  FlowTransactionReceipt,
  Readonly<{ readonly type: "transaction:reject" }>
>;

function isRejectedTransactionReceipt(receipt: FlowReceipt): receipt is RejectedTransactionReceipt {
  return receipt.type === "transaction:reject";
}

function createModelEventMetadata(
  machineId: string,
  eventIndex: number,
): FlowInspectionEventMetadata {
  return Object.freeze({
    targetActorId: machineId,
    correlationId: `${machineId}:event:${eventIndex}`,
  });
}

function issueFromRejectedTransactionReceipt(receipt: RejectedTransactionReceipt): FlowIssue {
  const facts = issueFactsFromReceipts(receipt.id, {
    ...(receipt.correlationId === undefined ? {} : { correlationId: receipt.correlationId }),
    parentState: receipt.parentState,
    receipts: [receipt],
  });

  if (typeof receipt.queuedAttemptCount === "number" && typeof receipt.queueCapacity === "number") {
    return Object.freeze({
      kind: "failure" as const,
      source: "transaction" as const,
      id: receipt.id,
      error: serializeQueueCapacityExceededDiagnostic({
        transactionId: receipt.id,
        queueKey: receipt.queueKey,
        parentState: receipt.parentState,
        activeAttemptCount: receipt.activeAttemptCount,
        queuedAttemptCount: receipt.queuedAttemptCount,
        queueCapacity: receipt.queueCapacity,
      }),
      facts,
    });
  }

  return Object.freeze({
    kind: "failure" as const,
    source: "transaction" as const,
    id: receipt.id,
    error: rejectedWhileRunningTransactionDiagnostic({
      transactionId: receipt.id,
      concurrency: "reject-while-running",
      parentState: receipt.parentState,
      activeAttemptCount: receipt.activeAttemptCount,
    }),
    facts,
  });
}

function derivePathIssues(receipts: ReadonlyArray<FlowReceipt>): ReadonlyArray<FlowIssue> {
  const issues = new Map<string, FlowIssue>();

  for (const receipt of receipts) {
    if (!isRejectedTransactionReceipt(receipt)) {
      continue;
    }

    const issue = issueFromRejectedTransactionReceipt(receipt);
    issues.set(`${issue.source}:${issue.id}`, issue);
  }

  return Object.freeze(Array.from(issues.values()));
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

type TransactionStartTrigger = "event" | "state";

function applyTransactionStartEffects<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  definition: UnknownFlowTransactionDefinition<Event>,
  options: Readonly<{
    readonly event?: Event;
    readonly trigger: TransactionStartTrigger;
  }>,
): FlowSnapshot<Context, State, Event> {
  const params = resolveTransactionParams(definition, {
    ...invokeArgsForSnapshot(snapshot),
    event: options.event,
  });

  if (params === null) {
    return snapshot;
  }

  const queueKey = transactionConcurrencyKey(definition);
  const activeAttemptCount = activeTransactionCountForQueueKey(snapshot, queueKey);
  const queuedAttemptCount = queuedTransactionCountForQueueKey(snapshot, queueKey);
  const queueCapacity = serializeQueueCapacity(definition);
  if (
    definition.config.concurrency === "serialize" &&
    activeAttemptCount > 0 &&
    queuedAttemptCount < queueCapacity
  ) {
    return Object.freeze<FlowSnapshot<Context, State, Event>>({
      ...snapshot,
      receipts: Object.freeze([
        ...snapshot.receipts,
        Object.freeze({
          type: "transaction:queue" as const,
          id: definition.id,
          queueKey,
          overlapCause: "active-attempt" as const,
          parentState: snapshot.value,
        }),
      ]),
    });
  }
  if (
    definition.config.concurrency === "serialize" &&
    activeAttemptCount > 0 &&
    queuedAttemptCount >= queueCapacity
  ) {
    return Object.freeze<FlowSnapshot<Context, State, Event>>({
      ...snapshot,
      receipts: Object.freeze([
        ...snapshot.receipts,
        Object.freeze({
          type: "transaction:reject" as const,
          id: definition.id,
          queueKey,
          overlapCause: "active-attempt" as const,
          activeAttemptCount,
          queuedAttemptCount,
          queueCapacity,
          parentState: snapshot.value,
        }),
      ]),
    });
  }
  if (
    activeAttemptCount > 0 &&
    definition.config.concurrency !== "allow" &&
    definition.config.concurrency !== "cancel-previous" &&
    definition.config.concurrency !== "serialize"
  ) {
    return Object.freeze<FlowSnapshot<Context, State, Event>>({
      ...snapshot,
      receipts: Object.freeze([
        ...snapshot.receipts,
        Object.freeze({
          type: "transaction:reject" as const,
          id: definition.id,
          queueKey,
          overlapCause: "reject-while-running" as const,
          activeAttemptCount,
          parentState: snapshot.value,
        }),
      ]),
    });
  }

  const generation = nextTransactionGeneration(snapshot, definition.id);
  const previewPatches = resolveTransactionPreviewPatches(definition, params);
  let nextResources = snapshot.resources;
  let nextReceipts = Object.freeze([
    ...snapshot.receipts,
    Object.freeze({
      type: "transaction:start" as const,
      id: definition.id,
      generation,
      trigger: options.trigger,
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
        id: definition.id,
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
      [definition.id]: {
        id: definition.id,
        status: "pending",
      },
    },
    receipts: nextReceipts,
  });
}

function applyEventOwnedSubmitEffects<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  submit: UnknownFlowTransactionDefinition<Event>,
): FlowSnapshot<Context, State, Event> {
  return applyTransactionStartEffects(snapshot, submit, {
    event,
    trigger: "event",
  });
}

function applyStateOwnedTransactionEffects<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): FlowSnapshot<Context, State, Event> {
  const configured = snapshot.machine.config.states[snapshot.value]?.invoke;
  if (configured === undefined) {
    return snapshot;
  }

  const invokes = Array.isArray(configured) ? configured : [configured];
  let next = snapshot;
  for (const invoke of invokes) {
    if (invoke.kind !== "run") {
      continue;
    }

    next = applyTransactionStartEffects(next, invoke.transaction, {
      trigger: "state",
    });
  }

  return next;
}

function applyStateOwnedAfterEffects<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): FlowSnapshot<Context, State, Event> {
  const definitions = afterDefinitionsForState(snapshot);
  if (definitions.length === 0) {
    return snapshot;
  }

  let next = snapshot;
  for (const definition of definitions) {
    const plan = createDelayedWorkPlan(definition.config.delay, () => 0);
    const generation = (next.timers[definition.id]?.generation ?? 0) + 1;
    next = Object.freeze<FlowSnapshot<Context, State, Event>>({
      ...next,
      timers: {
        ...next.timers,
        [definition.id]: {
          id: definition.id,
          status: "scheduled",
          generation,
          parentState: next.value,
          startedAt: plan.startedAt,
          dueAt: plan.dueAt,
        },
      },
      receipts: Object.freeze([
        ...next.receipts,
        Object.freeze({
          type: "timer:start" as const,
          id: definition.id,
          generation,
          parentState: next.value,
          ...timerScheduleReceiptFacts(plan.startedAt, plan.dueAt, false),
        }),
      ]),
    });
  }

  return next;
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
  const reconciledSnapshot =
    snapshot.value === applied.snapshot.value && !applied.reentered
      ? applied.snapshot
      : applyStateOwnedAfterEffects(applyStateOwnedTransactionEffects(applied.snapshot));
  const nextSnapshot = (
    plan.transition.submit === undefined
      ? reconciledSnapshot
      : applyEventOwnedSubmitEffects(reconciledSnapshot, event, plan.transition.submit)
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
