import { Data, type Option, Schema } from "effect";
import type { World } from "./world/world.ts";

/**
 * An actor as the suite names it: the machine's id and the identity's id.
 *
 * **When to use**
 *
 * Every step and read that targets one actor takes an `ActorRef`.
 *
 * **Gotchas**
 *
 * - An adapter spells the runtime's own actor key from this; the suite never sees that spelling.
 */
export type ActorRef = { readonly machine: string; readonly id: string };

/**
 * The channel an ending was decided on: success, failure (this send did not do it) or unknown
 * (it may have happened).
 */
export const Channel = Schema.Literals(["success", "failure", "unknown"]);

/**
 * The decoded {@link Channel}.
 */
export type Channel = typeof Channel.Type;

/**
 * What the published row of a write lane shows, as the public `O.x.get` returns it.
 *
 * **Details**
 *
 * The shape is the public API's (Reads R14), so it keeps the public booleans.
 */
export type Row = {
  readonly pending: boolean;
  readonly uncertain: boolean;
  readonly waiting: boolean;
  readonly retryCount: number;
};

/**
 * What a handle shows for an identity: its leaf state and its memory, or nothing live.
 */
export type Snapshot = Data.TaggedEnum<{
  Live: { readonly state: string; readonly memory: unknown };
  Absent: {};
}>;

/**
 * Constructors and matchers for {@link Snapshot}.
 */
export const Snapshot = Data.taggedEnum<Snapshot>();

/**
 * Evidence a runtime records without delivering it (WriteLanes R3, R10).
 */
export const EvidenceKind = Schema.Literals([
  "Superseded",
  "Released",
  "InFlight",
  "NothingToResend",
]);

/**
 * The decoded {@link EvidenceKind}.
 */
export type EvidenceKind = typeof EvidenceKind.Type;

/**
 * One public report from a runtime, in the order it happened.
 *
 * **When to use**
 *
 * Oracles read observations and check each against facts the suite owns: what it drove, what
 * its fake world saw, and the fixtures' references.
 *
 * **Details**
 *
 * - `Turn`: an actor ran an event, from one leaf to another.
 * - `Minted`: a commit was admitted and its Attempt got an id.
 * - `Sent`: an Attempt's commit was invoked (its first send or a re-send).
 * - `Ended`: an Attempt, or a decline with none, was decided on a channel with a reason.
 * - `Delivered`: an ending was admitted to its actor as the named event.
 * - `Evidence`: an ending or member recorded as evidence only.
 * - `Issue`: an issue the runtime reported, by code.
 *
 * **Gotchas**
 *
 * - Every observation is the runtime's own claim. An oracle that reads one alone checks only
 *   consistency; each must be anchored to a suite fact.
 */
export type Observation = Data.TaggedEnum<{
  Turn: {
    readonly actor: ActorRef;
    readonly event: string;
    readonly from: string;
    readonly to: string;
  };
  Minted: { readonly operation: string; readonly attempt: string };
  Sent: { readonly operation: string; readonly attempt: string };
  Ended: {
    readonly operation: string;
    readonly attempt: Option.Option<string>;
    readonly channel: Channel;
    readonly reason: string;
  };
  Delivered: {
    readonly operation: string;
    readonly attempt: Option.Option<string>;
    readonly event: string;
  };
  Evidence: {
    readonly kind: EvidenceKind;
    readonly operation: string;
    readonly attempt: Option.Option<string>;
  };
  Issue: { readonly code: string };
}>;

/**
 * Constructors and matchers for {@link Observation}.
 */
export const Observation = Data.taggedEnum<Observation>();

/**
 * What the suite gives a runtime when it boots one process.
 *
 * **Details**
 *
 * - `fixtures`: the machines to run, by their catalog names.
 * - `captureMs`: the persistence capture interval; the slice's cases run with 0.
 * - `world`: the fake world's hosts: clock, network, storage and the page's lifecycle.
 * - `observe`: called with each public report as it happens.
 */
export type Boot = {
  readonly fixtures: ReadonlyArray<string>;
  readonly captureMs: number;
  readonly world: World;
  readonly observe: (observation: Observation) => void;
};

/**
 * One booted runtime process, driven only through public operations.
 *
 * **When to use**
 *
 * A case's steps call these; the suite settles the world after each.
 *
 * **Details**
 *
 * - `ensure` attaches one use of the identity, as a mounted screen does, creating it if needed.
 * - `ensureExisting` attaches a use to an identity that is live or restorable, never creating one;
 *   the suite calls it for each use it holds after a reload.
 *
 * **Gotchas**
 *
 * - `pending` says the runtime has work that no host task shows yet. Settling needs it; nothing
 *   else may read it.
 */
export type Runtime = {
  readonly ensure: (actor: ActorRef, input: Option.Option<unknown>) => void;
  readonly ensureExisting: (actor: ActorRef) => void;
  readonly send: (actor: ActorRef, event: string, payload: unknown) => void;
  readonly dispose: (actor: ActorRef) => void;
  readonly snapshot: (actor: ActorRef) => Snapshot;
  readonly row: (actor: ActorRef, operation: string, key: unknown) => Option.Option<Row>;
  readonly pending: () => boolean;
};

/**
 * The whole contract between the suite and a runtime.
 *
 * **When to use**
 *
 * Write one adapter per runtime. Scenarios and oracles see only this.
 *
 * **Details**
 *
 * A reload is a new `boot` over the same world after the suite killed the page.
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { loadPrototype } from "./adapters/prototype.ts"
 *
 * const port = Effect.runPromise(loadPrototype("packages/flow-state-v3/prototypes/round-14"))
 * ```
 */
export type Port = {
  readonly name: string;
  readonly boot: (boot: Boot) => Runtime;
};
