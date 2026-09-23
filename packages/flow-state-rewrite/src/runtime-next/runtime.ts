import { Layer, type Effect, type Result, type Stream } from "effect";

import { isConstructedApp, type App } from "../app/app.js";
import type { EventOf, InputOf } from "../definition/domain.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { Machine, MachineRecordValue } from "../machine/machine.js";
import type { MachineDefinition, MachineSnapshot } from "../machine/grammar.js";
import type { OperationKey } from "../operation/key.js";
import type { OperationDeclaration } from "../operation/operation.js";
import type { ActorRef } from "../public/types.js";
import type { Implementation } from "../implementation/implementation.js";
import { implementationLayer } from "../implementation/implementation.js";
import { makeRuntimeAssembly } from "./runtime-assembly.js";

/** Safe diagnostic fields at the internal facade boundary. */
export type Diagnostic = PublicDiagnostic;

// oxlint-disable-next-line anti-slop/no-readonly -- Actor snapshots publish fixed fields so consumers cannot replace observed actor state or revisions.
export type ActorSnapshot<DefinitionValue extends MachineDefinition> = Readonly<
  MachineSnapshot<DefinitionValue> & {
    lifecycle: "prepared" | "active" | "suspended" | "disposed";
    // oxlint-disable-next-line anti-slop/no-readonly -- Snapshot collections are read-only so callers cannot edit the actor-owned observation.
    operations: readonly Readonly<{
      descriptor: OperationDeclaration;
      key: OperationKey;
      status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
    }>[];
    // oxlint-disable-next-line anti-slop/no-readonly -- Snapshot collections are read-only so callers cannot edit the actor-owned observation.
    timers: readonly Readonly<{ name: string; startedAt: number; dueAt: number }>[];
    // oxlint-disable-next-line anti-slop/no-readonly -- Snapshot collections are read-only so callers cannot edit the actor-owned observation.
    issues: readonly Diagnostic[];
    revision: number;
    observedStoreRevision: number;
  }
>;

// oxlint-disable-next-line anti-slop/no-readonly -- A dispatch receipt is an immutable record of the committed publication and evidence sequence.
export type DispatchReceipt = Readonly<{
  publicationRevision: number;
  evidenceSequence: number;
}>;

type ProviderDefinitionOf<Selector> = Selector extends {
  provider: infer Provider extends MachineDefinition;
}
  ? Provider
  : never;

// oxlint-disable-next-line anti-slop/no-readonly -- Each declared context slot keeps its admitted provider reference fixed.
export type ActorContextSources<DefinitionValue extends MachineDefinition> = {
  readonly [Slot in keyof DefinitionValue["context"]]: ActorRef<
    Machine<ProviderDefinitionOf<DefinitionValue["context"][Slot]>>
  >;
};

/* oxlint-disable anti-slop/no-optional-domain-properties -- Optional never forbids input or context for machine families that do not declare them; negative compile cases verify both exclusions. */
// oxlint-disable-next-line anti-slop/no-readonly -- Start options preserve the exact immutable provider mapping and compile-time input exclusions.
export type ActorStartOptions<DefinitionValue extends MachineDefinition> = Readonly<
  ([InputOf<DefinitionValue>] extends [void]
    ? { input?: never }
    : { input: InputOf<DefinitionValue> }) &
    (keyof DefinitionValue["context"] extends never
      ? { context?: never }
      : { context: ActorContextSources<DefinitionValue> })
>;
/* oxlint-enable anti-slop/no-optional-domain-properties */

/** A command and observation facade with no individual disposal authority. */
export interface ActorHandle<DefinitionValue extends MachineDefinition> {
  // oxlint-disable-next-line anti-slop/no-readonly -- The actor handle exposes stable observation capabilities without granting replacement authority.
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  // oxlint-disable-next-line anti-slop/no-public-runtime-infrastructure, anti-slop/no-readonly -- The final facade exposes a fixed observation Stream and no mailbox or owner.
  readonly snapshots: Stream.Stream<ActorSnapshot<DefinitionValue>, Diagnostic>;

  send(event: EventOf<DefinitionValue>): Result.Result<void, Diagnostic>;
  dispatch(event: EventOf<DefinitionValue>): Effect.Effect<DispatchReceipt, Diagnostic>;
  snapshot(): ActorSnapshot<DefinitionValue>;
  flush(): Effect.Effect<void, Diagnostic>;
}

/** Disposal belongs to this lease, never to its actor handle or ref. */
// oxlint-disable-next-line anti-slop/no-readonly -- The lease keeps actor access and its sole disposal authority as one immutable owner-issued value.
export type ActorOwnerLease<DefinitionValue extends MachineDefinition> = Readonly<{
  actor: ActorHandle<DefinitionValue>;
  dispose(): Effect.Effect<void, Diagnostic>;
}>;

type AppMachine<A extends App> = Extract<A["M"][keyof A["M"]], MachineRecordValue>;

export interface Runtime<A extends App, ImplementationError = never> {
  // oxlint-disable-next-line anti-slop/no-readonly -- Runtime setup captures the admitted app identity; callers cannot replace the runtime authority.
  readonly app: A;

  ready(): Effect.Effect<void, ImplementationError | Diagnostic>;
  createActor<MachineValue extends AppMachine<A>>(
    machine: MachineValue,
    options: ActorStartOptions<MachineValue["definition"]>,
  ): Effect.Effect<ActorOwnerLease<MachineValue["definition"]>, ImplementationError | Diagnostic>;
  ensureActor<MachineValue extends AppMachine<A>>(
    ref: ActorRef<MachineValue>,
    options: ActorStartOptions<MachineValue["definition"]>,
  ): Effect.Effect<ActorOwnerLease<MachineValue["definition"]>, ImplementationError | Diagnostic>;
  getActor<MachineValue extends AppMachine<A>>(
    ref: ActorRef<MachineValue>,
  ): Effect.Effect<
    ActorHandle<MachineValue["definition"]> | undefined,
    ImplementationError | Diagnostic
  >;
  dispose(): Effect.Effect<void, ImplementationError | Diagnostic>;
}

/** Assembly adds the construct operation to a captured setup value. */
export interface RuntimeSetup<A extends App, ImplementationError = never> {
  // oxlint-disable-next-line anti-slop/no-readonly -- Runtime setup captures the admitted app identity; callers cannot replace the runtime authority.
  readonly app: A;
  construct(): Runtime<A, ImplementationError>;
}

type CapturedRuntimeSetup<A extends App, ImplementationError> = RuntimeSetup<
  A,
  ImplementationError
>;

/** Captures App identity without acquiring a Runtime or reading App fields. */
// RETURN_TYPE: Keeps the admitted App readonly on the actual setup result before assembly adds construct().
export const runtimeSetup = <A extends App, Output = never, ImplementationError = never>(
  options: { app: A } | { app: A; implementation: Implementation<Output, ImplementationError> },
): CapturedRuntimeSetup<A, ImplementationError> => {
  const app = options.app;

  if (!isConstructedApp(app)) {
    throw new TypeError("runtimeSetup app must be constructed by app()");
  }

  const layer =
    "implementation" in options ? implementationLayer(options.implementation) : undefined;

  return {
    app,
    construct: () =>
      layer === undefined
        ? makeRuntimeAssembly({ app, layer: Layer.empty }).runtime
        : makeRuntimeAssembly({ app, layer }).runtime,
  };
};
