import { Option, Predicate, Result, Schema } from "effect";
import {
  type ActorRef,
  Channel,
  DisposeExit,
  EvidenceKind,
  MemberKind,
  MemberTarget,
  Observation,
  type RecordedWhy,
  Unreadable,
} from "../port.ts";

/**
 * The actor a prototype actor key names: `<machine>/<id>`, with `%`, `/` and `|` in the id
 * percent-encoded. A key with no machine or a malformed escape is {@link Unreadable}.
 */
export const actorRef = (key: string) => {
  const at = key.lastIndexOf("/");
  const unreadable = () => new Unreadable({ report: "actor key", issue: `cannot read ${key}` });

  if (at <= 0) return Result.fail(unreadable());

  return Result.map(
    Result.try({ try: () => decodeURIComponent(key.slice(at + 1)), catch: unreadable }),
    (id) => ({ machine: key.slice(0, at), id }),
  );
};

const optionalActor = (key: Option.Option<string>) =>
  Option.match(key, {
    onNone: () => Result.succeed(Option.none<ActorRef>()),
    onSome: (k) => Result.map(actorRef(k), Option.some),
  });

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
  Schema.Struct({ t: Schema.Literal("nothing") }),
]);

const targetOf = (target: typeof Target.Type) => {
  if (target.t === "key") return MemberTarget.Key({ key: target.key });

  if (target.t === "nothing") return MemberTarget.Nothing();

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
  Result.mapBoth(Schema.decodeUnknownResult(Kind)(report), {
    onFailure: (issue) => new Unreadable({ report: "(no kind)", issue: String(issue) }),
    onSuccess: (r) => r.kind,
  });

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
    // FLOW_STATE_ALLOW_UNKNOWN: a key that is not JSON reads as missing, so the Case names the field.
    key: Schema.optional(Schema.Unknown),
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
  // FLOW_STATE_ALLOW_UNKNOWN: the published memory is the runtime's own object; its identity is read before it is decoded.
  published: Schema.Struct({ actor: Schema.String, state: Schema.String, memory: Schema.Unknown }),
};

const RECORDED = new Map<string, RecordedWhy>([
  ["ignored", "ignored"],
  ["evidenceOnly", "evidence"],
  ["KeptLetGo", "letGo"],
  ["ParkedLetGo", "letGo"],
]);

const read = <A, E>(schema: Schema.Codec<A, E>, report: Report, kind: string) =>
  Result.mapError(
    Schema.decodeUnknownResult(schema)(report),
    (issue) => new Unreadable({ report: kind, issue: String(issue) }),
  );

const laneReport = (report: Report, kind: string) =>
  Result.gen(function* () {
    if (kind === "Disposed") return Option.some<Observation | DisposeExit>(DisposeExit.Done());

    if (kind === "incarnation" || kind === "ended") {
      const actor = yield* actorRef((yield* read(reports.incarnation, report, kind)).actor);

      return Option.some(
        kind === "incarnation"
          ? Observation.Incarnated({ actor })
          : Observation.Finished({ actor }),
      );
    }

    if (kind === "Unhandled") {
      const r = yield* read(reports.unhandled, report, kind);

      return Option.some(Observation.Unhandled({ event: r.event }));
    }

    if (kind === "Denied") {
      const r = yield* read(reports.denied, report, kind);

      return Option.some(Observation.Denied({ event: r.event, reasons: r.reasons }));
    }

    if (kind === "parked" || kind === "unparked") {
      const r = yield* read(reports.onLane, report, kind);
      const at = { operation: r.op, attempt: attemptOf(r.attempt) };

      return Option.some(kind === "parked" ? Observation.Parked(at) : Observation.Unparked(at));
    }

    const why = Option.fromUndefinedOr(RECORDED.get(kind));

    if (Option.isSome(why)) {
      const r = yield* read(reports.onLane, report, kind);

      return Option.some(
        Observation.Recorded({ operation: r.op, attempt: attemptOf(r.attempt), why: why.value }),
      );
    }

    if (!Schema.is(EvidenceKind)(kind)) return Option.none();
    const r = yield* read(reports.evidence, report, kind);

    return Option.some(
      Observation.Evidence({ kind: r.kind, operation: r.op, attempt: attemptOf(r.attempt) }),
    );
  });

// RETURN_TYPE: each branch builds one variant; inference keeps a union of Options, not one Option.
/**
 * The identity of a published object, the same number for the same object (Turn R24).
 */
export type Identify = (value: WeakKey) => number;

const observationOf = (report: Report, identify: Identify) =>
  Result.gen(function* () {
    const kind = yield* kindOf(report);

    if (kind === "published") {
      const r = yield* read(reports.published, report, kind);
      const memory = yield* read(Schema.Json, r.memory, "published memory");

      return Option.some(
        Observation.Published({
          actor: yield* actorRef(r.actor),
          state: r.state,
          memory,
          memoryId: Predicate.isObject(r.memory) ? identify(r.memory) : 0,
        }),
      );
    }

    if (kind === "turn") {
      const r = yield* read(reports.turn, report, kind);

      return Option.some(
        Observation.Turn({
          actor: yield* actorRef(r.actor),
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
      const r = yield* read(reports.mint, report, kind);

      return Option.some(
        Observation.Minted({
          operation: r.op,
          attempt: r.attempt,
          actor: yield* optionalActor(r.actor),
          key: Option.liftPredicate(r.key, Schema.is(Schema.Json)),
        }),
      );
    }

    if (kind === "invoked") {
      const r = yield* read(reports.invoked, report, kind);

      return Option.some(Observation.Sent({ operation: r.op, attempt: r.attempt }));
    }

    if (kind === "ending") {
      const r = yield* read(reports.ending, report, kind);

      return Option.some(
        Observation.Ended({
          operation: r.op,
          attempt: attemptOf(r.attempt),
          channel: r.channel,
          reason: r.reason,
          actor: Option.isNone(attemptOf(r.attempt))
            ? yield* optionalActor(r.actor)
            : Option.none(),
          failure: Option.none(),
        }),
      );
    }

    if (kind === "delivered") {
      const r = yield* read(reports.delivered, report, kind);
      const event = Option.getOrElse(r.event, () => "(unmapped)");

      return Option.some(
        Observation.Delivered({
          operation: r.op,
          attempt: attemptOf(r.attempt),
          event,
          actor: yield* optionalActor(r.actor),
        }),
      );
    }

    return yield* laneReport(report, kind);
  });

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
 * - A report with no `kind`, or of a known kind that does not decode, is an {@link Unreadable}
 *   failure in its place; the reports around it are kept.
 */
// RETURN_TYPE: one Result per readable report, its failure in an unreadable one's place.
export const observationsOf = (
  batch: ReadonlyArray<Report>,
  identify: Identify,
): ReadonlyArray<Result.Result<Observation | DisposeExit, Unreadable>> =>
  batch.flatMap((raw) => {
    const read: Result.Result<Option.Option<Observation | DisposeExit>, Unreadable> = observationOf(
      raw,
      identify,
    );

    const out: ReadonlyArray<Result.Result<Observation | DisposeExit, Unreadable>> =
      Result.isFailure(read)
        ? [Result.fail(read.failure)]
        : Option.toArray(read.success).map((o) => Result.succeed(o));

    return out;
  });
