import type { Effect, Result, Stream } from "effect";

import { isConstructedApp, type App } from "../app/app.js";
import type { EventOf, InputOf } from "../definition/domain.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { Machine, MachineRecordValue } from "../machine/machine.js";
import type { MachineDefinition, MachineSnapshot } from "../machine/grammar.js";
import type { OperationKey } from "../operation/key.js";
import type { OperationDeclaration } from "../operation/operation.js";
import type { ActorRef } from "../public/types.js";

/* oxlint-disable anti-slop/no-readonly -- These are the immutable facade and snapshot types fixed by the runtime contract; the compile fixture checks their ownership and input boundaries. */
/** Safe diagnostic fields at the internal facade boundary. */
export type Diagnostic = PublicDiagnostic;

export type ActorSnapshot<DefinitionValue extends MachineDefinition> = Readonly<
  MachineSnapshot<DefinitionValue> & {
    lifecycle: "prepared" | "active" | "suspended" | "disposed";
    operations: readonly Readonly<{
      descriptor: OperationDeclaration;
      key: OperationKey;
      status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
    }>[];
    timers: readonly Readonly<{ name: string; startedAt: number; dueAt: number }>[];
    issues: readonly Diagnostic[];
    revision: number;
    observedStoreRevision: number;
  }
>;

export type DispatchReceipt = Readonly<{
  publicationRevision: number;
  evidenceSequence: number;
}>;

type ProviderDefinitionOf<Selector> = Selector extends {
  provider: infer Provider extends MachineDefinition;
}
  ? Provider
  : never;

export type ActorContextSources<DefinitionValue extends MachineDefinition> = {
  readonly [Slot in keyof DefinitionValue["context"]]: ActorRef<
    Machine<ProviderDefinitionOf<DefinitionValue["context"][Slot]>>
  >;
};

/* oxlint-disable anti-slop/no-optional-domain-properties -- Optional never forbids input or context for machine families that do not declare them; negative compile cases verify both exclusions. */
export type ActorStartOptions<DefinitionValue extends MachineDefinition> = Readonly<
  ([InputOf<DefinitionValue>] extends [void]
    ? { readonly input?: never }
    : { readonly input: InputOf<DefinitionValue> }) &
    (keyof DefinitionValue["context"] extends never
      ? { readonly context?: never }
      : { readonly context: ActorContextSources<DefinitionValue> })
>;
/* oxlint-enable anti-slop/no-optional-domain-properties */

/** A command and observation facade with no individual disposal authority. */
export interface ActorHandle<DefinitionValue extends MachineDefinition> {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  // oxlint-disable-next-line anti-slop/no-public-runtime-infrastructure -- The final actor facade exposes snapshot observations as a Stream; it does not expose its mailbox or owner.
  readonly snapshots: Stream.Stream<ActorSnapshot<DefinitionValue>, Diagnostic>;

  send(event: EventOf<DefinitionValue>): Result.Result<void, Diagnostic>;
  dispatch(event: EventOf<DefinitionValue>): Effect.Effect<DispatchReceipt, Diagnostic>;
  snapshot(): ActorSnapshot<DefinitionValue>;
  flush(): Effect.Effect<void, Diagnostic>;
}

/** Disposal belongs to this lease, never to its actor handle or ref. */
export type ActorOwnerLease<DefinitionValue extends MachineDefinition> = Readonly<{
  actor: ActorHandle<DefinitionValue>;
  dispose(): Effect.Effect<void, Diagnostic>;
}>;

type AppMachine<A extends App> = Extract<A["M"][keyof A["M"]], MachineRecordValue>;

export interface Runtime<A extends App, ImplementationError = never> {
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
  readonly app: A;
  construct(): Runtime<A, ImplementationError>;
}

type CapturedRuntimeSetup<A extends App> = Readonly<{ app: A }>;
/* oxlint-enable anti-slop/no-readonly */

/** Captures App identity without acquiring a Runtime or reading App fields. */
// RETURN_TYPE: Keeps the admitted App readonly on the actual setup result before assembly adds construct().
export const runtimeSetup = <A extends App>(options: { app: A }): CapturedRuntimeSetup<A> => {
  const app = options.app;

  if (!isConstructedApp(app)) {
    throw new TypeError("runtimeSetup app must be constructed by app()");
  }

  return { app };
};
