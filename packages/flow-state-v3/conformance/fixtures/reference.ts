import { Option, type Schema } from "effect";
import type { Channel } from "../port.ts";
import { Answer } from "../world/network.ts";

/**
 * What the suite expects of one operation of a fixture, written by hand from the fixture's source.
 *
 * **Details**
 *
 * - `attempts`: a write, whose sends are Attempts with ids on the wire.
 * - `concurrency`: the operation's declared policy.
 * - `success`, `failure` (by tag, `NotSent` for Flow's declines) and `unknown`: the event each
 *   ending maps to.
 * - `classify`: the channel the operation's commit gives the server's answer, given whether an
 *   earlier send of the same Attempt ended unknown. A tag the commit turns into a success or an
 *   unknown is named here; the Spec's rules on top of it (StillUnknown) are the oracle's.
 * - `keyFields`: the input fields its key is made of; empty for an unkeyed operation.
 * - `cancels`: the events whose handler, in every state, runs this operation's `cancel` or
 *   `cancelAll` with no guard, so a turn of one is a cancel the suite drove. Typed by the
 *   fixture's event names (`Event`), see {@link CancelsOf}.
 */
export type OperationReference<Event extends string = string> = {
  readonly attempts: boolean;
  readonly concurrency: Concurrency;
  readonly success: string;
  readonly failure: Readonly<Record<string, string>>;
  readonly unknown: string;
  readonly classify: (answer: Answer, mayHaveApplied: boolean) => Channel;
  readonly keyFields: ReadonlyArray<string>;
  readonly cancels: CancelsOf<Event>;
};

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

const CHANNEL = { success: "success", failure: "failure", unknown: "unknown" } as const;

/**
 * The `classify` of a write whose commit turns lost answers into unknowns and the tags `succeeds`
 * accepts into successes; every other tag is a failure.
 */
export const classifyWith =
  (succeeds: (tag: string, fields: Schema.JsonObject, mayHaveApplied: boolean) => boolean) =>
  (answer: Answer, mayHaveApplied: boolean) => {
    const tagged = (tag: string, fields: Schema.JsonObject) => {
      if (LOST.includes(tag)) return CHANNEL.unknown;

      return succeeds(tag, fields, mayHaveApplied) ? CHANNEL.success : CHANNEL.failure;
    };

    return Answer.$match(answer, {
      Ok: () => CHANNEL.success,
      Fail: ({ tag, fields }) => tagged(tag, fields),
      FailButLanded: ({ tag, fields }) => tagged(tag, fields),
      Lost: () => CHANNEL.unknown,
      LostButLanded: () => CHANNEL.unknown,
      Never: () => CHANNEL.unknown,
      Die: () => CHANNEL.unknown,
    });
  };

/**
 * Flow's own reasons for a failure, `NotSent { why }` (WriteLanes R3's closed list).
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

  if (channel === "unknown") return Option.some(operation.unknown);

  const tagged = Option.fromUndefinedOr(operation.failure[reason]);

  if (Option.isSome(tagged) || !FLOW_DECLINES.includes(reason)) return tagged;

  return Option.fromUndefinedOr(operation.failure["NotSent"]);
};
