import { Data, type Option, Schema } from "effect";
import type { Hosts } from "./world/world.ts";

/**
 * An actor as the suite names it: the machine's id and the identity's id.
 *
 * **When to use**
 *
 * Every step and read that targets one actor takes an `ActorRef`; compare two with
 * {@link sameActor}.
 *
 * **Gotchas**
 *
 * - An adapter spells the runtime's own actor key from this; the suite never sees that spelling.
 */
export const ActorRef = Schema.Struct({ machine: Schema.String, id: Schema.String });

/**
 * The decoded {@link ActorRef}.
 */
export type ActorRef = typeof ActorRef.Type;

/**
 * Whether two {@link ActorRef}s name the same actor.
 */
export const sameActor = Schema.toEquivalence(ActorRef);

/**
 * A value as it crosses the Port: an event payload, an input, a key or a memory, in its encoded
 * JSON form.
 *
 * **Details**
 *
 * The Port is the same for every fixture, so its values are JSON. A case encodes and decodes them
 * with the fixture's own Schemas (`dsl/actor.ts`); an adapter decodes what its runtime returns
 * untyped once, into this.
 */
export type Json = Schema.Json;

/**
 * Whether two {@link Json} values are the same value.
 */
export const sameJson = Schema.toEquivalence(Schema.Json);

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
 * What a handle shows for an identity: its leaf state and its memory, or nothing live.
 */
export type Snapshot = Data.TaggedEnum<{
  Live: { state: string; memory: Json };
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
 * - `Minted`: a commit of `actor` was admitted and its Attempt got an id; `key` is the Attempt's
 *   key (its lane).
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
 * - `actor` on `Minted` is required: an oracle judges a `None` as a violation. On a decline's
 *   `Ended` and on `Delivered` it names the actor, `None` when the runtime does not say.
 * - `key` on `Minted` is `None` when the runtime does not report it; oracles then judge lanes per
 *   actor and operation.
 */
export type Observation = Data.TaggedEnum<{
  Turn: { actor: ActorRef; event: string; from: string; to: string };
  Minted: {
    operation: string;
    attempt: string;
    actor: Option.Option<ActorRef>;
    key: Option.Option<Json>;
  };
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
 * A `Turn` observation.
 */
export type Turn = Data.TaggedEnum.Value<Observation, "Turn">;

/**
 * A `Minted` observation.
 */
export type Minted = Data.TaggedEnum.Value<Observation, "Minted">;

/**
 * A `Sent` observation.
 */
export type Sent = Data.TaggedEnum.Value<Observation, "Sent">;

/**
 * An `Ended` observation.
 */
export type Ended = Data.TaggedEnum.Value<Observation, "Ended">;

/**
 * A `Delivered` observation.
 */
export type Delivered = Data.TaggedEnum.Value<Observation, "Delivered">;

/**
 * A `Recorded` observation.
 */
export type Recorded = Data.TaggedEnum.Value<Observation, "Recorded">;

/**
 * What the suite gives a runtime when it boots one page.
 *
 * **Details**
 *
 * - `fixtures`: the machines to run, by their catalog names.
 * - `captureMs`: the persistence capture interval.
 * - `sessionSeed`: the host's entropy for this boot, distinct per page; the runtime mints its
 *   Attempt ids from it.
 * - `hosts`: the fake world's hosts: clock, page, store and server.
 * - `observe`: called with each public report as it happens.
 */
export type Boot = {
  readonly fixtures: ReadonlyArray<string>;
  readonly captureMs: number;
  readonly sessionSeed: number;
  readonly hosts: Hosts;
  readonly observe: (observation: Observation) => void;
};

/**
 * One booted runtime, driven only through public operations.
 *
 * **When to use**
 *
 * A case's steps call these; the suite settles the world after each.
 *
 * **Details**
 *
 * - `row` is a write's row as the runtime publishes it, untyped; the fixture's operation decodes it
 *   (`dsl/actor.ts`), and an absent row is `None`.
 * - `ensure` attaches one use of the identity, creating it if needed.
 * - `ensureExisting` attaches a use to an identity that is live or restorable, never creating one;
 *   the suite calls it for each use it holds after a reload.
 * - `release` ends one use; the runtime's grace decides the identity's life.
 * - `disposeRuntime` starts the Runtime's disposal: admission closes, nothing new is invoked, and
 *   calls on the wire may settle within the bound. It reports `RuntimeDisposed` when it ends.
 * - The operations are synchronous: the world is a synchronous simulator and the suite settles it
 *   after each call.
 *
 * **Gotchas**
 *
 * - `pending` says the runtime has work that no host task shows yet. Settling needs it; nothing
 *   else may read it.
 */
export type Runtime = {
  readonly ensure: (actor: ActorRef, input: Option.Option<Json>, use: Use) => void;
  readonly ensureExisting: (actor: ActorRef, use: Use) => void;
  readonly release: (actor: ActorRef, use: Use) => void;
  readonly send: (actor: ActorRef, event: string, payload: Json) => void;
  readonly dispose: (actor: ActorRef) => void;
  readonly disposeRuntime: () => void;
  readonly snapshot: (actor: ActorRef) => Snapshot;
  readonly row: (actor: ActorRef, operation: string, key: Json) => Option.Option<Json>;
  readonly pending: () => boolean;
};

/**
 * The whole contract between the suite and a runtime under test.
 *
 * **When to use**
 *
 * Write one per runtime: `prototypePort` and `nullPort` now, a production one in phase 4.
 * Scenarios and oracles see only the {@link Runtime} it boots, never which one runs.
 *
 * **Details**
 *
 * - `boot` boots one page over the world's hosts and returns its Runtime.
 * - A reload is a new `boot` over the same world after the suite killed the page; the dead page's
 *   Runtime is dropped, never disposed, since a dead page runs nothing.
 */
export type Port = {
  readonly boot: (boot: Boot) => Runtime;
};
