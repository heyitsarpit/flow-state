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
 * Who holds a use of an identity: a Story, a host subscription, or a mounted component.
 */
export type Use = "story" | "host" | "component";

/**
 * What the published row of a write lane shows, as the public `O.x.get` returns it.
 *
 * **Details**
 *
 * The shape is the public API's, so it keeps the public booleans.
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
  Live: { state: string; memory: unknown };
  Absent: {};
}>;

/**
 * Constructors and matchers for {@link Snapshot}.
 */
export const Snapshot = Data.taggedEnum<Snapshot>();

/**
 * Evidence a runtime records about a lane or its store without it being an ending's disposition:
 * a store that refused a write (`StorageFailure`) or has not answered one in time
 * (`StorageSilent`).
 */
export const EvidenceKind = Schema.Literals([
  "Superseded",
  "Released",
  "InFlight",
  "NothingToResend",
  "StorageFailure",
  "StorageSilent",
]);

/**
 * The decoded {@link EvidenceKind}.
 */
export type EvidenceKind = typeof EvidenceKind.Type;

/**
 * Why an ending was recorded and not delivered: its mapping says ignore, it is evidence by
 * declaration, or the life it was owed to was let go.
 */
export const RecordedWhy = Schema.Literals(["ignored", "evidence", "letGo"]);

/**
 * The decoded {@link RecordedWhy}.
 */
export type RecordedWhy = typeof RecordedWhy.Type;

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
 * - `Minted`: a commit of `actor` was admitted and its Attempt got an id.
 * - `Sent`: an Attempt's commit was invoked (its first send or a re-send).
 * - `Ended`: an Attempt, or a decline with none, was decided on a channel with a reason. `actor`
 *   names a decline's actor; `failure` is the definite failure inside `unknown StillUnknown`.
 * - `Delivered`: an ending was admitted to `actor` as the named event.
 * - `Parked`, `Unparked`: an ending waits for an incarnation, and stops waiting.
 * - `Recorded`: an ending was recorded and not delivered, and why.
 * - `Unhandled`: an admitted event had no handler.
 * - `Denied`: an admitted event's handlers all refused it, with the guards' reasons.
 * - `Evidence`: a lane fact that is not an ending's disposition.
 * - `Issue`: an issue the runtime reported, by code.
 * - `RuntimeDisposed`: the Runtime's disposal finished (its public `dispose` settled): every call
 *   it waited for has ended or passed the bound.
 *
 * **Gotchas**
 *
 * - Every observation is the runtime's own claim. An oracle that reads one alone checks only
 *   consistency; each must be anchored to a suite fact.
 * - `actor` is `None` when the runtime could not say whose it was.
 */
export type Observation = Data.TaggedEnum<{
  Turn: { actor: ActorRef; event: string; from: string; to: string };
  Minted: { operation: string; attempt: string; actor: Option.Option<ActorRef> };
  Sent: { operation: string; attempt: string };
  Ended: {
    operation: string;
    attempt: Option.Option<string>;
    channel: Channel;
    reason: string;
    actor: Option.Option<ActorRef>;
    failure: Option.Option<string>;
  };
  Delivered: {
    operation: string;
    attempt: Option.Option<string>;
    event: string;
    actor: Option.Option<ActorRef>;
  };
  Parked: { operation: string; attempt: Option.Option<string> };
  Unparked: { operation: string; attempt: Option.Option<string> };
  Recorded: { operation: string; attempt: Option.Option<string>; why: RecordedWhy };
  Unhandled: { event: string };
  Denied: { event: string; reasons: ReadonlyArray<string> };
  Evidence: { kind: EvidenceKind; operation: string; attempt: Option.Option<string> };
  Issue: { code: string };
  RuntimeDisposed: {};
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
 * - `captureMs`: the persistence capture interval; the cases so far run with 0.
 * - `sessionSeed`: the host's entropy for this boot, distinct per page; the runtime mints its
 *   Attempt ids from it.
 * - `world`: the fake world's hosts: clock, network, storage and the page's lifecycle.
 * - `observe`: called with each public report as it happens.
 */
export type Boot = {
  readonly fixtures: ReadonlyArray<string>;
  readonly captureMs: number;
  readonly sessionSeed: number;
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
 * - `ensure` attaches one use of the identity, creating it if needed.
 * - `ensureExisting` attaches a use to an identity that is live or restorable, never creating one;
 *   the suite calls it for each use it holds after a reload.
 * - `release` ends one use; the runtime's grace decides the identity's life.
 * - `disposeRuntime` starts the Runtime's disposal: admission closes, nothing new is invoked, and
 *   calls on the wire may settle within the bound. It reports `RuntimeDisposed` when it ends.
 *
 * **Gotchas**
 *
 * - `pending` says the runtime has work that no host task shows yet. Settling needs it; nothing
 *   else may read it.
 */
export type Runtime = {
  readonly ensure: (actor: ActorRef, input: Option.Option<unknown>, use: Use) => void;
  readonly ensureExisting: (actor: ActorRef, use: Use) => void;
  readonly release: (actor: ActorRef, use: Use) => void;
  readonly send: (actor: ActorRef, event: string, payload: unknown) => void;
  readonly dispose: (actor: ActorRef) => void;
  readonly disposeRuntime: () => void;
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
