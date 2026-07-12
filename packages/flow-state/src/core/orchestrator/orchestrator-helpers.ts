import { afterDefinitionsForState } from "../machines/machine-transition.js";
import type {
  FlowActor,
  FlowActorStartOptions,
  FlowActorSnapshotTree,
  FlowAfterDefinition,
  FlowChildDefinition,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowInvalidationTarget,
  FlowInvokeDescriptor,
  FlowMachine,
  FlowReceipt,
  FlowResourceRef,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { latestIssue } from "./orchestrator-issues.js";

export type OrchestratorActorHandle = Readonly<{
  readonly id: string;
  readonly machine: FlowMachine;
  readonly getSnapshot: () => FlowActorSnapshotTree;
  readonly snapshot: () => FlowActorSnapshotTree;
  readonly issues: () => ReadonlyArray<FlowIssue>;
  readonly dispose: () => Promise<void>;
  readonly flush: () => Promise<void>;
}>;

type KeepAliveActorCandidate = Readonly<{
  readonly machine: FlowMachine;
}>;

type ActorForMachine<Machine extends FlowMachine> = FlowActor<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
>;

type AnyFlowSnapshot = FlowActorSnapshotTree;

type SnapshotForMachine<Machine extends FlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type FlowQueryInvoke =
  | Readonly<{ readonly kind: "ensure"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "refresh"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "observe"; readonly ref: FlowResourceRef }>;
type FlowResourceCommandInvoke =
  | Readonly<{ readonly kind: "patch"; readonly ref: FlowResourceRef; readonly patch: unknown }>
  | Readonly<{ readonly kind: "invalidate"; readonly target: FlowInvalidationTarget }>;
type AnyFlowStreamDefinition = Extract<FlowInvokeDescriptor, { readonly kind: "stream" }>;
type AnyFlowTransactionInvoke = Extract<FlowInvokeDescriptor, { readonly kind: "run" }>;

export function appendNewReceipts(
  previous: ReadonlyArray<FlowReceipt>,
  next: ReadonlyArray<FlowReceipt>,
  appendTrace?: (receipt: FlowReceipt) => void,
): void {
  if (appendTrace === undefined || next.length <= previous.length) {
    return;
  }

  for (const receipt of next.slice(previous.length)) {
    appendTrace(receipt);
  }
}

export function canReuseKeepAliveActor<Machine extends FlowMachine>(
  actor: KeepAliveActorCandidate | undefined,
  machine: Machine,
  options?: FlowActorStartOptions<Machine>,
): actor is ActorForMachine<Machine> {
  return (
    actor !== undefined &&
    options?.snapshot === undefined &&
    options?.policy === "keep-alive" &&
    actor.machine === machine
  );
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

export function invokeArgsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): Readonly<{
  readonly context: Context;
  readonly value: State;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly resources: FlowSnapshot<Context, State, Event>["resources"];
  readonly transactions: FlowSnapshot<Context, State, Event>["transactions"];
  readonly streams: FlowSnapshot<Context, State, Event>["streams"];
  readonly timers: FlowSnapshot<Context, State, Event>["timers"];
  readonly children: FlowSnapshot<Context, State, Event>["children"];
  readonly receipts: FlowSnapshot<Context, State, Event>["receipts"];
}> {
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

export function childInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowChildDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowChildDefinition => invoke.kind === "child",
  );
}

export function queryInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowQueryInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowQueryInvoke =>
      invoke.kind === "ensure" || invoke.kind === "refresh" || invoke.kind === "observe",
  );
}

export function streamInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<AnyFlowStreamDefinition> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyFlowStreamDefinition => invoke.kind === "stream",
  );
}

export function afterInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowAfterDefinition<State, Context, Event>> {
  if (value === snapshot.value) {
    return afterDefinitionsForState(snapshot);
  }

  return afterDefinitionsForState(
    Object.freeze({
      ...snapshot,
      value,
    }),
  );
}

export function transactionInvokesForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<AnyFlowTransactionInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is AnyFlowTransactionInvoke => invoke.kind === "run",
  );
}

export function resourceCommandInvokesForState<
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  snapshot: FlowSnapshot<Context, State, Event>,
  value: State = snapshot.value,
): ReadonlyArray<FlowResourceCommandInvoke> {
  return normalizeInvokes(snapshot.machine.config.states[value]?.invoke).filter(
    (invoke): invoke is FlowResourceCommandInvoke =>
      invoke.kind === "patch" || invoke.kind === "invalidate",
  );
}

export function childSnapshotForDefinition<State extends string>(
  definition: FlowChildDefinition,
  parentState: State,
  actorId: string,
  state: string = definition.config.machine.config.initial,
  status: FlowChildSnapshot["status"] = "active",
  snapshot?: AnyFlowSnapshot,
): FlowChildSnapshot {
  const base = {
    id: definition.id,
    actorId,
    status,
    state,
    ...(snapshot === undefined ? {} : { snapshot: toActorSnapshotTree(snapshot) }),
    parentState,
  };

  return Object.freeze(
    definition.config.supervision === undefined
      ? base
      : {
          ...base,
          supervision: definition.config.supervision,
        },
  );
}

export function childActorId(parentActorId: string, childId: string): string {
  return `${parentActorId}/${childId}`;
}

export function toActorSnapshotTree(snapshot: AnyFlowSnapshot): FlowActorSnapshotTree {
  return Object.freeze({
    value: snapshot.value,
    context: snapshot.context,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
  });
}

export function restoreActorSnapshotTree<Machine extends FlowMachine>(
  machine: Machine,
  snapshot: FlowActorSnapshotTree,
): SnapshotForMachine<Machine> {
  return Object.freeze({
    ...machine.getInitialSnapshot(),
    value: snapshot.value,
    context: snapshot.context,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
  }) as SnapshotForMachine<Machine>;
}

export function materializeActorStartSnapshot<Machine extends FlowMachine>(
  machine: Machine,
  snapshot: FlowActorStartOptions<Machine>["snapshot"],
): SnapshotForMachine<Machine> | undefined {
  if (snapshot === undefined) {
    return undefined;
  }

  return "machine" in snapshot
    ? (snapshot as SnapshotForMachine<Machine>)
    : restoreActorSnapshotTree(machine, snapshot);
}

export function restoreChildActorSnapshot<ChildMachine extends FlowMachine>(
  definition: FlowChildDefinition<ChildMachine>,
  child: FlowChildSnapshot,
): SnapshotForMachine<ChildMachine> | undefined {
  if (child.snapshot !== undefined) {
    return restoreActorSnapshotTree(definition.config.machine, child.snapshot);
  }

  if (child.state === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...definition.config.machine.getInitialSnapshot(),
    value: child.state,
  }) as SnapshotForMachine<ChildMachine>;
}

export function isFinalMachineState<Machine extends FlowMachine>(
  machine: Machine,
  state: string,
): boolean {
  const configuredState = machine.config.states[state as InferMachineState<Machine>];
  return configuredState?.type === "final";
}

export function childStatusForActor(actor: OrchestratorActorHandle): FlowChildSnapshot["status"] {
  const issues = actor.issues();
  const issue = latestIssue(issues);
  if (issue === undefined) {
    return isFinalMachineState(actor.machine, String(actor.getSnapshot().value))
      ? "success"
      : "active";
  }

  if (issue.kind === "interrupt") {
    return "interrupt";
  }

  return "failure";
}
