import { Option, type Schema } from "effect";
import type { Channel, MemberKind } from "../port.ts";
import { Answer } from "../world/network.ts";

/**
 * What the suite expects of one operation of a fixture, written by hand from the fixture's source.
 *
 * **Details**
 *
 * - `concurrency`: the operation's declared policy.
 * - `releasesOnLeave`: the transitions (event, from state, to state) that leave a state whose
 *   `whenAbandoned` holds a key-less cancel of this operation, so taking one releases its lanes
 *   (WriteLanes R16); a `release` member is anchored only in a turn that took one.
 * - `success` and `failure` (by tag, `NotSent` for Flow's declines): the event each ending maps
 *   to. `unknown`: the event an unknown ending maps to, or `ignore` (`Flow.ignore`) or `bare` (the
 *   operation maps nothing); with `concurrency` it says whether an unknown is retained
 *   ({@link retains}).
 * - `classify`: the channel the operation's commit gives the server's answer, given whether an
 *   earlier send of the same Attempt ended unknown. A tag the commit turns into a success or an
 *   unknown is named here; the Spec's rules on top of it (StillUnknown) are the oracle's.
 * - `keyFields`: the input fields its key is made of; empty for an unkeyed operation.
 * - `cancels`: the events whose handler, in every state, runs this operation's `cancel` or
 *   `cancelAll` with no guard, so a turn of one is a cancel the suite drove. Typed by the
 *   fixture's event names (`Event`), see {@link CancelsOf}.
 */
export type OperationReference<Event extends string = string> = {
  readonly concurrency: Concurrency;
  readonly success: string;
  readonly failure: Readonly<Record<string, string>>;
  readonly unknown: Unknown;
  readonly classify: (answer: Answer, mayHaveApplied: boolean) => Channel;
  readonly keyFields: ReadonlyArray<string>;
  readonly releasesOnLeave: ReadonlyArray<Transition>;
  readonly cancels: CancelsOf<Event>;
};

/**
 * Where an operation's unknown ending goes: an event, `ignore` (`Flow.ignore`) or `bare` (the
 * operation maps nothing, so its endings are evidence).
 */
export type Unknown = { readonly event: string } | "ignore" | "bare";

/**
 * The event an unknown ending of `operation` maps to; none when it is ignored or bare.
 */
export const unknownEvent = (operation: OperationReference) =>
  operation.unknown === "ignore" || operation.unknown === "bare"
    ? Option.none()
    : Option.some(operation.unknown.event);

/**
 * Whether an unknown ending of `reason` is kept on its lane (WriteLanes R4): it maps to an event,
 * and its operation's policy is not `cancel`, except an `O.x.cancel` member's `Cancelled` (R14).
 *
 * **Gotchas**
 *
 * - Under `cancel` an unknown is released only once its own ending's turn ends; a retry in that
 *   turn keeps it (Table B's `Resend` discharges the release it owed).
 */
export const retains = (operation: OperationReference, reason: string) =>
  Option.isSome(unknownEvent(operation)) &&
  (operation.concurrency !== "cancel" || reason === "Cancelled");

/**
 * One lane member of a reference row: its operation and kind. A release is never in a row.
 */
export type RowMember<Operation extends string = string> = {
  readonly operation: Operation;
  readonly kind: Exclude<MemberKind, "release">;
};

/**
 * A row guard the suite computes: `retryable({ times })` of the lane `operation`'s member names,
 * which passes while its head is Held with fewer than `times` retries (WriteLanes R9). `passes`
 * says which way the row needs it: `false` on the alternative a failed guard falls through to.
 */
export type Retryable<Operation extends string = string> = {
  readonly operation: Operation;
  readonly times: number;
  readonly passes: boolean;
};

/**
 * One alternative of a machine that runs lane members, written by hand from the fixture's source.
 *
 * **Details**
 *
 * - `from`: the leaf state the turn starts in, or `any` for a root handler with no state guard.
 * - `to`: the leaf it ends in, or `same` for a turn that stays.
 * - `members`: its lane members in action order, releases excluded.
 * - `guard`: a guard the suite computes, so the suite, not the reported members, chooses the row.
 *
 * **Gotchas**
 *
 * - Its other guards (memory, the event's payload) are not computed: a tie between two rows of the
 *   same event, from and to is broken by the reported members, a runtime claim.
 */
export type Row<
  Event extends string = string,
  State extends string = string,
  Operation extends string = string,
> = {
  readonly event: Event;
  readonly from: State | "any";
  readonly to: State | "same";
  readonly members: ReadonlyArray<RowMember<Operation>>;
  readonly guard: Option.Option<Retryable<Operation>>;
  readonly claimed: boolean;
};

/**
 * The rows of a case's fixtures, by machine id.
 */
export type Rows = Readonly<Record<string, ReadonlyArray<Row>>>;

/**
 * A {@link Row} with no computed guard.
 */
export const row = <Event extends string, State extends string, Operation extends string>(
  event: Event,
  from: State | "any",
  to: State | "same",
  members: ReadonlyArray<RowMember<Operation>>,
  guard: Option.Option<Retryable<Operation>> = Option.none(),
) => ({ event, from, to, members, guard, claimed: false });

/**
 * A {@link Row} the suite cannot choose: a sibling alternative of the same event, state and
 * target runs other lane members behind a guard the suite does not compute, so the turn's
 * reported members say which ran (a runtime claim, v2 Risk 2).
 */
// RETURN_TYPE: keeps the fixture's typed row (its event, state and operation names).
export const claimed = <R extends Row>(r: R): R => ({ ...r, claimed: true });

/**
 * One transition of a machine: an event's turn from one state to another.
 */
export type Transition = { readonly event: string; readonly from: string; readonly to: string };

/**
 * The declared concurrency policy of a write.
 */
export type Concurrency = "reject" | "latest" | "serialize" | "cancel";

/**
 * The `cancels` of an operation whose fixture has the events `Event`: each named event runs the
 * operation's `cancel` or `cancelAll`.
 */
export type CancelsOf<Event extends string> = Readonly<
  Partial<Record<Event, "cancel" | "cancelAll">>
>;

/**
 * The references of the fixtures one case runs, by machine id, then by operation.
 */
export type Reference = Readonly<Record<string, Readonly<Record<string, OperationReference>>>>;

const LOST = ["NoResponse", "ServerError"];

/**
 * The `classify` of a write whose commit turns lost answers into unknowns and the tags `succeeds`
 * accepts into successes; every other tag is a failure.
 */
export const classifyWith =
  (succeeds: (tag: string, fields: Schema.JsonObject, mayHaveApplied: boolean) => boolean) =>
  (answer: Answer, mayHaveApplied: boolean) => {
    const tagged = (tag: string, fields: Schema.JsonObject) => {
      if (LOST.includes(tag)) return "unknown" as const;

      return succeeds(tag, fields, mayHaveApplied) ? ("success" as const) : ("failure" as const);
    };

    return Answer.$match(answer, {
      Ok: () => "success" as const,
      Fail: ({ tag, fields }) => tagged(tag, fields),
      FailButLanded: ({ tag, fields }) => tagged(tag, fields),
      Lost: () => "unknown" as const,
      LostButLanded: () => "unknown" as const,
      Never: () => "unknown" as const,
      Die: () => "unknown" as const,
    });
  };

/**
 * Flow's own reasons for a failure, `NotSent { why }`: the Spec's closed list.
 */
export const FLOW_DECLINES = [
  "Cancelled",
  "Restored",
  "Rejected",
  "Overloaded",
  "StorageRefused",
  "Disposed",
  "NoPersistence",
  "OldVersion",
  "Unencodable",
  "ModuleDisabled",
];

/**
 * The one operation of this name among a case's fixtures; none when no fixture or two fixtures
 * declare it.
 *
 * **Gotchas**
 *
 * - The Port's endings name an operation, not its machine, so an operation name two machines share
 *   is not checked by name.
 */
export const operationNamed = (reference: Reference, name: string) => {
  const found = Object.values(reference).flatMap((operations) =>
    Object.entries(operations).flatMap(([key, operation]) => (key === name ? [operation] : [])),
  );

  const [only] = found;

  return found.length === 1 && only !== undefined ? Option.some(only) : Option.none();
};

/**
 * The event an ending of `operation` maps to, by its channel and reason.
 *
 * **Details**
 *
 * A failure's reason is its tag, or the `why` of a Flow decline (`NotSent { why }`, Flow's closed
 * list of reasons), which maps through `NotSent`. Any other reason has no mapping.
 */
export const mappedEvent = (operation: OperationReference, channel: Channel, reason: string) => {
  if (channel === "success") return Option.some(operation.success);

  if (channel === "unknown") return unknownEvent(operation);

  const tagged = Option.fromUndefinedOr(operation.failure[reason]);

  if (Option.isSome(tagged) || !FLOW_DECLINES.includes(reason)) return tagged;

  return Option.fromUndefinedOr(operation.failure["NotSent"]);
};
