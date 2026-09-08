// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Context, Deferred, Effect, Exit, Result, Scope } from "effect";

import type { App } from "../app/app.js";
import type { Implementation, ImplementationErrorOf } from "../implementation/implementation.js";
import type { RuntimeServiceContext } from "./runtime-services.stub.js";

type RuntimeTerminal<Failure> = Exit.Exit<void, Failure>;

/** Internal readiness phases keep the shared terminal cell out of the public surface. */
type RuntimePhase = "constructed" | "booting" | "ready" | "failed" | "disposed";

type ReadinessLeader<Failure> = {
  // oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- explicit never error channel makes terminal completion non-failing.
  readonly completion: Deferred.Deferred<RuntimeTerminal<Failure>, never>;
  readonly startedAt: number;
};

type ReadinessWaiter<Failure> = {
  // oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- explicit never error channel makes terminal completion non-failing.
  readonly completion: Deferred.Deferred<RuntimeTerminal<Failure>, never>;
  readonly joinedAt: number;
};

type RuntimeReadinessState<Failure> =
  | { readonly phase: Extract<RuntimePhase, "constructed"> }
  | {
      readonly phase: Extract<RuntimePhase, "booting">;
      readonly leader: ReadinessLeader<Failure>;
      readonly waiters: ReadonlySet<ReadinessWaiter<Failure>>;
    }
  | { readonly phase: Extract<RuntimePhase, "ready"> }
  | { readonly phase: Extract<RuntimePhase, "failed">; readonly terminal: RuntimeTerminal<Failure> }
  | {
      readonly phase: Extract<RuntimePhase, "disposed">;
      readonly terminal: RuntimeTerminal<Failure>;
    };

type RuntimeReadiness<Failure> = {
  readonly current: () => RuntimeReadinessState<Failure>;
  readonly transition: typeof transitionReadiness;
  readonly ready: () => Effect.Effect<void, Failure>;
  readonly dispose: () => Effect.Effect<void, Failure>;
};

/** Inputs retain the exact implementation graph selected for this application. */
export type RuntimeOwnerInput<A extends App, I extends Implementation> = {
  readonly app: A;
  readonly implementation: I;
};

/** One owner retains typed setup errors while Exit preserves failure, defect, and interruption. */
export type RuntimeOwner<A extends App, I extends Implementation> = {
  readonly app: A;
  readonly implementation: I;
  readonly context: Context.Context<RuntimeServiceContext>;
  readonly scope: Scope.Scope;
  readonly ready: RuntimeReadiness<ImplementationErrorOf<I>>["ready"];
  readonly dispose: RuntimeReadiness<ImplementationErrorOf<I>>["dispose"];
};

type RuntimeReadinessError = {
  readonly _tag: "RuntimeReadinessError";
  readonly reason: "invalid-transition" | "already-disposed" | "bootstrap-failed";
};

/** Internal transition proof for shared success, failure, defect, interruption, and disposal races. */
declare const transitionReadiness: <Failure>(
  state: RuntimeReadinessState<Failure>,
  next: RuntimeReadinessState<Failure>,
) => Result.Result<RuntimeReadinessState<Failure>, RuntimeReadinessError>;

/** Constructs an inert shell; implementation acquisition begins only through owner.ready(). */
export declare const constructRuntimeOwner: <A extends App, I extends Implementation>(
  input: RuntimeOwnerInput<A, I>,
) => RuntimeOwner<A, I>;
