import { Data, Option } from "effect";
import type { Channel } from "../port.ts";
import { Answer } from "../world/network.ts";

/**
 * What the suite expects of one operation of a fixture, written by hand from the fixture's source.
 *
 * **Details**
 *
 * - `attempts`: a write, whose sends are Attempts with ids on the wire.
 * - `success`, `failure` (by tag, `NotSent` for Flow's declines) and `unknown`: the event each
 *   ending maps to.
 * - `classify`: the channel the operation's commit gives the server's answer, given whether an
 *   earlier send of the same Attempt ended unknown. A tag the commit turns into a success or an
 *   unknown is named here; the Spec's rules on top of it (StillUnknown) are the oracle's.
 */
export type OperationReference = {
  readonly attempts: boolean;
  readonly success: string;
  readonly failure: Readonly<Record<string, string>>;
  readonly unknown: string;
  readonly classify: (answer: Answer, mayHaveApplied: boolean) => Channel;
};

/**
 * The references of the fixtures one case runs, by machine id, then by operation.
 */
export type Reference = Readonly<Record<string, Readonly<Record<string, OperationReference>>>>;

const LOST = ["NoResponse", "ServerError"];

const CHANNEL = { success: "success", failure: "failure", unknown: "unknown" } as const;

const classifyWith =
  (
    succeeds: (
      tag: string,
      fields: Readonly<Record<string, unknown>>,
      mayHaveApplied: boolean,
    ) => boolean,
  ) =>
  (answer: Answer, mayHaveApplied: boolean) =>
    Answer.$match(answer, {
      Ok: () => CHANNEL.success,
      Fail: ({ tag, fields }) => {
        if (LOST.includes(tag)) return CHANNEL.unknown;

        return succeeds(tag, fields, mayHaveApplied) ? CHANNEL.success : CHANNEL.failure;
      },
      Lost: () => CHANNEL.unknown,
      LostButLanded: () => CHANNEL.unknown,
      Never: () => CHANNEL.unknown,
      Die: () => CHANNEL.unknown,
    });

const capturable = (fields: Readonly<Record<string, unknown>>) =>
  fields["status"] === "requires_capture" || fields["status"] === "succeeded";

const pay = {
  pay: {
    attempts: true,
    success: "Confirmed",
    failure: {
      CardDeclined: "Declined",
      Busy: "Busy",
      IntentBusy: "PayRefused",
      NotSent: "PayNotSent",
    },
    unknown: "PayUnsure",
    classify: classifyWith(
      (tag, fields, mayHaveApplied) => tag === "IntentBusy" && mayHaveApplied && capturable(fields),
    ),
  },
  place: {
    attempts: true,
    success: "Placed",
    failure: { NotSent: "PlaceRefused" },
    unknown: "PlaceUnsure",
    classify: classifyWith((tag) => tag === "OrderExists"),
  },
  void: {
    attempts: true,
    success: "Voided",
    failure: { AlreadyCaptured: "VoidRefused", NotSent: "Voided" },
    unknown: "VoidUnsure",
    classify: classifyWith(() => false),
  },
} satisfies Readonly<Record<string, OperationReference>>;

const catalog = new Map<string, Reference>([["pay", { "Checkout/Pay": pay }]]);

/**
 * A case named a fixture with no reference: a suite defect.
 */
export class NoReference extends Data.TaggedError("NoReference")<{ readonly fixture: string }> {}

/**
 * The reference of a case: the references of the fixtures it boots, by their catalog names.
 *
 * **Details**
 *
 * `pay` is the typed Pay fixture (`prototypes/conformance/typed/pay.ts`), machine `Checkout/Pay`.
 * Only its writes are referenced; its reads (`intent`, `order`) have no Attempts.
 *
 * **Gotchas**
 *
 * - Throws `NoReference` for a name the catalog lacks, so a misspelt fixture fails its case.
 */
export const referenceFor = (fixtures: ReadonlyArray<string>) =>
  Object.fromEntries(
    fixtures.flatMap((name) => {
      const found = catalog.get(name);

      if (found === undefined) throw new NoReference({ fixture: name });

      return Object.entries(found);
    }),
  ) satisfies Reference;

const FLOW_DECLINES = [
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
 * A failure's reason is its tag, or the `why` of a Flow decline (`NotSent { why }`, the closed
 * list of WriteLanes R3), which maps through `NotSent`. Any other reason has no mapping.
 */
export const mappedEvent = (operation: OperationReference, channel: Channel, reason: string) => {
  if (channel === "success") return Option.some(operation.success);

  if (channel === "unknown") return Option.some(operation.unknown);

  const tagged = Option.fromUndefinedOr(operation.failure[reason]);

  if (Option.isSome(tagged) || !FLOW_DECLINES.includes(reason)) return tagged;

  return Option.fromUndefinedOr(operation.failure["NotSent"]);
};
