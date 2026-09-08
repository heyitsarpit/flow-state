// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Context, Deferred, Effect, Exit, Result, Scope } from "effect";

import type { App } from "../app/app.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { Implementation, ImplementationErrorOf } from "../implementation/implementation.js";
import type { RuntimeServiceContext } from "./runtime-services.stub.js";

/*
 * Data
 *
 * Runtime readiness is a private state value: one phase, one terminal Exit,
 * and one owner-scoped completion cell. The public shell exposes only app and
 * ready; phase labels and cells never become application data.
 *
 * Admission and invariants
 *
 * Construction is inert. The first ready call becomes the leader, later calls
 * join it, and every terminal—including defect, interruption, and disposal—is
 * cached exactly once. Disposal closes admission before cleanup begins.
 *
 * Pure data operations
 *
 * Transition validation is a Result over the private phase value. It checks
 * legal edges and records a canonical PublicDiagnostic on refusal without
 * starting provider acquisition.
 *
 * Effect execution
 *
 * The leader acquires the already-closed Implementation graph sequentially in
 * the owner Scope. Waiters await the shared Exit; cleanup retains Cause and
 * runs through the same owner when readiness or disposal is interrupted.
 */

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

/** Internal transition proof for shared success, failure, defect, interruption, and disposal races. */
declare const transitionReadiness: <Failure>(
  state: RuntimeReadinessState<Failure>,
  next: RuntimeReadinessState<Failure>,
) => Result.Result<RuntimeReadinessState<Failure>, PublicDiagnostic>;

/** Constructs an inert shell; implementation acquisition begins only through owner.ready(). */
export declare const constructRuntimeOwner: <A extends App, I extends Implementation>(
  input: RuntimeOwnerInput<A, I>,
) => RuntimeOwner<A, I>;
