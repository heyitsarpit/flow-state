import { Result, Schema } from "effect";
import { Decline, IssueCode } from "./vocabulary.ts";

/**
 * Flow's record format, one number for every kind of record.
 */
export const FORMAT = 6;

// A count the writer saves: a non-negative integer.
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * An Attempt id in the form the mint makes it: `att-`, the session seed (at least 128 bits as hex),
 * and the Runtime's count. The only Attempt ids a saved record may hold.
 */
export const AttemptId = Schema.String.check(
  Schema.isPattern(/^att-[0-9a-f]{32,}-[1-9]\d*$/u),
).pipe(Schema.brand("flow-state/AttemptId"));

const Failed = Schema.Struct({ code: IssueCode, slot: Schema.String });

/**
 * A schedule's saved timer, as a position holds it (`Schedules`' saved form): a keyed one's key as
 * its key Schema encodes it, its `restartOn` baseline's canonical text and that check's last
 * failure, the pause reasons it last read true, its arming, and its last firing's failure. An absent
 * field is the clean outcome.
 */
export const SavedTimer = Schema.Struct({
  key: Schema.optionalKey(Schema.Json),
  selection: Schema.optionalKey(Schema.String),
  selectionFailed: Schema.optionalKey(Failed),
  reasons: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)),
  arming: Schema.Union([
    Schema.TaggedStruct("Idle", {}),
    Schema.TaggedStruct("Refused", { code: IssueCode, slot: Schema.String }),
    Schema.TaggedStruct("Due", { armedAt: Count, attempt: Count, dueAt: Count }),
    Schema.TaggedStruct("Held", { armedAt: Count, attempt: Count, left: Count }),
  ]),
  firing: Schema.optionalKey(Failed),
});

/**
 * The decoded {@link SavedTimer}.
 */
export type SavedTimer = typeof SavedTimer.Type;

const ScheduleMap = Schema.Record(
  Schema.String,
  Schema.Union([SavedTimer, Schema.Array(SavedTimer)]),
);

/**
 * A position's schedules: by the state path of the scope, then by name, an unkeyed schedule's one
 * timer or a keyed one's timers in key-text order.
 */
export const SavedSchedules = Schema.Record(Schema.String, ScheduleMap);

/**
 * The decoded {@link SavedSchedules}.
 */
export type SavedSchedules = typeof SavedSchedules.Type;

const Provider = Schema.Struct({ machine: Schema.String, name: Schema.String });

const Baseline = Schema.Struct({ value: Schema.optionalKey(Schema.Json) });

/**
 * One context slot as a position saves it: its provider, its last selection, and each of its
 * reactions' baselines that differ from that selection, by the reaction's event.
 */
const Slot = Schema.Struct({
  provider: Schema.optionalKey(Provider),
  seen: Schema.optionalKey(Schema.Struct({ value: Schema.Json })),
  baselines: Schema.Record(Schema.String, Baseline),
});

const Instance = Schema.Struct({
  status: Schema.Literals(["Live", "Frozen"]),
  reset: Schema.optionalKey(Schema.String),
  memory: Schema.Record(Schema.String, Schema.Json),
  schedules: ScheduleMap,
});

const PositionFields = Schema.Struct({
  state: Schema.String,
  memory: Schema.Record(Schema.String, Schema.Json),
  schedules: SavedSchedules,
  slots: Schema.Record(Schema.String, Slot),
  graph: Schema.Record(Schema.String, Schema.Record(Schema.String, Provider)),
  instances: Schema.Record(Schema.String, Instance),
});

const filled = <V>(map: Readonly<Record<string, V>>) => Object.keys(map).length > 0;

/**
 * Where an identity was, exactly as the writer saves it: its state, its memory without the fields
 * its name holds, its schedules, one entry per slot that holds something, the wiring of providers
 * that keep no record of their own (never an empty one), and no instances yet.
 */
export const Position = PositionFields.check(
  Schema.makeFilter((p) => Object.values(p.graph).every(filled), {
    expected: "each provider's wiring holds a slot",
  }),
  Schema.makeFilter(
    (p) =>
      Object.values(p.slots).every(
        (slot) => slot.provider !== undefined || slot.seen !== undefined || filled(slot.baselines),
      ),
    { expected: "each slot entry holds something" },
  ),
  Schema.makeFilter((p) => !filled(p.instances), { expected: "no instances" }),
);

/**
 * A position an older format steps to: the current shape, without the writer's normal form, since
 * a step keeps what it cannot judge for stage 2.
 */
export const SteppedPosition = PositionFields;

/**
 * The decoded {@link Position}.
 */
export type Position = typeof Position.Type;

/**
 * An ending as a format 5 record saved it, stepped: any channel, reason and value.
 */
export const SavedEnding = Schema.Struct({
  channel: Schema.Literals(["success", "failure", "unknown", "notSent"]),
  reason: Schema.String,
  value: Schema.optionalKey(Schema.Json),
});

/**
 * The decoded {@link SavedEnding}.
 */
export type SavedEnding = typeof SavedEnding.Type;

// A decline's value names its own reason.
const ownReason = Schema.makeFilter(
  (e: { readonly reason: string; readonly value: { readonly why: string } }) =>
    e.reason === e.value.why,
  { expected: "the decline's own reason" },
);

// A decline as the writer saves it: one of Flow's reasons, its value naming the same reason.
const DeclineEnding = Schema.Struct({
  channel: Schema.Literal("notSent"),
  reason: Decline,
  value: Schema.Struct({ why: Decline }),
}).check(ownReason);

// The decline of a commit whose input had no encoded form.
const UnencodableEnding = Schema.Struct({
  channel: Schema.Literal("notSent"),
  reason: Schema.Literal("Unencodable"),
  value: Schema.Struct({ why: Decline }),
}).check(ownReason);

// An unknown as the writer saves it: its reason, and its value unless Flow made it.
const UnknownEnding = Schema.Struct({
  channel: Schema.Literal("unknown"),
  reason: Schema.String,
  value: Schema.optionalKey(Schema.Json),
});

// An ending exactly as the writer saves a row's: a success, a failure, an unknown or a decline.
const RowEnding = Schema.Union([
  Schema.Struct({
    channel: Schema.Literal("success"),
    reason: Schema.Literal("success"),
    value: Schema.optionalKey(Schema.Json),
  }),
  Schema.Struct({
    channel: Schema.Literal("failure"),
    reason: Schema.String,
    value: Schema.optionalKey(Schema.Json),
  }),
  UnknownEnding,
  DeclineEnding,
]);

const Head = Schema.Struct({
  attempt: AttemptId,
  rest: Schema.Json,
  retryCount: Count,
  hold: Schema.Literals(["Out", "Held"]),
  unknown: Schema.optionalKey(Schema.Struct({ ending: UnknownEnding, kept: Schema.Boolean })),
  claims: Schema.Tuple([]),
});

const DisplacedAttempt = Schema.Struct({
  attempt: AttemptId,
  rest: Schema.optionalKey(Schema.Json),
});

/**
 * A lane as a work record saves it: a head with the commits queued behind it, or only the displaced
 * Attempts it still owes; never empty.
 */
export const Lane = Schema.Union([
  Schema.Struct({
    head: Head,
    queue: Schema.Array(Schema.Json),
    displaced: Schema.Array(DisplacedAttempt),
  }),
  Schema.Struct({
    queue: Schema.Tuple([]),
    displaced: Schema.NonEmptyArray(DisplacedAttempt),
  }),
]);

/**
 * The decoded {@link Lane}.
 */
export type SavedLane = typeof Lane.Type;

/**
 * The decoded {@link Head}.
 */
export type SavedHead = typeof Head.Type;

/**
 * An owed row as a work record saves it: where its lane is, its Attempt (none for a decline or a
 * queued commit), the input without its key fields, its ending and whether it is kept. A decline
 * whose input had no encoded form has no key and no rest; a row a format 5 record stepped to, which
 * the writer only ever writes back as it was carried, has no rest.
 */
export const Row = Schema.Union([
  Schema.Struct({
    subject: Schema.String,
    contract: Schema.String,
    keyText: Schema.String,
    attempt: Schema.optionalKey(AttemptId),
    rest: Schema.Json,
    ending: RowEnding,
    kept: Schema.Boolean,
  }),
  Schema.Struct({
    subject: Schema.String,
    contract: Schema.String,
    keyText: Schema.optionalKey(Schema.Never),
    attempt: Schema.optionalKey(Schema.Never),
    rest: Schema.optionalKey(Schema.Never),
    ending: UnencodableEnding,
    kept: Schema.Boolean,
  }),
  Schema.Struct({
    subject: Schema.String,
    contract: Schema.String,
    keyText: Schema.optionalKey(Schema.String),
    attempt: Schema.optionalKey(AttemptId),
    rest: Schema.optionalKey(Schema.Never),
    ending: SavedEnding,
    kept: Schema.Boolean,
  }),
]);

/**
 * The decoded {@link Row}.
 */
export type SavedRow = typeof Row.Type;

const NonEmptyRecord = <S extends Schema.Top>(value: S) =>
  Schema.Record(Schema.String, value).check(
    Schema.makeFilter((map) => Object.keys(map).length > 0, { expected: "a map with an entry" }),
  );

// Every Attempt id a work body holds: in its heads, its displaced lists and its rows.
const attemptsOf = (work: {
  readonly lanes: {
    readonly [s: string]: { readonly [c: string]: { readonly [k: string]: SavedLane } };
  };
  readonly rows: ReadonlyArray<SavedRow>;
}) => [
  ...Object.values(work.lanes).flatMap((byContract) =>
    Object.values(byContract).flatMap((byKey) =>
      Object.values(byKey).flatMap((lane) =>
        "head" in lane
          ? [lane.head.attempt, ...lane.displaced.map((d) => d.attempt)]
          : lane.displaced.map((d) => d.attempt),
      ),
    ),
  ),
  ...work.rows.flatMap((r) => (r.attempt === undefined ? [] : [r.attempt])),
];

/**
 * What an identity is owed: its lanes by subject, contract and key text, and its rows in the order
 * they were owed. It holds a lane or a row, and no Attempt id twice.
 */
export const Work = Schema.Struct({
  lanes: Schema.Record(Schema.String, NonEmptyRecord(NonEmptyRecord(Lane))),
  rows: Schema.Array(Row),
}).check(
  Schema.makeFilter((work) => Object.keys(work.lanes).length > 0 || work.rows.length > 0, {
    expected: "a lane or a row",
  }),
  Schema.makeFilter(
    (work) => {
      const attempts = attemptsOf(work);

      return new Set(attempts).size === attempts.length;
    },
    { expected: "each Attempt once" },
  ),
);

/**
 * The decoded {@link Work}.
 */
export type Work = typeof Work.Type;

const envelopeOf = <S extends Schema.Top>(body: S) =>
  Schema.Struct({ body, format: Schema.Literal(FORMAT), shape: Schema.optionalKey(Schema.String) });

/**
 * A position record's envelope.
 */
export const PositionRecord = envelopeOf(Position);

/**
 * A work record's envelope.
 */
export const WorkRecord = envelopeOf(Work);

/**
 * A record's format, read before its body: a format this build writes or steps from, or a newer
 * one.
 */
export const FormatOf = Schema.Struct({
  format: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});

/**
 * A stored JSON value decoded by a record Schema, strictly: a member the Schema does not name
 * fails. A Schema whose own code throws fails too.
 */
export const strictly =
  <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  // FLOW_STATE_ALLOW_UNKNOWN: a canonical JSON value, decoded here once by its kind's Schema.
  (value: unknown) =>
    Result.flatMap(
      Result.try({
        try: () => Schema.decodeUnknownResult(schema)(value, { onExcessProperty: "error" }),
        catch: () => "schema" as const,
      }),
      (decoded) => Result.mapError(decoded, () => "schema" as const),
    );

/**
 * A value encoded by a record Schema, strictly, as the writer saves it: a value the Schema does not
 * describe, a member it does not name included, fails as `shape`. The writer encodes every part it
 * writes with the Schema the boot decodes it with, so a decode accepts only what an encode makes.
 */
export const encodedBy =
  <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
  // FLOW_STATE_ALLOW_UNKNOWN: a part the writer built, checked here by its kind's Schema.
  (value: unknown) =>
    Result.flatMap(
      Result.try({
        try: () => Schema.encodeUnknownResult(schema)(value, { onExcessProperty: "error" }),
        catch: () => "shape" as const,
      }),
      (encoded) => Result.mapError(encoded, () => "shape" as const),
    );
