import { Data, type Option } from "effect";
import type { Channel, IssueCode } from "./vocabulary.ts";
import type { ActorId } from "./world.ts";
import type { Values } from "./compiled.ts";
import type { Input } from "./input.ts";

export type { Channel } from "./vocabulary.ts";

/**
 * A lane fact that is not an ending's disposition.
 */
export type LaneFact =
  | "Superseded"
  | "Released"
  | "InFlight"
  | "NothingToResend"
  | "StorageFailure"
  | "StorageSilent";

/**
 * A diagnostic about the Runtime's records: one that cannot encode, one the boot did not read and
 * kept or reset, a part of one the boot dropped because the definition no longer reads it, a work
 * part it carries unread, a store that failed to load or has not answered its load yet, or a work
 * record no actor holds, reported at each boot.
 */
export type ReportCode =
  | "UnencodableValue"
  | "RecordUndecodable"
  | "FieldDropped"
  | "ObligationCarried"
  | "StorageFailure"
  | "StorageSilent"
  | "UnboundLane";

/**
 * What a diagnostic reports: its code, the record it names when it names one, and the reason.
 */
export type Reported = {
  readonly code: ReportCode;
  readonly record: Option.Option<string>;
  readonly reason: string;
};

/**
 * Why a send reached no actor: its target has no record, its record does not decode, or it is a
 * lazy entry not adopted.
 */
export type SendDrop = "NoRecord" | "RecordUndecodable" | "NotAdopted";

/**
 * Why an ending was recorded and not delivered.
 */
export type RecordedWhy = "evidence" | "letGo" | "replaced";

/**
 * The lanes a member acts on: an unkeyed operation's one lane, one key's lane, or none.
 */
export type MemberTarget = Data.TaggedEnum<{
  Only: {};
  Key: { key: Values };
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
  readonly kind: "commit" | "retry" | "cancel";
  readonly target: MemberTarget;
};

/**
 * One alternative a turn ran: its place and the node that held it, and its target.
 */
export type Part = { readonly at: string; readonly node: string; readonly target: string };

/**
 * Why a publication was made: an incarnation's start, an accepted turn, or any other change.
 */
export type Why = "Begin" | "Turn" | "Other";

/**
 * An actor as evidence names it.
 */
export type Who = ActorId;

/**
 * One Runtime decision, in the order it happened.
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
  // A lookup whose input its Schema refused: nothing was asked.
  InvalidInput: { actor: Who; operation: string };
  SendTargetAbsent: { actor: Who; event: string; reason: SendDrop; sender: Option.Option<Who> };
  Denied: { actor: Who; event: string; reasons: ReadonlyArray<string> };
  Paused: {
    actor: Who;
    schedule: string;
    key: Option.Option<Values>;
    reasons: ReadonlyArray<string>;
    left: number;
  };
  Resumed: { actor: Who; schedule: string; key: Option.Option<Values>; dueAt: number };
  Lane: {
    kind: LaneFact;
    operation: string;
    attempt: Option.Option<string>;
  };
  Issue: {
    code: IssueCode;
    ending: Option.Option<{
      readonly operation: string;
      readonly attempt: Option.Option<string>;
      readonly actor: Who;
    }>;
    slot: Option.Option<string>;
  };
  Incarnated: { actor: Who };
  Finished: { actor: Who };
  RuntimeDisposed: {};
  Published: { actor: Who; incarnation: string; why: Why; state: string; memory: Values };
  Reported: Reported;
  HoldForgotten: { actor: Who; operation: string; record: string };
  SlowWork: { work: "turn" | "capture"; input: Input["_tag"]; ms: number; budgetMs: number };
}>;

/**
 * Constructors and matchers for {@link Evidence}.
 */
export const Evidence = Data.taggedEnum<Evidence>();

/**
 * The one {@link Evidence} variant a tag names; a misspelt tag does not compile.
 */
export type EvidenceOf<T extends Evidence["_tag"]> = Extract<Evidence, { readonly _tag: T }>;
