import { Option, Predicate, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { Machine } from "../../machine/machine.js";
import type { MachineAction, MachineActivity, MachineDefinition } from "../../machine/grammar.js";
import type { OperationKey } from "../../operation/key.js";
import type { ActorSnapshot } from "../runtime.js";
import type { ContextNotification } from "../context/context-coordinator.js";
import type { ActorOperationReaders, PreparedOperationOccurrence } from "./actor-activities.js";
import {
  checkedActorSuccessor,
  prepareEventCut,
  withPermitRollback,
  type ActorStore,
} from "./actor-state.js";
import {
  preparePublishedSnapshot,
  type ActorPublication,
  type ActorSnapshotCopyPolicy,
} from "./actor-snapshot.js";
import type { OperationFact } from "./actor-operation-work.js";
import { prepareLifecycleCut } from "./lifecycle.js";

type OperationOf<D extends MachineDefinition> = D["operations"][keyof D["operations"]];

type FiniteKind = "resource-lookup" | "resource-refetch" | "transaction-commit";

type FiniteOperationPlan = { kind: FiniteKind; descriptor: string; key: OperationKey };

export type OperationLaunch<D extends MachineDefinition> = {
  plan: MachineAction<D> | MachineActivity<D>;
  continuing: boolean;
  permit: PreparedOperationOccurrence<D>;
};

export type OperationStop<D extends MachineDefinition> = {
  descriptor: OperationOf<D>;
  key: OperationKey;
  activitySlot: string;
};

export type OperationReconciliation<D extends MachineDefinition> = {
  launches: OperationLaunch<D>[];
  stops: OperationStop<D>[];
};

const operationFailure = (reason: string) =>
  Failure({
    code: "InvariantViolation",
    path: ["actor", "operation", reason],
    details: { reason },
    summary: "Actor cannot start this operation",
    help: "Use an admitted operation with an available actor runner.",
  });

// RETURN_TYPE: Narrows the admitted action batch to the finite plans that own an occurrence.
const isFinitePlan = (action: unknown): action is FiniteOperationPlan =>
  Predicate.isObject(action) &&
  (action.kind === "resource-lookup" ||
    action.kind === "resource-refetch" ||
    action.kind === "transaction-commit") &&
  typeof action.descriptor === "string" &&
  Array.isArray(action.key);

type ContinuingOperationPlan = {
  kind: "resource-subscribe" | "stream-subscribe";
  descriptor: string;
  key: OperationKey;
};

// RETURN_TYPE: The inspected activity plan keeps its descriptor and key through reconciliation.
const isContinuingPlan = (value: unknown): value is ContinuingOperationPlan =>
  Predicate.isObject(value) &&
  (value.kind === "resource-subscribe" || value.kind === "stream-subscribe") &&
  typeof value.descriptor === "string" &&
  Array.isArray(value.key);

type OperationLaunchInput<D extends MachineDefinition> = {
  machine: Machine<D>;
  // oxlint-disable-next-line anti-slop/no-readonly -- The planner owns the authored action sequence; operation preflight must not mutate it.
  actions: readonly { action: MachineAction<D> }[];
  beforeState: Option.Option<ActorSnapshot<D>["state"]>;
  afterState: ActorSnapshot<D>["state"];
  hasRunner: boolean;
  hasStore: boolean;
  resolveDescriptor(id: string): OperationOf<D> | undefined;
  prepareOccurrence(
    descriptor: OperationOf<D>,
    key: OperationKey,
    activitySlot: Option.Option<string>,
  ): Result.Result<PreparedOperationOccurrence<D>, PublicDiagnostic>;
};

type ActivityPlan<D extends MachineDefinition> = {
  slot: string;
  activity: MachineActivity<D>;
};

type ActivityPlans<D extends MachineDefinition> = ActivityPlan<D>[];

const activitiesFor = <D extends MachineDefinition>(
  machine: Machine<D>,
  state: ActorSnapshot<D>["state"],
) => {
  const pending: { key: string; ancestors: ActivityPlans<D> }[] = [{ key: "", ancestors: [] }];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) continue;
    const compiled = machine.compiled.states[current.key];

    if (compiled === undefined) continue;

    const activities = [
      ...current.ancestors,
      ...Object.entries(compiled.activities).map(([name, activity]) => ({
        slot: JSON.stringify([current.key, name]),
        activity,
      })),
    ];

    if (compiled.kind === "leaf") {
      if (Object.is(compiled.state, state)) return activities;

      continue;
    }

    for (let index = compiled.children.length - 1; index >= 0; index -= 1) {
      const child = compiled.children[index];

      if (child !== undefined) pending.push({ key: child, ancestors: activities });
    }
  }

  return [];
};

const prepareFiniteLaunches = <D extends MachineDefinition>(
  input: OperationLaunchInput<D>,
  launches: OperationLaunch<D>[],
) => {
  for (const { action } of input.actions) {
    // FLOW_STATE_ALLOW_UNKNOWN: A generic action union hides its operation arms until the admitted runtime plan is narrowed by shape.
    const candidate: unknown = action;

    if (!isFinitePlan(candidate)) continue;

    if (!input.hasRunner) {
      return Result.fail(operationFailure("missing-runner"));
    }

    const descriptor = input.resolveDescriptor(candidate.descriptor);

    if (descriptor === undefined) {
      return Result.fail(operationFailure("foreign-descriptor"));
    }

    const prepared = input.prepareOccurrence(descriptor, candidate.key, Option.none());

    if (Result.isFailure(prepared)) {
      return Result.fail(prepared.failure);
    }

    launches.push({ plan: action, continuing: false, permit: prepared.success });
  }

  return Result.succeed(undefined);
};

const prepareActivityStops = <D extends MachineDefinition>(
  input: OperationLaunchInput<D>,
  before: ActivityPlans<D>,
  after: ActivityPlans<D>,
  stops: OperationStop<D>[],
) => {
  const afterBySlot = new Map(after.map((entry) => [entry.slot, entry]));

  for (const previous of before) {
    if (Object.is(previous.activity, afterBySlot.get(previous.slot)?.activity)) continue;
    // FLOW_STATE_ALLOW_UNKNOWN: The compiled activity remains untrusted at the reflected service-name boundary until its constructed plan shape is inspected.
    const planValue: unknown = previous.activity;

    if (!isContinuingPlan(planValue)) {
      return Result.fail(operationFailure("invalid-activity"));
    }

    const descriptor = input.resolveDescriptor(planValue.descriptor);

    if (descriptor === undefined) {
      return Result.fail(operationFailure("foreign-activity"));
    }

    stops.push({ descriptor, key: planValue.key, activitySlot: previous.slot });
  }

  return Result.succeed(undefined);
};

const prepareActivityLaunches = <D extends MachineDefinition>(
  input: OperationLaunchInput<D>,
  before: ActivityPlans<D>,
  after: ActivityPlans<D>,
  launches: OperationLaunch<D>[],
) => {
  const beforeBySlot = new Map(before.map((entry) => [entry.slot, entry]));

  for (const entry of after) {
    if (Object.is(entry.activity, beforeBySlot.get(entry.slot)?.activity)) continue;
    // FLOW_STATE_ALLOW_UNKNOWN: The admitted activity is inspected before its descriptor/key is used for an occurrence permit.
    const planValue: unknown = entry.activity;

    if (!isContinuingPlan(planValue) || !input.hasRunner || !input.hasStore) {
      return Result.fail(operationFailure("invalid-activity-runner"));
    }

    const descriptor = input.resolveDescriptor(planValue.descriptor);

    if (descriptor === undefined) {
      return Result.fail(operationFailure("foreign-activity"));
    }

    const prepared = input.prepareOccurrence(descriptor, planValue.key, Option.some(entry.slot));

    if (Result.isFailure(prepared)) return Result.fail(prepared.failure);

    launches.push({ plan: entry.activity, continuing: true, permit: prepared.success });
  }

  return Result.succeed(undefined);
};

/** Reserve each finite occurrence before a store, evidence, or actor cut can commit. */
export const prepareOperationLaunches = <D extends MachineDefinition>(
  input: OperationLaunchInput<D>,
) =>
  withPermitRollback((register) => {
    const trackedInput = {
      ...input,
      prepareOccurrence: (
        descriptor: OperationOf<D>,
        key: OperationKey,
        activitySlot: Option.Option<string>,
      ) => {
        const prepared = input.prepareOccurrence(descriptor, key, activitySlot);

        if (Result.isSuccess(prepared)) register(() => prepared.success.cancel());

        return prepared;
      },
    };

    const launches: OperationLaunch<D>[] = [];
    const stops: OperationStop<D>[] = [];
    const finite = prepareFiniteLaunches(trackedInput, launches);

    if (Result.isFailure(finite)) return Result.fail(finite.failure);

    const before = Option.isSome(input.beforeState)
      ? activitiesFor(input.machine, input.beforeState.value)
      : [];

    const after = activitiesFor(input.machine, input.afterState);
    const stopped = prepareActivityStops(trackedInput, before, after, stops);

    if (Result.isFailure(stopped)) return Result.fail(stopped.failure);

    const started = prepareActivityLaunches(trackedInput, before, after, launches);

    return Result.isFailure(started)
      ? Result.fail(started.failure)
      : Result.succeed({ launches, stops });
  });

/** A rejected preflight leaves no new live cursor behind. */
/** Couple operation occurrence permits to the event's complete fallible publication preflight. */
export const prepareActorEventOperationCut = <D extends MachineDefinition>(
  input: Parameters<typeof prepareEventCut<D>>[0] & {
    hasRunner: boolean;
    resolveDescriptor(id: string): OperationOf<D> | undefined;
    prepareOccurrence(
      descriptor: OperationOf<D>,
      key: OperationKey,
      activitySlot: Option.Option<string>,
    ): Result.Result<PreparedOperationOccurrence<D>, PublicDiagnostic>;
  },
) =>
  withPermitRollback((register) => {
    const work = prepareOperationLaunches({
      machine: input.machine,
      actions: input.plan.actions,
      beforeState: Option.some(input.publication.snapshot.state),
      afterState: input.plan.candidate.state,
      hasRunner: input.hasRunner,
      hasStore: Option.isSome(input.store),
      resolveDescriptor: (id) => input.resolveDescriptor(id),
      prepareOccurrence: (descriptor, key, activitySlot) =>
        input.prepareOccurrence(descriptor, key, activitySlot),
    });

    if (Result.isFailure(work)) return Result.fail(work.failure);

    for (const launch of work.success.launches) register(() => launch.permit.cancel());
    const prepared = prepareEventCut(input);

    if (Result.isFailure(prepared)) return Result.fail(prepared.failure);

    return Result.succeed({ ...prepared.success, work: work.success });
  });

/** Prepare fresh or resumed state activities with the lifecycle permit before work starts. */
export const prepareActorLifecycleOperationCut = <D extends MachineDefinition>(
  input: Parameters<typeof prepareLifecycleCut<D>>[0] & {
    machine: Machine<D>;
    hasRunner: boolean;
    hasStore: boolean;
    resolveDescriptor(id: string): OperationOf<D> | undefined;
    prepareOccurrence(
      descriptor: OperationOf<D>,
      key: OperationKey,
      activitySlot: Option.Option<string>,
    ): Result.Result<PreparedOperationOccurrence<D>, PublicDiagnostic>;
    cancelNotification(notification: Option.Option<ContextNotification>): void;
  },
) =>
  withPermitRollback((register) => {
    const lifecycle = prepareLifecycleCut(input, register);

    if (Result.isFailure(lifecycle)) return Result.fail(lifecycle.failure);

    if (Option.isSome(lifecycle.success.notification))
      register(() => input.cancelNotification(lifecycle.success.notification));

    const work =
      input.command.to === "active"
        ? prepareOperationLaunches({
            machine: input.machine,
            actions: [],
            beforeState: Option.none(),
            afterState: input.publication.snapshot.state,
            hasRunner: input.hasRunner,
            hasStore: input.hasStore,
            resolveDescriptor: (id) => input.resolveDescriptor(id),
            prepareOccurrence: (descriptor, key, activitySlot) =>
              input.prepareOccurrence(descriptor, key, activitySlot),
          })
        : Result.succeed<OperationReconciliation<D>>({ launches: [], stops: [] });

    if (Result.isFailure(work)) return Result.fail(work.failure);

    return Result.succeed({ lifecycle: lifecycle.success, work: work.success });
  });

/** Preflight one passive outcome cut; the engine alone commits its store and publication. */
export const prepareOperationCut = <D extends MachineDefinition>(input: {
  machine: Machine<D>;
  copyPolicy: ActorSnapshotCopyPolicy;
  publication: ActorPublication<D>;
  fact: OperationFact<D>;
  store: Option.Option<ActorStore<D>>;
  captureReaders(readCut: ReturnType<ActorStore<D>["captureReadCut"]>): ActorOperationReaders<D>;
  prepareNotification(
    snapshot: ActorSnapshot<D>,
  ): Result.Result<Option.Option<ContextNotification>, PublicDiagnostic>;
}) =>
  withPermitRollback((register) => {
    if (Option.isNone(input.store)) return Result.fail(operationFailure("missing-store"));

    const prepared = input.store.value.prepareProjection(input.fact);

    if (Result.isFailure(prepared)) return Result.fail(prepared.failure);
    register(() => prepared.success.cancel());

    const revision = checkedActorSuccessor(input.publication.snapshot.revision, "revision");

    if (Result.isFailure(revision)) return Result.fail(revision.failure);

    const snapshot = preparePublishedSnapshot(
      {
        ...input.publication.snapshot,
        O: input.captureReaders(prepared.success.readCut),
        observedStoreRevision: prepared.success.revision,
        revision: revision.success,
      },
      input.copyPolicy,
    );

    if (Result.isFailure(snapshot)) return Result.fail(snapshot.failure);

    const notification = input.prepareNotification(snapshot.success);

    if (Result.isFailure(notification)) return Result.fail(notification.failure);

    return Result.succeed({
      permit: prepared.success,
      snapshot: snapshot.success,
      notification: notification.success,
    });
  });

type EventOperationInput<D extends MachineDefinition> = Parameters<
  typeof prepareActorEventOperationCut<D>
>[0];

type LifecycleOperationInput<D extends MachineDefinition> = Parameters<
  typeof prepareActorLifecycleOperationCut<D>
>[0];

/** Fix immutable operation preflight capabilities once; every cut still receives its current publication. */
export const makeActorOperationCut = <D extends MachineDefinition>(
  fixed: Pick<
    EventOperationInput<D>,
    | "machine"
    | "copyPolicy"
    | "store"
    | "credit"
    | "identity"
    | "provenance"
    | "evidence"
    | "captureReaders"
    | "prepareNotification"
    | "hasRunner"
    | "resolveDescriptor"
    | "prepareOccurrence"
  > &
    Pick<LifecycleOperationInput<D>, "cancelNotification" | "evidence">,
) => ({
  prepareEvent: (
    publication: ActorPublication<D>,
    plan: EventOperationInput<D>["plan"],
    event: EventOperationInput<D>["event"],
  ) => prepareActorEventOperationCut({ ...fixed, publication, plan, event }),
  prepareLifecycle: (
    publication: ActorPublication<D>,
    command: LifecycleOperationInput<D>["command"],
    mayResume: boolean,
  ) =>
    prepareActorLifecycleOperationCut({
      ...fixed,
      publication,
      command,
      mayResume,
      hasStore: Option.isSome(fixed.store),
    }),
  prepareFact: (publication: ActorPublication<D>, fact: OperationFact<D>) =>
    prepareOperationCut({
      machine: fixed.machine,
      copyPolicy: fixed.copyPolicy,
      publication,
      fact,
      store: fixed.store,
      captureReaders: fixed.captureReaders,
      prepareNotification: fixed.prepareNotification,
    }),
});
