import { Data, type Option, Schema } from "effect";

/**
 * An actor as a case names it: the machine's id and the identity's id.
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
 * A value as a case sees it: an event payload, a key, a memory or a row, in its encoded JSON form.
 */
export type Json = Schema.Json;

/**
 * Whether two {@link Json} values are the same value.
 */
export const sameJson = Schema.toEquivalence(Schema.Json);

/**
 * The channel an ending was decided on: success, failure (this send did not do it, or Flow
 * declined it) or unknown (it may have happened).
 */
export type Channel = "success" | "failure" | "unknown";

/**
 * Who holds a use of an identity: a Story, a host subscription, or a mounted component.
 */
export type Use = "story" | "host" | "component";

/**
 * Evidence the runtime records about a lane or its store without it being an ending's disposition.
 */
export type EvidenceKind =
  | "Superseded"
  | "Released"
  | "InFlight"
  | "NothingToResend"
  | "StorageFailure"
  | "StorageSilent";

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
 * One public report of the production runtime, in the order it happened: its inspector's evidence
 * with actors as {@link ActorRef}s and values as JSON.
 *
 * **Details**
 *
 * - `Turn`: `parts` names each alternative that ran by its definition and place (`at`, the name
 *   `flow graph` gives its edge); `members` each lane member it ran, by operation and kind.
 * - `Ended`: a Flow decline (the inspector's `notSent`) is reported on the `failure` channel with
 *   Flow's reason; `actor` names a decline's actor and is `None` for an Attempt's ending.
 * - `Published`: `memoryId` numbers the memory object, equal within one boot for the same object.
 * - `Issue`: `ending` names the operation ending it concerns, when it concerns one.
 */
export type Observation = Data.TaggedEnum<{
  Turn: {
    actor: ActorRef;
    event: string;
    from: string;
    to: string;
    parts: ReadonlyArray<{ readonly definition: string; readonly at: string }>;
    members: ReadonlyArray<{ readonly operation: string; readonly kind: string }>;
  };
  Minted: { operation: string; attempt: string; actor: ActorRef; key: Json };
  Sent: { operation: string; attempt: string };
  Ended: {
    operation: string;
    attempt: Option.Option<string>;
    channel: Channel;
    reason: string;
    actor: Option.Option<ActorRef>;
  };
  Delivered: {
    operation: string;
    attempt: Option.Option<string>;
    event: string;
    actor: Option.Option<ActorRef>;
  };
  Parked: { operation: string; attempt: Option.Option<string> };
  Unparked: { operation: string; attempt: Option.Option<string> };
  Recorded: { operation: string; attempt: Option.Option<string>; why: string };
  Unhandled: { event: string };
  Denied: { event: string; reasons: ReadonlyArray<string> };
  Evidence: { kind: EvidenceKind; operation: string; attempt: Option.Option<string> };
  Issue: {
    code: string;
    ending: Option.Option<{
      readonly operation: string;
      readonly attempt: Option.Option<string>;
      readonly actor: ActorRef;
    }>;
  };
  Incarnated: { actor: ActorRef };
  Finished: { actor: ActorRef };
  Published: { actor: ActorRef; state: string; memory: Json; memoryId: number };
}>;

/**
 * Constructors and matchers for {@link Observation}.
 */
export const Observation = Data.taggedEnum<Observation>();

/**
 * An `Ended` observation.
 */
export type Ended = Data.TaggedEnum.Value<Observation, "Ended">;

/**
 * A `Delivered` observation.
 */
export type Delivered = Data.TaggedEnum.Value<Observation, "Delivered">;

/**
 * A `Sent` observation.
 */
export type Sent = Data.TaggedEnum.Value<Observation, "Sent">;

/**
 * A report or read the harness cannot decode into JSON: the runtime published a value its Schema
 * did not encode. `report` names what was read; `issue` says what is wrong with it.
 */
export class Unreadable extends Data.TaggedError("Unreadable")<{
  readonly report: string;
  readonly issue: string;
}> {}
