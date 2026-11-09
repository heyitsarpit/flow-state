import { Data, Option, Result, Schema } from "effect";
import { type ActorRef, Channel, EvidenceKind, Observation, type RecordedWhy } from "../port.ts";

/**
 * A report the prototype gave in a shape the adapter cannot read: the runtime broke its own
 * evidence contract, so the case stops.
 */
export class PrototypeReportUnreadable extends Data.TaggedError("PrototypeReportUnreadable")<{
  readonly kind: string;
  readonly issue: string;
}> {}

/**
 * The actor a prototype actor key names: `<machine>/<id>`, with `%`, `/` and `|` in the id
 * percent-encoded.
 */
export const actorRef = (key: string) => {
  const at = key.lastIndexOf("/");

  return { machine: key.slice(0, at), id: decodeURIComponent(key.slice(at + 1)) };
};

const attemptOf = (attempt: Option.Option<string>) => Option.filter(attempt, (id) => id !== "");

const OptionalText = Schema.OptionFromOptionalNullOr(Schema.String);

/**
 * One untyped report of the prototype's evidence, decoded once with the Schema its `kind` names.
 */
// FLOW_STATE_ALLOW_UNKNOWN: the prototype's reports are untyped; `read` decodes each with its kind's Schema.
type Report = unknown;

const Kind = Schema.Struct({ kind: Schema.String });

const kindOf = (report: Report) =>
  Result.getOrThrowWith(
    Schema.decodeUnknownResult(Kind)(report),
    (issue) => new PrototypeReportUnreadable({ kind: "(no kind)", issue: String(issue) }),
  ).kind;

const reports = {
  turn: Schema.Struct({
    actor: Schema.String,
    event: Schema.String,
    from: Schema.String,
    to: Schema.String,
  }),
  mint: Schema.Struct({ op: Schema.String, attempt: Schema.String }),
  invoked: Schema.Struct({ op: Schema.String, attempt: Schema.String }),
  ending: Schema.Struct({
    op: Schema.String,
    attempt: OptionalText,
    channel: Channel,
    reason: Schema.String,
  }),
  delivered: Schema.Struct({ op: Schema.String, attempt: OptionalText, event: OptionalText }),
  evidence: Schema.Struct({ kind: EvidenceKind, op: Schema.String, attempt: OptionalText }),
  onLane: Schema.Struct({ op: Schema.String, attempt: OptionalText }),
  unhandled: Schema.Struct({ event: Schema.String }),
  denied: Schema.Struct({ event: Schema.String, reasons: Schema.Array(Schema.String) }),
};

const RECORDED = new Map<string, RecordedWhy>([
  ["ignored", "ignored"],
  ["evidenceOnly", "evidence"],
  ["KeptLetGo", "letGo"],
  ["ParkedLetGo", "letGo"],
]);

const read = <A, E>(schema: Schema.Codec<A, E>, report: Report, kind: string) =>
  Result.getOrThrowWith(
    Schema.decodeUnknownResult(schema)(report),
    (issue) => new PrototypeReportUnreadable({ kind, issue: String(issue) }),
  );

// RETURN_TYPE: each branch builds one variant; inference keeps a union of Options, not one Option.
const laneReport = (report: Report, kind: string): Option.Option<Observation> => {
  if (kind === "Disposed") return Option.some(Observation.RuntimeDisposed());

  if (kind === "Unhandled") {
    const r = read(reports.unhandled, report, kind);

    return Option.some(Observation.Unhandled({ event: r.event }));
  }

  if (kind === "Denied") {
    const r = read(reports.denied, report, kind);

    return Option.some(Observation.Denied({ event: r.event, reasons: r.reasons }));
  }

  if (kind === "parked" || kind === "unparked") {
    const r = read(reports.onLane, report, kind);
    const at = { operation: r.op, attempt: attemptOf(r.attempt) };

    return Option.some(kind === "parked" ? Observation.Parked(at) : Observation.Unparked(at));
  }

  const why = Option.fromUndefinedOr(RECORDED.get(kind));

  if (Option.isSome(why)) {
    const r = read(reports.onLane, report, kind);

    return Option.some(
      Observation.Recorded({ operation: r.op, attempt: attemptOf(r.attempt), why: why.value }),
    );
  }

  if (!Schema.is(EvidenceKind)(kind)) return Option.none();
  const r = read(reports.evidence, report, kind);

  return Option.some(
    Observation.Evidence({ kind: r.kind, operation: r.op, attempt: attemptOf(r.attempt) }),
  );
};

// RETURN_TYPE: each branch builds one variant; inference keeps a union of Options, not one Option.
const observationOf = (report: Report): Option.Option<Observation> => {
  const kind = kindOf(report);

  if (kind === "turn") {
    const r = read(reports.turn, report, kind);

    return Option.some(
      Observation.Turn({ actor: actorRef(r.actor), event: r.event, from: r.from, to: r.to }),
    );
  }

  if (kind === "mint") {
    const r = read(reports.mint, report, kind);

    return Option.some(
      Observation.Minted({
        operation: r.op,
        attempt: r.attempt,
        actor: Option.none(),
        key: Option.none(),
      }),
    );
  }

  if (kind === "invoked") {
    const r = read(reports.invoked, report, kind);

    return Option.some(Observation.Sent({ operation: r.op, attempt: r.attempt }));
  }

  if (kind === "ending") {
    const r = read(reports.ending, report, kind);

    return Option.some(
      Observation.Ended({
        operation: r.op,
        attempt: attemptOf(r.attempt),
        channel: r.channel,
        reason: r.reason,
        actor: Option.none(),
        failure: Option.none(),
      }),
    );
  }

  if (kind === "delivered") {
    const r = read(reports.delivered, report, kind);
    const event = Option.getOrElse(r.event, () => "(unmapped)");

    return Option.some(
      Observation.Delivered({
        operation: r.op,
        attempt: attemptOf(r.attempt),
        event,
        actor: Option.none(),
      }),
    );
  }

  return laneReport(report, kind);
};

// RETURN_TYPE: a spread of one variant stays that variant; the caller needs the union.
const owned = (observed: Observation, actor: Option.Option<ActorRef>): Observation => {
  if (Observation.$is("Minted")(observed) || Observation.$is("Delivered")(observed))
    return { ...observed, actor };

  if (Observation.$is("Ended")(observed) && Option.isNone(observed.attempt))
    return { ...observed, actor };

  return observed;
};

const attributed = (batch: ReadonlyArray<Observation>) => {
  const out: Array<Observation> = [];
  let next = Option.none<ActorRef>();

  for (const observed of [...batch].toReversed()) {
    if (Observation.$is("Turn")(observed)) next = Option.some(observed.actor);
    out.push(owned(observed, next));
  }

  return out.toReversed();
};

/**
 * The Port's observations in one batch of the prototype's evidence, in order.
 *
 * **Details**
 *
 * - Each report is decoded once, with the Schema its `kind` names; reports of other kinds (the
 *   prototype's internal ones) are dropped.
 * - The prototype reports no actor on a mint, a decline or a delivery; each is attributed to the
 *   turn that follows it in the same batch (README decision 10, a prototype limit).
 *
 * **Gotchas**
 *
 * - Throws `PrototypeReportUnreadable` when a report has no `kind` or a report of a known kind
 *   does not decode. The prototype catches a throw from its evidence sink and reports it as a
 *   `SinkFailed` issue, dropping the batch.
 */
export const observationsOf = (batch: ReadonlyArray<Report>) =>
  attributed(batch.flatMap((raw) => Option.toArray(observationOf(raw))));
