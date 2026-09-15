// oxlint-disable-next-line anti-slop/no-large-production-file -- turn planning owns one bounded pure boundary; splitting it would scatter the validation and stage-order contract.
import { Predicate, Result } from "effect";

import type { ContextOf, EventOf, MemoryOf, OperationsOf } from "../definition/domain.js";
import { Defect, Diagnostic, Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type {
  CompiledTransition,
  CompiledState,
  MachineAction,
  MachineDefinition,
  MachineInput,
} from "../machine/grammar.js";
import type { Machine } from "../machine/machine.js";
import { isConstructedOperationPlan } from "../operation/operation.js";
import type { OperationDeclaration } from "../operation/operation.js";
import {
  canonicalizeKey,
  equalCanonicalKey,
  type OperationKey,
  type CanonicalKeyValue,
} from "../operation/key.js";
import type { ActorFence } from "./actor-admission.js";
import type { ActorLifecycle, ActorSnapshot, OperationProjection } from "./actor-engine.js";

/** An admitted nominal event is the only transition-planning input. */
export type ActorEvent<DefinitionValue extends MachineDefinition> = EventOf<DefinitionValue>;

export type FiniteOperationOutcome<Value = unknown> =
  | { _tag: "success"; value: Value }
  | { _tag: "failure"; error: PublicDiagnostic }
  | { _tag: "defect"; exit: unknown }
  | { _tag: "interrupt"; exit: unknown };

export type OperationOccurrenceFence = {
  actor: ActorFence;
  descriptor: OperationDeclaration;
  key: OperationKey;
  ordinal: number;
};

export type OperationCompletionFact = {
  fence: OperationOccurrenceFence;
  outcome: FiniteOperationOutcome;
};

export type StreamProjectionFact<StreamValue = unknown> = {
  fence: OperationOccurrenceFence;
  value: StreamValue;
};

export type ProviderRevisionFence = {
  fence: ActorFence;
  slot: string;
  revision: number;
  value: unknown;
};

/** One complete consumer context cut, retaining every slot's provider truth. */
export type ContextProjectionCarrier = {
  providers: ProviderRevisionFence[];
  issueOnly: boolean;
  selectorDefects: PublicDiagnostic[];
};

type OperationOf<DefinitionValue extends MachineDefinition> =
  OperationsOf<DefinitionValue>[keyof OperationsOf<DefinitionValue>];

type OperationDescriptorOf<DefinitionValue extends MachineDefinition> = Extract<
  OperationOf<DefinitionValue>,
  OperationDeclaration
>;

type OperationKeyOfDescriptor<Descriptor extends OperationDeclaration> = Descriptor extends {
  key: (...args: never[]) => infer Key;
}
  ? Key extends OperationKey
    ? Key
    : never
  : never;

export type StoreChangeReference<
  DefinitionValue extends MachineDefinition,
  Descriptor extends OperationDescriptorOf<DefinitionValue> =
    OperationDescriptorOf<DefinitionValue>,
> = {
  descriptor: Descriptor;
  key: CanonicalKeyValue<OperationKeyOfDescriptor<Descriptor>>;
};

export type StoreRevisionFact<
  DefinitionValue extends MachineDefinition = MachineDefinition,
  Descriptor extends OperationDescriptorOf<DefinitionValue> =
    OperationDescriptorOf<DefinitionValue>,
> = {
  fence: ActorFence;
  revision: number;
  changed: StoreChangeReference<DefinitionValue, Descriptor>[];
};

export type ProjectionFact<StreamValue = unknown> =
  | {
      _tag: "timer-projection";
      fence: ActorFence;
      name: string;
      startedAt: number;
      dueAt: number;
    }
  | {
      _tag: "completion-projection";
      completion: OperationCompletionFact;
    }
  | {
      _tag: "stream-projection";
      fact: StreamProjectionFact<StreamValue>;
    }
  | {
      _tag: "context-projection";
      provider: ProviderRevisionFence;
      /** Aggregate facts mirror this carrier in provider.value for evidence ownership. */
      projection?: ContextProjectionCarrier;
    }
  | {
      _tag: "store-projection";
      fact: StoreRevisionFact;
    }
  | {
      _tag: "lifecycle-projection";
      fence: ActorFence;
      lifecycle: ActorLifecycle;
    };

export type TurnCause<DefinitionValue extends MachineDefinition, StreamValue = unknown> =
  | { _tag: "event"; event: ActorEvent<DefinitionValue> }
  | { _tag: "projection"; fact: ProjectionFact<StreamValue> };

export type EventTurnInput<DefinitionValue extends MachineDefinition> = {
  _tag: "event";
  machine: Machine<DefinitionValue>;
  snapshot: ActorSnapshot<DefinitionValue>;
  event: ActorEvent<DefinitionValue>;
  fence: ActorFence;
};

export type ProjectionTurnInput<
  DefinitionValue extends MachineDefinition,
  StreamValue = unknown,
> = {
  _tag: "projection";
  snapshot: ActorSnapshot<DefinitionValue>;
  fact: ProjectionFact<StreamValue>;
  fence: ActorFence;
};

export type TurnInput<DefinitionValue extends MachineDefinition, StreamValue = unknown> =
  | EventTurnInput<DefinitionValue>
  | ProjectionTurnInput<DefinitionValue, StreamValue>;

export type FiniteActionIntent<DefinitionValue extends MachineDefinition> = {
  ordinal: number;
  action: MachineAction<DefinitionValue>;
};

export type EventTurnPlan<DefinitionValue extends MachineDefinition> = {
  _tag: "event-plan";
  cause: Extract<TurnCause<DefinitionValue>, { _tag: "event" }>;
  fence: ActorFence;
  before: ActorSnapshot<DefinitionValue>;
  candidate: ActorSnapshot<DefinitionValue>;
  actions: FiniteActionIntent<DefinitionValue>[];
  mappedEvents: ActorEvent<DefinitionValue>[];
};

export type NoopTurnPlan<DefinitionValue extends MachineDefinition> = {
  _tag: "noop";
  fence: ActorFence;
  before: ActorSnapshot<DefinitionValue>;
  cause: TurnCause<DefinitionValue>;
};

export type ProjectionTurnPlan<DefinitionValue extends MachineDefinition, StreamValue = unknown> = {
  _tag: "projection-plan";
  cause: Extract<TurnCause<DefinitionValue, StreamValue>, { _tag: "projection" }>;
  fence: ActorFence;
  before: ActorSnapshot<DefinitionValue>;
  candidate: ActorSnapshot<DefinitionValue>;
};

export type TurnPlan<DefinitionValue extends MachineDefinition> =
  | EventTurnPlan<DefinitionValue>
  | ProjectionTurnPlan<DefinitionValue>
  | NoopTurnPlan<DefinitionValue>;

const planningFailure = (
  path: (string | number)[],
  summary: string,
  details: Record<string, string | number | boolean | null> = {},
) =>
  Failure({
    code: "SemanticValidation",
    path,
    details,
    summary,
    help: "Fix the event turn before committing actor or operation state.",
  });

const callbackFailure = (cause: unknown) => (cause instanceof Diagnostic ? cause : Defect(cause));

// RETURN_TYPE: Normalizes every callback defect into the planner's public diagnostic channel.
const runCallback = <Value>(
  path: (string | number)[],
  callback: () => Value,
): Result.Result<Value, PublicDiagnostic> =>
  Result.try({ try: callback, catch: callbackFailure }).pipe(
    Result.mapError((failure) =>
      failure instanceof Diagnostic
        ? failure
        : planningFailure(path, "Planning callback failed", { issue: "callback" }),
    ),
  );

const copyMemory = <DefinitionValue extends MachineDefinition>(
  memory: MemoryOf<DefinitionValue>,
) => ({ ...memory });

// RETURN_TYPE: Preserves the complete actor snapshot shape while copying each container.
const copySnapshot = <DefinitionValue extends MachineDefinition>(
  snapshot: ActorSnapshot<DefinitionValue>,
): ActorSnapshot<DefinitionValue> => {
  const memory = copyMemory<DefinitionValue>(snapshot.memory);
  const context: ContextOf<DefinitionValue> = { ...snapshot.context };

  const operations = snapshot.operations.map((operation) => ({
    ...operation,
    key: canonicalizeKey(operation.key),
  }));

  const timers = snapshot.timers.map((timer) => ({ ...timer }));
  const issues = [...snapshot.issues];

  return { ...snapshot, memory, context, operations, timers, issues };
};

// RETURN_TYPE: Preserves the actor snapshot shape while replacing only state and memory.
const candidateSnapshot = <DefinitionValue extends MachineDefinition>(
  source: ActorSnapshot<DefinitionValue>,
  state: ActorSnapshot<DefinitionValue>["state"],
  memory: MemoryOf<DefinitionValue>,
): ActorSnapshot<DefinitionValue> => {
  const nextMemory = copyMemory<DefinitionValue>(memory);

  return copySnapshot({ ...source, state, memory: nextMemory });
};

type RuntimeRecord = {
  type?: unknown;
  kind?: unknown;
  descriptor?: unknown;
  key?: unknown;
  targets?: unknown;
  family?: unknown;
  value?: unknown;
};

// RETURN_TYPE: Narrows dynamic action and event carriers to the record boundary used below.
const isRecord = (value: unknown): value is RuntimeRecord =>
  Predicate.isObject(value) && !Array.isArray(value);

const eventNameFor = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  event: unknown,
) => {
  if (!isRecord(event) || !Predicate.isString(event.type)) return undefined;
  const type = event.type;

  for (const [name, token] of Object.entries(machine.definition.E)) {
    if (token.id === type) return name;
  }

  return undefined;
};

// RETURN_TYPE: Preserves the nominal event narrowing after definition identity matching.
const eventForDefinition = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  event: unknown,
): event is ActorEvent<DefinitionValue> => eventNameFor(machine, event) !== undefined;

/** Runtime fence used by synchronous admission before a command reaches the mailbox. */
export const isEventForMachine = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  event: unknown,
): event is ActorEvent<DefinitionValue> => eventForDefinition(machine, event);

const activeStateChain = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  state: ActorSnapshot<DefinitionValue>["state"],
) => {
  const states = machine.compiled.states;
  const root = states[""];

  if (root === undefined) return undefined;

  // RETURN_TYPE: Recursion returns the active compiled state chain or no match.
  const visit = (
    current: CompiledState<DefinitionValue>,
    chain: CompiledState<DefinitionValue>[],
  ): CompiledState<DefinitionValue>[] | undefined => {
    const next = [...chain, current];

    if (current.kind === "leaf") return current.state === state ? next : undefined;

    for (const childKey of current.children) {
      const child = states[childKey];

      if (child === undefined) continue;
      const match = visit(child, next);

      if (match !== undefined) return match;
    }

    return undefined;
  };

  return visit(root, []);
};

// RETURN_TYPE: Keeps operation lookup optional until the action family is validated.
const operationForId = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  id: unknown,
) =>
  Predicate.isString(id)
    ? Object.values(machine.definition.operations).find((operation) => operation.id === id)
    : undefined;

// RETURN_TYPE: Keeps canonical operation keys opaque while proving their array carrier.
const isArrayKey = (value: unknown): value is unknown[] => Array.isArray(value);

const validOperationPlan = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: unknown,
) => {
  if (!isConstructedOperationPlan(value)) return false;
  const kind = value.kind;
  const operation = operationForId(machine, value.descriptor);

  if (operation === undefined || !isArrayKey(value.key)) return false;

  if (kind === "resource-lookup" || kind === "resource-refetch")
    return operation.kind === "resource";

  if (kind === "transaction-commit") return operation.kind === "transaction";

  return false;
};

const validStoreAction = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: unknown,
) => {
  if (!isRecord(value)) return false;
  const kind = value.kind;

  if (kind !== "invalidate" && kind !== "clear") return false;
  const targets = value.targets;

  if (!Array.isArray(targets) || targets.length === 0) return false;

  return targets.every((target: unknown) => {
    if (!Array.isArray(target) || target.length !== 2) return false;
    const [descriptor, key] = target;

    return (
      Object.values(machine.definition.operations).some(
        (operation) => operation === descriptor && operation.kind === "resource",
      ) && isArrayKey(key)
    );
  });
};

const validCacheWriteAction = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: RuntimeRecord,
) => {
  const operation = operationForId(machine, value.descriptor);

  if (operation === undefined || !isArrayKey(value.key)) return false;

  return (
    value.family === "resource" && operation.kind === "resource" && Object.hasOwn(value, "value")
  );
};

const validCancelAction = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: RuntimeRecord,
) => {
  const operation = operationForId(machine, value.descriptor);

  if (operation === undefined || !isArrayKey(value.key)) return false;

  return (
    ((value.family === "resource" && operation.kind === "resource") ||
      (value.family === "transaction" && operation.kind === "transaction")) &&
    !Object.hasOwn(value, "value")
  );
};

const validCacheOrCancelAction = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: unknown,
) => {
  if (!isRecord(value)) return false;

  if (value.kind === "cache-write") return validCacheWriteAction(machine, value);

  if (value.kind === "cancel") return validCancelAction(machine, value);

  return false;
};

// RETURN_TYPE: Narrows only constructed finite actions accepted by this machine definition.
const validFiniteAction = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: unknown,
): value is MachineAction<DefinitionValue> =>
  validOperationPlan(machine, value) ||
  validStoreAction(machine, value) ||
  validCacheOrCancelAction(machine, value);

type ActionBatch<DefinitionValue extends MachineDefinition> = {
  actions: FiniteActionIntent<DefinitionValue>[];
  mappedEvents: ActorEvent<DefinitionValue>[];
};

// RETURN_TYPE: Exposes the complete validated action and mapped-event batch to the plan.
const materializeActionBatch = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  value: unknown,
): Result.Result<ActionBatch<DefinitionValue>, PublicDiagnostic> => {
  if (value === null || value === undefined)
    return Result.succeed({ actions: [], mappedEvents: [] });
  const values = Array.isArray(value) ? value : [value];
  const actions: FiniteActionIntent<DefinitionValue>[] = [];
  const mappedEvents: ActorEvent<DefinitionValue>[] = [];

  for (const [ordinal, item] of values.entries()) {
    if (eventForDefinition(machine, item)) {
      mappedEvents.push(item);
      continue;
    }

    if (!validFiniteAction(machine, item))
      return Result.fail(
        planningFailure(["actions", ordinal], "Finite action batch contains an invalid item", {
          issue: "invalid-action",
        }),
      );
    actions.push({ ordinal, action: item });
  }

  return Result.succeed({
    actions,
    mappedEvents,
  });
};

type RedirectAttempt<DefinitionValue extends MachineDefinition> =
  | {
      _tag: "stable";
      snapshot: ActorSnapshot<DefinitionValue>;
    }
  | {
      _tag: "redirected";
      snapshot: ActorSnapshot<DefinitionValue>;
      applied: number;
    };

// RETURN_TYPE: Keeps one redirect evaluation in the planner diagnostic channel.
const evaluateRedirect = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  current: ActorSnapshot<DefinitionValue>,
  redirect: CompiledState<DefinitionValue>["redirects"][number],
  stateIndex: number,
  redirectIndex: number,
  applied: number,
): Result.Result<RedirectAttempt<DefinitionValue> | undefined, PublicDiagnostic> => {
  const redirectResult = runCallback(["redirect", stateIndex, redirectIndex], () =>
    redirect.when({ state: current.state, memory: current.memory, snapshot: current }),
  );

  if (Result.isFailure(redirectResult)) return Result.fail(redirectResult.failure);

  if (!redirectResult.success) return Result.succeed(undefined);
  const nextApplied = applied + 1;

  if (nextApplied > 100)
    return Result.fail(
      planningFailure(["redirect"], "Redirect stabilization exceeded the finite limit", {
        issue: "microstep-limit",
      }),
    );
  const targetChain = activeStateChain(machine, redirect.target);

  if (targetChain === undefined)
    return Result.fail(
      planningFailure(
        ["redirect", stateIndex, redirectIndex, "target"],
        "Redirect target is not in the machine",
        {
          issue: "unknown-state",
        },
      ),
    );

  return Result.succeed({
    _tag: "redirected",
    snapshot: candidateSnapshot(current, redirect.target, current.memory),
    applied: nextApplied,
  });
};

// RETURN_TYPE: Preserves the complete redirect attempt result for stabilization.
const applyFirstRedirect = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  current: ActorSnapshot<DefinitionValue>,
  applied: number,
): Result.Result<RedirectAttempt<DefinitionValue>, PublicDiagnostic> => {
  const chain = activeStateChain(machine, current.state);

  if (chain === undefined)
    return Result.fail(
      planningFailure(["redirect"], "Redirect candidate has no machine state", {
        issue: "unknown-state",
      }),
    );

  for (const [stateIndex, state] of chain.entries()) {
    for (const [redirectIndex, redirect] of state.redirects.entries()) {
      const attempt = evaluateRedirect(
        machine,
        current,
        redirect,
        stateIndex,
        redirectIndex,
        applied,
      );

      if (Result.isFailure(attempt)) return Result.fail(attempt.failure);

      if (attempt.success !== undefined) return Result.succeed(attempt.success);
    }
  }

  return Result.succeed({ _tag: "stable", snapshot: current });
};

// RETURN_TYPE: Redirect stabilization preserves its actor snapshot success type across callback failures.
const stabilizeRedirects = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  initial: ActorSnapshot<DefinitionValue>,
): Result.Result<ActorSnapshot<DefinitionValue>, PublicDiagnostic> => {
  // RETURN_TYPE: The recursive helper preserves the stabilized snapshot failure channel.
  const stabilize = (
    current: ActorSnapshot<DefinitionValue>,
    applied: number,
  ): Result.Result<ActorSnapshot<DefinitionValue>, PublicDiagnostic> => {
    const attempt = applyFirstRedirect(machine, current, applied);

    if (Result.isFailure(attempt)) return Result.fail(attempt.failure);

    if (attempt.success._tag === "stable") return Result.succeed(attempt.success.snapshot);

    return stabilize(attempt.success.snapshot, attempt.success.applied);
  };

  return stabilize(initial, 0);
};

// RETURN_TYPE: Preserves one compiled state's transition lookup failure channel.
const findTransitionInState = <DefinitionValue extends MachineDefinition>(
  state: CompiledState<DefinitionValue>,
  eventName: string,
  input: MachineInput<DefinitionValue, ActorEvent<DefinitionValue>>,
  stateIndex: number,
): Result.Result<CompiledTransition<DefinitionValue> | undefined, PublicDiagnostic> => {
  const transitions = state.handlers[eventName];

  if (transitions === undefined) return Result.succeed(undefined);

  for (const [transitionIndex, transition] of transitions.entries()) {
    if (transition.guard === undefined) return Result.succeed(transition);

    const guard = runCallback(["guard", stateIndex, transitionIndex], () =>
      transition.guard!(input),
    );

    if (Result.isFailure(guard)) return Result.fail(guard.failure);

    if (guard.success) return Result.succeed(transition);
  }

  return Result.succeed(undefined);
};

// RETURN_TYPE: Preserves the compiled transition lookup failure channel.
const findTransition = <DefinitionValue extends MachineDefinition>(
  chain: CompiledState<DefinitionValue>[],
  eventName: string,
  input: MachineInput<DefinitionValue, ActorEvent<DefinitionValue>>,
): Result.Result<CompiledTransition<DefinitionValue> | undefined, PublicDiagnostic> => {
  for (let stateIndex = chain.length - 1; stateIndex >= 0; stateIndex -= 1) {
    const state = chain[stateIndex];

    if (state === undefined) continue;
    const result = findTransitionInState(state, eventName, input, stateIndex);

    if (Result.isFailure(result)) return Result.fail(result.failure);

    if (result.success !== undefined) return result;
  }

  return Result.succeed(undefined);
};

/** Builds one pure event candidate; no Effect, occurrence, external work, or commit runs here. */
// RETURN_TYPE: Public planner callers receive either a complete plan or its diagnostic.
const planEventTurn = <DefinitionValue extends MachineDefinition>(
  input: EventTurnInput<DefinitionValue>,
): Result.Result<TurnPlan<DefinitionValue>, PublicDiagnostic> => {
  const before = copySnapshot(input.snapshot);
  const cause = { _tag: "event" as const, event: input.event };
  const eventName = eventNameFor(input.machine, input.event);

  if (eventName === undefined)
    return Result.fail(
      planningFailure(["event"], "Event belongs to a different machine definition", {
        issue: "foreign-event",
      }),
    );
  const chain = activeStateChain(input.machine, before.state);

  if (chain === undefined)
    return Result.fail(
      planningFailure(["snapshot", "state"], "Snapshot state is not in the machine", {
        issue: "unknown-state",
      }),
    );

  const machineInput = {
    state: before.state,
    event: input.event,
    memory: before.memory,
    context: before.context,
    S: input.machine.definition.S,
    E: input.machine.definition.E,
    O: input.machine.definition.operations,
    snapshot: before,
  } satisfies MachineInput<DefinitionValue, ActorEvent<DefinitionValue>>;

  const transitionResult = findTransition(chain, eventName, machineInput);

  if (Result.isFailure(transitionResult)) return Result.fail(transitionResult.failure);
  const transition = transitionResult.success;

  if (transition === undefined)
    return Result.succeed({ _tag: "noop" as const, fence: input.fence, before, cause });

  const memoryResult: Result.Result<
    Partial<MemoryOf<DefinitionValue>>,
    PublicDiagnostic
  > = transition.updateMemory === undefined
    ? Result.succeed({})
    : runCallback(["updateMemory"], () => transition.updateMemory!(machineInput));

  if (Result.isFailure(memoryResult)) return Result.fail(memoryResult.failure);

  if (!isRecord(memoryResult.success))
    return Result.fail(planningFailure(["updateMemory"], "Memory update must return a record"));
  const memory = copyMemory<DefinitionValue>({ ...before.memory, ...memoryResult.success });

  const actionResult: Result.Result<unknown, PublicDiagnostic> =
    transition.actions === undefined
      ? Result.succeed(null)
      : runCallback(["actions"], () => transition.actions!(machineInput));

  if (Result.isFailure(actionResult)) return Result.fail(actionResult.failure);
  const targetChain = activeStateChain(input.machine, transition.target);

  if (targetChain === undefined)
    return Result.fail(planningFailure(["target"], "Transition target is not in the machine"));
  const candidate = candidateSnapshot(before, transition.target, memory);
  const stabilized = stabilizeRedirects(input.machine, candidate);

  if (Result.isFailure(stabilized)) return Result.fail(stabilized.failure);

  const batchAttempt = runCallback(["actions"], () =>
    materializeActionBatch(input.machine, actionResult.success),
  );

  if (Result.isFailure(batchAttempt)) return Result.fail(batchAttempt.failure);
  const batchResult = batchAttempt.success;

  if (Result.isFailure(batchResult)) return Result.fail(batchResult.failure);

  const plan = {
    _tag: "event-plan" as const,
    cause,
    fence: input.fence,
    before,
    candidate: stabilized.success,
    actions: batchResult.success.actions,
    mappedEvents: batchResult.success.mappedEvents,
  };

  return Result.succeed(plan);
};

const sameFence = (left: ActorFence, right: ActorFence) =>
  left.key === right.key &&
  left.incarnation === right.incarnation &&
  left.generation === right.generation &&
  left.leaseEpoch === right.leaseEpoch;

const projectionFence = <StreamValue>(fact: ProjectionFact<StreamValue>): ActorFence => {
  switch (fact._tag) {
    case "timer-projection":
    case "lifecycle-projection":
      return fact.fence;
    case "completion-projection":
      return fact.completion.fence.actor;
    case "stream-projection":
      return fact.fact.fence.actor;
    case "context-projection":
      return fact.provider.fence;
    case "store-projection":
      return fact.fact.fence;
  }
};

const completionStatus = (
  outcome: FiniteOperationOutcome["_tag"],
): OperationProjection["status"] => {
  switch (outcome) {
    case "success":
      return "succeeded";
    case "failure":
    case "defect":
      return "failed";
    case "interrupt":
      return "cancelled";
  }
};

const timerProjectionCandidate = <DefinitionValue extends MachineDefinition>(
  fact: Extract<ProjectionFact, { _tag: "timer-projection" }>,
  before: ActorSnapshot<DefinitionValue>,
) => {
  if (
    !Number.isSafeInteger(fact.startedAt) ||
    !Number.isSafeInteger(fact.dueAt) ||
    fact.startedAt < 0 ||
    fact.dueAt < fact.startedAt
  )
    return Result.fail(planningFailure(["projection", "timer"], "Timer projection is invalid"));
  const current = before.timers.find((timer) => timer.name === fact.name);

  if (current !== undefined && current.startedAt === fact.startedAt && current.dueAt === fact.dueAt)
    return Result.succeed(undefined);

  const timers = [
    ...before.timers.filter((timer) => timer.name !== fact.name),
    { name: fact.name, startedAt: fact.startedAt, dueAt: fact.dueAt },
  ];

  return Result.succeed(copySnapshot({ ...before, timers }));
};

const operationProjectionCandidate = <DefinitionValue extends MachineDefinition>(
  occurrence: OperationOccurrenceFence,
  status: OperationProjection["status"],
  before: ActorSnapshot<DefinitionValue>,
) => {
  if (!Number.isSafeInteger(occurrence.ordinal) || occurrence.ordinal < 1)
    return Result.fail(
      planningFailure(["projection", "operation", "ordinal"], "Operation ordinal is invalid"),
    );

  const current = before.operations.find(
    (operation) =>
      operation.descriptor === occurrence.descriptor &&
      equalCanonicalKey(operation.key, occurrence.key),
  );

  if (current?.status === status) return Result.succeed(undefined);

  const projection: OperationProjection = {
    descriptor: occurrence.descriptor,
    key: canonicalizeKey(occurrence.key),
    status,
  };

  const operations = [
    ...before.operations.filter(
      (operation) =>
        operation.descriptor !== occurrence.descriptor ||
        !equalCanonicalKey(operation.key, occurrence.key),
    ),
    projection,
  ];

  return Result.succeed(copySnapshot({ ...before, operations }));
};

const contextProjectionProviders = (
  fact: Extract<ProjectionFact, { _tag: "context-projection" }>,
) => fact.projection?.providers ?? [fact.provider];

const validateContextProjectionCarrier = <DefinitionValue extends MachineDefinition>(
  fact: Extract<ProjectionFact, { _tag: "context-projection" }>,
  before: ActorSnapshot<DefinitionValue>,
  providers: ProviderRevisionFence[],
) => {
  const carrier = fact.projection;

  if (carrier === undefined) return Result.succeed(undefined);
  const first = providers[0];

  if (
    first === undefined ||
    !sameFence(fact.provider.fence, first.fence) ||
    fact.provider.slot !== first.slot ||
    fact.provider.revision !== first.revision ||
    !Object.is(fact.provider.value, carrier)
  )
    return Result.fail(
      planningFailure(
        ["projection", "context"],
        "Aggregate context projection has inconsistent provider truth",
      ),
    );

  if (carrier.issueOnly && carrier.selectorDefects.length === 0)
    return Result.fail(
      planningFailure(
        ["projection", "context", "issues"],
        "Issue-only context projection must carry a selector defect",
      ),
    );

  if (!carrier.issueOnly && carrier.selectorDefects.length > 0)
    return Result.fail(
      planningFailure(
        ["projection", "context", "issues"],
        "Changed context projection cannot carry selector defects",
      ),
    );
  const slots = new Set(providers.map((provider) => provider.slot));

  if (slots.size !== providers.length)
    return Result.fail(
      planningFailure(
        ["projection", "context", "slots"],
        "Aggregate context projection contains a duplicate slot",
      ),
    );
  const expectedSlots = Object.keys(before.context);

  if (
    providers.length !== expectedSlots.length ||
    providers.some((provider) => !expectedSlots.includes(provider.slot))
  )
    return Result.fail(
      planningFailure(
        ["projection", "context", "slots"],
        "Aggregate context projection must contain every fixed slot",
      ),
    );

  return Result.succeed(undefined);
};

const contextProjectionCandidate = <DefinitionValue extends MachineDefinition>(
  fact: Extract<ProjectionFact, { _tag: "context-projection" }>,
  before: ActorSnapshot<DefinitionValue>,
) => {
  const carrier = fact.projection;
  const providers = contextProjectionProviders(fact);

  if (providers.length === 0)
    return Result.fail(
      planningFailure(["projection", "context"], "Aggregate context projection is empty"),
    );
  const carrierValidation = validateContextProjectionCarrier(fact, before, providers);

  if (Result.isFailure(carrierValidation)) return Result.fail(carrierValidation.failure);

  const seenSlots = new Set<string>();
  let changed = false;
  const context = { ...before.context };

  for (const provider of providers) {
    if (!Number.isSafeInteger(provider.revision) || provider.revision < 0)
      return Result.fail(
        planningFailure(["projection", "context", "revision"], "Context revision is invalid"),
      );

    if (seenSlots.has(provider.slot))
      return Result.fail(
        planningFailure(
          ["projection", "context", "slots", provider.slot],
          "Aggregate context projection contains a duplicate slot",
        ),
      );
    seenSlots.add(provider.slot);

    if (!Object.is(before.context[provider.slot], provider.value)) changed = true;
    Object.assign(context, { [provider.slot]: provider.value });
  }

  if (carrier?.issueOnly === true)
    return Result.succeed(copySnapshot({ ...before, context, issues: carrier.selectorDefects }));

  if (!changed) return Result.succeed(undefined);
  const issues = carrier === undefined ? before.issues : [];

  return Result.succeed(copySnapshot({ ...before, context, issues }));
};

const storeProjectionCandidate = <DefinitionValue extends MachineDefinition>(
  fact: Extract<ProjectionFact, { _tag: "store-projection" }>,
  before: ActorSnapshot<DefinitionValue>,
) => {
  if (!Number.isSafeInteger(fact.fact.revision) || fact.fact.revision < 0)
    return Result.fail(
      planningFailure(["projection", "store", "revision"], "Store revision is invalid"),
    );

  if (fact.fact.revision <= before.observedStoreRevision) return Result.succeed(undefined);

  return Result.succeed(copySnapshot({ ...before, observedStoreRevision: fact.fact.revision }));
};

const lifecycleProjectionCandidate = <DefinitionValue extends MachineDefinition>(
  fact: Extract<ProjectionFact, { _tag: "lifecycle-projection" }>,
  before: ActorSnapshot<DefinitionValue>,
) =>
  fact.lifecycle === before.lifecycle
    ? Result.succeed(undefined)
    : Result.succeed(copySnapshot({ ...before, lifecycle: fact.lifecycle }));

const projectionCandidate = <DefinitionValue extends MachineDefinition, StreamValue>(
  input: ProjectionTurnInput<DefinitionValue, StreamValue>,
  before: ActorSnapshot<DefinitionValue>,
) => {
  const fact = input.fact;

  if (fact._tag !== "context-projection" && !sameFence(input.fence, projectionFence(fact)))
    return Result.succeed(undefined);

  switch (fact._tag) {
    case "timer-projection":
      return timerProjectionCandidate(fact, before);
    case "completion-projection":
      return operationProjectionCandidate(
        fact.completion.fence,
        completionStatus(fact.completion.outcome._tag),
        before,
      );
    case "stream-projection":
      return operationProjectionCandidate(fact.fact.fence, "running", before);
    case "context-projection":
      return contextProjectionCandidate(fact, before);
    case "store-projection":
      return storeProjectionCandidate(fact, before);
    case "lifecycle-projection":
      return lifecycleProjectionCandidate(fact, before);
  }
};

/** Plans passive facts without evaluating transitions, guards, redirects, or actions. */
export const planProjection = <DefinitionValue extends MachineDefinition, StreamValue = unknown>(
  input: ProjectionTurnInput<DefinitionValue, StreamValue>,
): Result.Result<TurnPlan<DefinitionValue>, PublicDiagnostic> => {
  const before = copySnapshot(input.snapshot);
  const candidate = projectionCandidate(input, before);

  if (Result.isFailure(candidate)) return Result.fail(candidate.failure);
  const cause = { _tag: "projection" as const, fact: input.fact };

  if (candidate.success === undefined)
    return Result.succeed({ _tag: "noop" as const, fence: input.fence, before, cause });

  return Result.succeed({
    _tag: "projection-plan" as const,
    cause,
    fence: input.fence,
    before,
    candidate: candidate.success,
  });
};

/** Plans one event or passive projection through the single owner boundary. */
export const planTurn = <DefinitionValue extends MachineDefinition, StreamValue = unknown>(
  input: TurnInput<DefinitionValue, StreamValue>,
): Result.Result<TurnPlan<DefinitionValue>, PublicDiagnostic> =>
  input._tag === "event" ? planEventTurn(input) : planProjection(input);
