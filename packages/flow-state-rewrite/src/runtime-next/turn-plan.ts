import { Predicate, Result } from "effect";

import type { ContextOf, EventOf, MemoryOf } from "../definition/domain.js";
import { Defect, Diagnostic, Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type {
  CompiledTransition,
  CompiledState,
  MachineDefinition,
  MachineInput,
  MachineSnapshot,
} from "../machine/grammar.js";
import type { Machine } from "../machine/machine.js";
import type {
  ActorSnapshotCopyPolicy,
  ActorSnapshotStaticIdentity,
} from "./actor/actor-snapshot.js";
import {
  copyStructuralFrozen,
  copyStructuralMutable,
  readStructuralDiagnostics,
} from "./structural-copy.js";
import type { StructuralReadonlyWhenNonempty } from "./structural-copy-types.js";
import { materializeActions, validateEventEnvelope } from "./turn-plan-actions.js";
import type { EventTurnAction } from "./turn-plan-actions.js";

// Keep these owner identities exact while structurally copied data becomes readonly.
type PlannerOpaque = ActorSnapshotStaticIdentity | PublicDiagnostic;

// State and nonempty data are structural projections; empty Definition fields stay exact.
type ReadonlyWhenNonempty<Value> = StructuralReadonlyWhenNonempty<Value, PlannerOpaque>;

export type OwnedMachineSnapshot<Value extends MachineDefinition> = {
  // oxlint-disable-next-line anti-slop/no-readonly -- The Definition-exact state is fixed in every captured publication.
  readonly state: MachineSnapshot<Value>["state"];
  // oxlint-disable-next-line anti-slop/no-readonly -- Empty memory stays exact; nonempty memory is recursively readonly after owned copying.
  readonly memory: ReadonlyWhenNonempty<MemoryOf<Value>>;
  // oxlint-disable-next-line anti-slop/no-readonly -- Empty context stays exact; nonempty context is recursively readonly after owned copying.
  readonly context: ReadonlyWhenNonempty<ContextOf<Value>>;
};

export type EventTurnPlan<DefinitionValue extends MachineDefinition> =
  | {
      _tag: "noop";
      // oxlint-disable-next-line anti-slop/no-readonly -- Plans retain the exact captured cut as the authority for every callback in this turn.
      readonly before: OwnedMachineSnapshot<DefinitionValue>;
    }
  | {
      _tag: "planned";
      // oxlint-disable-next-line anti-slop/no-readonly -- Plans retain the exact captured cut as the authority for every callback in this turn.
      readonly before: OwnedMachineSnapshot<DefinitionValue>;
      // oxlint-disable-next-line anti-slop/no-readonly -- The candidate is a completed publication value; downstream code must not rewrite it.
      readonly candidate: OwnedMachineSnapshot<DefinitionValue>;
      // oxlint-disable-next-line anti-slop/no-readonly -- The staged intents are a validated batch whose authored ordinals must survive to publication.
      readonly actions: readonly EventTurnAction<DefinitionValue>[];
      // oxlint-disable-next-line anti-slop/no-readonly -- Mapped envelopes are validated causal continuations and must not be changed after planning.
      readonly mappedEvents: readonly EventOf<DefinitionValue>[];
    };

// oxlint-disable-next-line anti-slop/no-readonly -- The input value is one captured caller-owned cut; all authority fields must stay fixed while it is planned.
export type PlanEventTurnInput<DefinitionValue extends MachineDefinition> = Readonly<{
  machine: Machine<DefinitionValue>;
  before: OwnedMachineSnapshot<DefinitionValue>;
  event: EventOf<DefinitionValue>;
  copyPolicy: ActorSnapshotCopyPolicy;
}>;

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
    help: "Correct the event turn before the ActorEngine publishes it.",
  });

const runCallback = <Value>(callback: () => Value) =>
  Result.try({
    try: callback,
    catch: (cause) => (cause instanceof Diagnostic ? cause : Defect(cause)),
  });

const activeStateChain = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  state: MachineSnapshot<DefinitionValue>["state"],
) => {
  const states = machine.compiled.states;

  const root = states[""];

  if (root === undefined) return undefined;

  const path: CompiledState<DefinitionValue>[] = [];
  const frames: { state: CompiledState<DefinitionValue>; nextChild: number }[] = [];

  path.push(root);
  frames.push({ state: root, nextChild: 0 });

  while (frames.length > 0) {
    const frame = frames[frames.length - 1];

    if (frame === undefined) break;

    if (frame.state.kind === "leaf") {
      if (frame.state.state === state) return [...path];

      frames.pop();
      path.pop();
      continue;
    }

    if (frame.nextChild >= frame.state.children.length) {
      frames.pop();
      path.pop();
      continue;
    }

    const childKey = frame.state.children[frame.nextChild];

    frame.nextChild += 1;

    if (childKey === undefined) continue;
    const child = states[childKey];

    if (child === undefined) continue;

    path.push(child);
    frames.push({ state: child, nextChild: 0 });
  }

  return undefined;
};

const ownSnapshot = <DefinitionValue extends MachineDefinition>(
  snapshot: MachineSnapshot<DefinitionValue>,
  copyPolicy: ActorSnapshotCopyPolicy,
  issues: PublicDiagnostic[],
) =>
  copyStructuralFrozen<
    MachineSnapshot<DefinitionValue>,
    PlannerOpaque,
    "state",
    "memory" | "context",
    ActorSnapshotStaticIdentity
  >(snapshot, issues, copyPolicy);

const ownCallbackSnapshot = <DefinitionValue extends MachineDefinition>(
  snapshot: MachineSnapshot<DefinitionValue>,
  copyPolicy: ActorSnapshotCopyPolicy,
  issues: PublicDiagnostic[],
) => copyStructuralMutable(snapshot, "actor", issues, copyPolicy);

const findTransitionInState = <DefinitionValue extends MachineDefinition>(
  state: CompiledState<DefinitionValue>,
  name: string,
  input: () => Result.Result<MachineInput<DefinitionValue>, PublicDiagnostic>,
) => {
  const transitions = state.handlers[name];

  if (transitions === undefined) return Result.succeed(undefined);

  for (let transitionIndex = 0; transitionIndex < transitions.length; transitionIndex += 1) {
    const transition = transitions[transitionIndex];

    if (transition === undefined) continue;

    if (transition.guard === undefined) return Result.succeed(transition);

    const guardInput = input();

    if (Result.isFailure(guardInput)) return Result.fail(guardInput.failure);

    const guard = runCallback(() => transition.guard!(guardInput.success));

    if (Result.isFailure(guard)) return Result.fail(guard.failure);

    if (guard.success) return Result.succeed(transition);
  }

  return Result.succeed(undefined);
};

const findTransition = <DefinitionValue extends MachineDefinition>(
  chain: CompiledState<DefinitionValue>[],
  name: string,
  input: () => Result.Result<MachineInput<DefinitionValue>, PublicDiagnostic>,
) => {
  for (let stateIndex = chain.length - 1; stateIndex >= 0; stateIndex -= 1) {
    const state = chain[stateIndex];

    if (state === undefined) continue;

    const result = findTransitionInState(state, name, input);

    if (Result.isFailure(result)) return Result.fail(result.failure);

    if (result.success !== undefined) return result;
  }

  return Result.succeed(undefined);
};

const evaluateRedirect = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  candidate: MachineSnapshot<DefinitionValue>,
  redirect: CompiledState<DefinitionValue>["redirects"][number],
  stateIndex: number,
  redirectIndex: number,
  applied: number,
  copyPolicy: ActorSnapshotCopyPolicy,
  issues: PublicDiagnostic[],
) => {
  const view = ownCallbackSnapshot(candidate, copyPolicy, issues);

  if (Result.isFailure(view)) return Result.fail(view.failure);

  const attempt = runCallback(() =>
    redirect.when({
      state: view.success.state,
      memory: view.success.memory,
      snapshot: view.success,
    }),
  );

  if (Result.isFailure(attempt)) return Result.fail(attempt.failure);

  if (!attempt.success) return Result.succeed(undefined);

  if (applied >= 100)
    return Result.fail(
      planningFailure(["redirect"], "Redirect stabilization exceeded the finite limit", {
        issue: "microstep-limit",
      }),
    );

  if (activeStateChain(machine, redirect.target) === undefined)
    return Result.fail(
      planningFailure(
        ["redirect", stateIndex, redirectIndex, "target"],
        "Redirect target is not in the machine",
      ),
    );

  return copyStructuralMutable(
    { ...candidate, state: redirect.target },
    "actor",
    issues,
    copyPolicy,
  );
};

const applyFirstRedirect = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  candidate: MachineSnapshot<DefinitionValue>,
  applied: number,
  copyPolicy: ActorSnapshotCopyPolicy,
  issues: PublicDiagnostic[],
) => {
  const chain = activeStateChain(machine, candidate.state);

  if (chain === undefined)
    return Result.fail(planningFailure(["redirect"], "Redirect candidate has no machine state"));

  for (const [stateIndex, state] of chain.entries()) {
    for (const [redirectIndex, redirect] of state.redirects.entries()) {
      const result = evaluateRedirect(
        machine,
        candidate,
        redirect,
        stateIndex,
        redirectIndex,
        applied,
        copyPolicy,
        issues,
      );

      if (Result.isFailure(result)) return Result.fail(result.failure);

      if (result.success !== undefined) return result;
    }
  }

  return Result.succeed(undefined);
};

const stabilizeRedirects = <DefinitionValue extends MachineDefinition>(
  machine: Machine<DefinitionValue>,
  initial: MachineSnapshot<DefinitionValue>,
  copyPolicy: ActorSnapshotCopyPolicy,
  issues: PublicDiagnostic[],
) => {
  let candidate = initial;

  for (let applied = 0; applied <= 100; applied += 1) {
    const attempt = applyFirstRedirect(machine, candidate, applied, copyPolicy, issues);

    if (Result.isFailure(attempt)) return Result.fail(attempt.failure);

    if (attempt.success === undefined) return Result.succeed(candidate);
    candidate = attempt.success;
  }

  return Result.fail(
    planningFailure(["redirect"], "Redirect stabilization exceeded the finite limit"),
  );
};

const captureTurn = <DefinitionValue extends MachineDefinition>(
  input: PlanEventTurnInput<DefinitionValue>,
) => {
  const event = validateEventEnvelope(input.machine, input.event, ["event"]);

  if (Result.isFailure(event)) return Result.fail(event.failure);

  const chain = activeStateChain(input.machine, input.before.state);

  if (chain === undefined)
    return Result.fail(
      planningFailure(["snapshot", "state"], "Snapshot state is not in the machine"),
    );

  const issues = readStructuralDiagnostics(input.before, "issues");

  const working = copyStructuralMutable<
    MachineSnapshot<DefinitionValue>,
    PlannerOpaque,
    "state",
    "memory" | "context"
  >(input.before, "actor", issues, input.copyPolicy);

  if (Result.isFailure(working)) return Result.fail(working.failure);

  const before = ownSnapshot(working.success, input.copyPolicy, issues);

  if (Result.isFailure(before)) return Result.fail(before.failure);

  const admittedEvent = copyStructuralMutable(
    event.success.event,
    "actor",
    issues,
    input.copyPolicy,
  );

  if (Result.isFailure(admittedEvent)) return Result.fail(admittedEvent.failure);

  return Result.succeed({
    before: before.success,
    working: working.success,
    event: admittedEvent.success,
    issues,
    name: event.success.name,
    chain,
    copyPolicy: input.copyPolicy,
  });
};

const prepareTransition = <DefinitionValue extends MachineDefinition>(
  transition: CompiledTransition<DefinitionValue>,
  machineInput: () => Result.Result<MachineInput<DefinitionValue>, PublicDiagnostic>,
  before: MachineSnapshot<DefinitionValue>,
  copyPolicy: ActorSnapshotCopyPolicy,
  issues: PublicDiagnostic[],
) => {
  const emptyMemoryUpdate: Partial<MemoryOf<DefinitionValue>> = {};

  const memoryResult =
    transition.updateMemory === undefined
      ? Result.succeed(emptyMemoryUpdate)
      : Result.flatMap(machineInput(), (callbackInput) =>
          runCallback(() => transition.updateMemory!(callbackInput)),
        );

  if (Result.isFailure(memoryResult)) return Result.fail(memoryResult.failure);

  if (!Predicate.isObject(memoryResult.success) || Array.isArray(memoryResult.success))
    return Result.fail(planningFailure(["updateMemory"], "Memory update must return a record"));

  const update = copyStructuralMutable(memoryResult.success, "actor", issues, copyPolicy);

  if (Result.isFailure(update)) return Result.fail(update.failure);

  const candidate = copyStructuralMutable(
    {
      ...before,
      state: transition.target,
      memory: { ...before.memory, ...update.success },
    },
    "actor",
    issues,
    copyPolicy,
  );

  if (Result.isFailure(candidate)) return Result.fail(candidate.failure);

  const actionResult =
    transition.actions === undefined
      ? Result.succeed(null)
      : Result.flatMap(machineInput(), (callbackInput) =>
          runCallback(() => transition.actions!(callbackInput)),
        );

  if (Result.isFailure(actionResult)) return Result.fail(actionResult.failure);

  return Result.succeed({ candidate: candidate.success, actions: actionResult.success });
};

/** Plans one event against its captured pre-turn state without running Effects or mutating owners. */
// RETURN_TYPE: Without this result, `_tag` widened to string and broke EventTurnPlan narrowing with TS2345, TS2339, and TS7031 in actor-turn-work.ts and turn-plan-owner.test.ts.
export const planEventTurn = <DefinitionValue extends MachineDefinition>(
  input: PlanEventTurnInput<DefinitionValue>,
): Result.Result<EventTurnPlan<DefinitionValue>, PublicDiagnostic> => {
  const captured = captureTurn(input);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  const {
    before,
    working,
    event: admittedEvent,
    issues,
    name,
    chain,
    copyPolicy,
  } = captured.success;

  const machineInput = () => {
    const snapshot = ownCallbackSnapshot(working, copyPolicy, issues);

    if (Result.isFailure(snapshot)) return Result.fail(snapshot.failure);

    const event = copyStructuralMutable(admittedEvent, "actor", issues, copyPolicy);

    if (Result.isFailure(event)) return Result.fail(event.failure);

    return Result.succeed({
      state: snapshot.success.state,
      event: event.success,
      memory: snapshot.success.memory,
      context: snapshot.success.context,
      S: input.machine.definition.S,
      E: input.machine.definition.E,
      O: input.machine.definition.operations,
      snapshot: snapshot.success,
    });
  };

  const transitionResult = findTransition(chain, name, machineInput);

  if (Result.isFailure(transitionResult)) return Result.fail(transitionResult.failure);
  const transition = transitionResult.success;

  if (transition === undefined) return Result.succeed({ _tag: "noop", before });

  const prepared = prepareTransition(transition, machineInput, working, copyPolicy, issues);

  if (Result.isFailure(prepared)) return Result.fail(prepared.failure);

  if (activeStateChain(input.machine, transition.target) === undefined)
    return Result.fail(planningFailure(["target"], "Transition target is not in the machine"));

  const redirected = stabilizeRedirects(
    input.machine,
    prepared.success.candidate,
    copyPolicy,
    issues,
  );

  if (Result.isFailure(redirected)) return Result.fail(redirected.failure);

  const candidate = ownSnapshot(redirected.success, copyPolicy, issues);

  if (Result.isFailure(candidate)) return Result.fail(candidate.failure);

  const batchResult = runCallback(() =>
    materializeActions(input.machine, prepared.success.actions),
  );

  if (Result.isFailure(batchResult)) return Result.fail(batchResult.failure);

  if (Result.isFailure(batchResult.success)) return Result.fail(batchResult.success.failure);

  return Result.succeed({
    _tag: "planned",
    before,
    candidate: candidate.success,
    actions: batchResult.success.success.actions,
    mappedEvents: batchResult.success.success.mappedEvents,
  });
};
