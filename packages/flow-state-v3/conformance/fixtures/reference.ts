import { Option } from "effect";
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

const classifyWith =
  (
    succeeds: (
      tag: string,
      fields: Readonly<Record<string, unknown>>,
      mayHaveApplied: boolean,
    ) => boolean,
  ) =>
  (answer: Answer, mayHaveApplied: boolean): Channel =>
    Answer.$match(answer, {
      Ok: () => "success",
      Fail: ({ tag, fields }) => {
        if (LOST.includes(tag)) return "unknown";

        return succeeds(tag, fields, mayHaveApplied) ? "success" : "failure";
      },
      Lost: () => "unknown",
      LostButLanded: () => "unknown",
      Never: () => "unknown",
      Die: () => "unknown",
    });

const capturable = (fields: Readonly<Record<string, unknown>>) =>
  fields["status"] === "requires_capture" || fields["status"] === "succeeded";

const pay: Readonly<Record<string, OperationReference>> = {
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
};

/**
 * Every fixture's reference, by the catalog name a scenario boots it by.
 *
 * **Details**
 *
 * `pay` is the typed Pay fixture (`prototypes/conformance/typed/pay.ts`), machine `Checkout/Pay`.
 * Its reads (`intent`, `order`) have no Attempts and are not listed yet.
 */
export const references: Readonly<Record<string, Reference>> = {
  pay: { "Checkout/Pay": pay },
};

/**
 * The one operation of this name among a case's fixtures; none when no fixture or two fixtures
 * declare it.
 *
 * **Gotchas**
 *
 * - The Port's endings name an operation, not its machine, so an operation name two machines share
 *   is not checked by name.
 */
export const operationNamed = (
  reference: Reference,
  name: string,
): Option.Option<OperationReference> => {
  const found = Object.values(reference).flatMap((operations) =>
    Object.hasOwn(operations, name) ? [operations[name]] : [],
  );

  const [only] = found;

  return found.length === 1 && only !== undefined ? Option.some(only) : Option.none();
};

/**
 * The event an ending of `operation` maps to, by its channel and reason.
 *
 * **Details**
 *
 * A failure's reason is its tag, or the `why` of a Flow decline, which maps through `NotSent`.
 */
export const mappedEvent = (
  operation: OperationReference,
  channel: Channel,
  reason: string,
): Option.Option<string> => {
  if (channel === "success") return Option.some(operation.success);

  if (channel === "unknown") return Option.some(operation.unknown);

  return Option.fromUndefinedOr(operation.failure[reason] ?? operation.failure["NotSent"]);
};
