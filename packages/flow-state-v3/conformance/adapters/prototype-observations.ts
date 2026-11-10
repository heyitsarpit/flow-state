import { Data, Option, Result, Schema } from "effect";
import {
  Channel,
  EvidenceKind,
  MemberKind,
  MemberTarget,
  Observation,
  type RecordedWhy,
} from "../port.ts";

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

/**
 * The place round-14's turn record gives a schedule trigger with no handler; its graph names that
 * edge `trigger:<node>:<event>`.
 */
const IMPLICIT = "implicit";

const OptionalText = Schema.OptionFromOptionalNullOr(Schema.String);

const Target = Schema.Union([
  Schema.Struct({ t: Schema.Literal("only") }),
  Schema.Struct({ t: Schema.Literal("key"), key: Schema.Json }),
  Schema.Struct({ t: Schema.Literal("every") }),
]);

const targetOf = (target: typeof Target.Type) => {
  if (target.t === "key") return MemberTarget.Key({ key: target.key });

  return target.t === "only" ? MemberTarget.Only() : MemberTarget.Every();
};

const memberOf = (m: {
  readonly op: string;
  readonly kind: MemberKind;
  readonly target: typeof Target.Type;
}) => ({ operation: m.op, kind: m.kind, target: targetOf(m.target) });

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
    parts: Schema.Array(
      Schema.Struct({
        path: Schema.Array(Schema.String),
        definition: Schema.String,
        at: Schema.String,
        node: Schema.String,
        tag: Schema.String,
        target: Schema.String,
      }),
    ),
    members: Schema.Array(Schema.Struct({ op: Schema.String, kind: MemberKind, target: Target })),
  }),
  mint: Schema.Struct({
    op: Schema.String,
    attempt: Schema.String,
    actor: OptionalText,
    key: Schema.OptionFromOptionalNullOr(Schema.Json),
  }),
  invoked: Schema.Struct({ op: Schema.String, attempt: Schema.String }),
  ending: Schema.Struct({
    op: Schema.String,
    attempt: OptionalText,
    channel: Channel,
    reason: Schema.String,
    actor: OptionalText,
  }),
  delivered: Schema.Struct({
    op: Schema.String,
    attempt: OptionalText,
    event: OptionalText,
    actor: OptionalText,
  }),
  incarnation: Schema.Struct({ actor: Schema.String }),
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

  if (kind === "incarnation" || kind === "ended") {
    const actor = actorRef(read(reports.incarnation, report, kind).actor);

    return Option.some(
      kind === "incarnation" ? Observation.Incarnated({ actor }) : Observation.Finished({ actor }),
    );
  }

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
      Observation.Turn({
        actor: actorRef(r.actor),
        event: r.event,
        from: r.from,
        to: r.to,
        parts: r.parts.map((p) => ({
          part: p.path,
          definition: p.definition,
          at: p.at === IMPLICIT ? `trigger:${p.node}:${p.tag}` : p.at,
          node: p.node,
          target: p.target,
        })),
        members: r.members.map(memberOf),
      }),
    );
  }

  if (kind === "mint") {
    const r = read(reports.mint, report, kind);

    return Option.some(
      Observation.Minted({
        operation: r.op,
        attempt: r.attempt,
        actor: Option.map(r.actor, actorRef),
        key: r.key,
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
        actor: Option.isNone(attemptOf(r.attempt)) ? Option.map(r.actor, actorRef) : Option.none(),
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
        actor: Option.map(r.actor, actorRef),
      }),
    );
  }

  return laneReport(report, kind);
};

/**
 * The Port's observations in one batch of the prototype's evidence, in order.
 *
 * **Details**
 *
 * - Each report is decoded once, with the Schema its `kind` names; reports of other kinds (the
 *   prototype's internal ones) are dropped.
 * - A mint, a decline and a delivery name their actor; a report of a mutated runtime that drops it
 *   reads as `None`.
 *
 * **Gotchas**
 *
 * - Throws `PrototypeReportUnreadable` when a report has no `kind` or a report of a known kind
 *   does not decode. The prototype catches a throw from its evidence sink and reports it as a
 *   `SinkFailed` issue, dropping the batch.
 */
export const observationsOf = (batch: ReadonlyArray<Report>) =>
  batch.flatMap((raw) => Option.toArray(observationOf(raw)));
