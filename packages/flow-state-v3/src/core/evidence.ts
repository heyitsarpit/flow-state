import { Data, type Option } from "effect";
import type { Values } from "./compiled.ts";

/**
 * The channel an ending was decided on (WriteLanes R2).
 */
export type Channel = "success" | "failure" | "unknown";

/**
 * A lane fact that is not an ending's disposition (WriteLanes R3, WriteAhead R12, R13).
 */
export type LaneFact =
  | "Superseded"
  | "Released"
  | "InFlight"
  | "NothingToResend"
  | "StorageFailure"
  | "StorageSilent";

/**
 * Why an ending was recorded and not delivered.
 */
export type RecordedWhy = "ignored" | "evidence" | "letGo";

/**
 * The lanes a member acts on: an unkeyed operation's one lane, one key's lane, every lane of the
 * operation for the actor, or none.
 */
export type MemberTarget = Data.TaggedEnum<{
  Only: {};
  Key: { key: Values };
  Every: {};
  Nothing: {};
}>;

/**
 * Constructors and matchers for {@link MemberTarget}.
 */
export const MemberTarget = Data.taggedEnum<MemberTarget>();

/**
 * One lane member a turn ran.
 */
export type Member = {
  readonly operation: string;
  readonly kind: "commit" | "retry" | "cancel" | "cancelAll" | "release";
  readonly target: MemberTarget;
};

/**
 * One alternative a turn ran: its place and the node that held it, and its target.
 */
export type Part = { readonly at: string; readonly node: string; readonly target: string };

/**
 * An actor as evidence names it.
 */
export type Who = { readonly machine: string; readonly name: string };

/**
 * One Runtime decision, in the order it happened (Inspection O4).
 *
 * **Details**
 *
 * Each record is accepted with the publication it describes; a host attaches a sink with
 * `attachInspector`.
 */
export type Evidence = Data.TaggedEnum<{
  Turn: {
    actor: Who;
    event: string;
    from: string;
    to: string;
    parts: ReadonlyArray<Part>;
    members: ReadonlyArray<Member>;
  };
  Minted: {
    operation: string;
    attempt: string;
    actor: Who;
    key: Values;
  };
  Sent: { operation: string; attempt: string };
  Ended: {
    operation: string;
    attempt: Option.Option<string>;
    channel: Channel;
    reason: string;
    actor: Who;
  };
  Delivered: {
    operation: string;
    attempt: Option.Option<string>;
    event: string;
    actor: Who;
  };
  Parked: { operation: string; attempt: Option.Option<string> };
  Unparked: { operation: string; attempt: Option.Option<string> };
  Recorded: {
    operation: string;
    attempt: Option.Option<string>;
    why: RecordedWhy;
  };
  Unhandled: { actor: Who; event: string };
  Denied: { actor: Who; event: string; reasons: ReadonlyArray<string> };
  Lane: {
    kind: LaneFact;
    operation: string;
    attempt: Option.Option<string>;
  };
  Issue: {
    code: string;
    ending: Option.Option<{
      readonly operation: string;
      readonly attempt: Option.Option<string>;
      readonly actor: Who;
    }>;
  };
  Incarnated: { actor: Who };
  Finished: { actor: Who };
  RuntimeDisposed: {};
  Published: { actor: Who; state: string; memory: Values };
}>;

/**
 * Constructors and matchers for {@link Evidence}.
 */
export const Evidence = Data.taggedEnum<Evidence>();
