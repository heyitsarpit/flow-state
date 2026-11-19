import { Option, Result, Schema } from "effect";
import { decodeCanonical } from "./codec.ts";
import { decodeActor, type RestoredActor } from "./actor-record.ts";
import {
  type AttemptId,
  AttemptIdSchema,
  type KeyParts,
  kindOfKey,
  type LaneKey,
  laneKeyOf,
  type LaneTail,
  laneTailOf,
  laneTailOfMachine,
  type NamedActor,
  type OperationName,
  operationNameOf,
  operationOfTail,
  readRecordKey,
  type RecordKey,
  type RecordKind,
} from "./identity.ts";
import type { Compiled, Operation } from "./compiled.ts";
import { walkerOf, type Walker } from "./boundary.ts";
import { NotSentWhy } from "./cells.ts";
import { defect } from "./defect.ts";
import { Count, digestOf, exact, FORMAT, reasonOf, textOf } from "./record-format.ts";
import { Decline } from "./vocabulary.ts";
import { keyTextOf } from "./lane-moves.ts";
import { type Owed, Route } from "./ledger.ts";
import { type ActorId, byCodeUnits, type Lane, Phase } from "./world.ts";

type OwedRow = Pick<Owed, "operation" | "lane" | "attempt" | "channel" | "reason" | "value"> & {
  readonly kept: boolean;
};

// An owed record's rows, by its machine, one Schema the writer encodes with and the boot decodes
// with, so a row is read only in a shape a release writes: an ending on its lane, of its Attempt,
// answered (on a definite or unknown channel, with the value it carries, if any) or never sent (its
// why); the unknown StorageRefused a store's refusal of a Held head's capture owes, of its Attempt
// with no lane; and a decline, with neither. A row on a lane names it by its place after the
// identity, and the lane's contract gives its operation; any other row names its operation.
const rowSchemaOf = (compiled: Compiled) => {
  const lane = laneTailOfMachine(compiled);
  const operation = operationNameOf(compiled);

  return Schema.toTaggedUnion("_tag")(
    Schema.Union([
      exact({
        _tag: Schema.Literal("Answered"),
        lane,
        attempt: AttemptIdSchema,
        channel: Schema.Literals(["success", "failure", "unknown"]),
        reason: Schema.String,
        value: Schema.optionalKey(Schema.Json),
        kept: Schema.Boolean,
      }),
      exact({
        _tag: Schema.Literal("Unsent"),
        lane,
        attempt: AttemptIdSchema,
        reason: NotSentWhy,
        kept: Schema.Boolean,
      }),
      exact({
        _tag: Schema.Literal("Refused"),
        operation,
        attempt: AttemptIdSchema,
        kept: Schema.Boolean,
      }),
      exact({ _tag: Schema.Literal("Declined"), operation, reason: Decline, kept: Schema.Boolean }),
    ]),
  );
};

// An owed record's Schema, by its machine: at least one row; an Attempt ends once, so no two rows
// hold a success, failure or NotSent of the same Attempt.
const owedSchemaOf = (compiled: Compiled) =>
  exact({
    format: Schema.Literal(FORMAT),
    rows: Schema.NonEmptyArray(rowSchemaOf(compiled)).check(
      Schema.makeFilter((rows) => {
        const ended = rows.flatMap((r) =>
          (r._tag === "Answered" && r.channel !== "unknown") || r._tag === "Unsent"
            ? [r.attempt]
            : [],
        );

        return new Set(ended).size === ended.length;
      }),
    ),
  });

// Each machine's owed record and row walkers, built once.
const owedWalkers = new WeakMap<
  Compiled,
  {
    readonly rows: ReturnType<typeof rowSchemaOf>;
    readonly row: ReturnType<typeof walkerOf<ReturnType<typeof rowSchemaOf>>>;
    readonly record: ReturnType<typeof walkerOf<ReturnType<typeof owedSchemaOf>>>;
  }
>();

const owedWalkersOf = (compiled: Compiled) => {
  const known = owedWalkers.get(compiled);

  if (known !== undefined) return known;

  const rows = rowSchemaOf(compiled);
  const made = { rows, row: walkerOf(rows), record: walkerOf(owedSchemaOf(compiled)) };
  owedWalkers.set(compiled, made);

  return made;
};

// A row on a lane as its kind saves it: never sent, with its why, or answered, with its value if
// it has one. A row with no Attempt is none a release owes: its encode fails.
const laneRowOf = (lane: string, r: OwedRow) => {
  const attempt = Option.getOrElse(r.attempt, () => "");

  if (r.channel === "notSent")
    return { _tag: "Unsent", lane, attempt, reason: r.reason, kept: r.kept };

  const answered = {
    _tag: "Answered",
    lane,
    attempt,
    channel: r.channel,
    reason: r.reason,
    kept: r.kept,
  };

  return r.value === undefined ? answered : { ...answered, value: r.value };
};

// A row as its kind saves it: on its lane; a store's refusal, of its Attempt with no lane; or a
// decline, with neither.
const rowOf = (actor: ActorId, r: OwedRow) =>
  Option.match(r.lane, {
    onSome: (lane) => laneRowOf(laneTailOf(actor, lane), r),
    onNone: () =>
      Option.match(r.attempt, {
        onSome: (attempt) => ({ _tag: "Refused", operation: r.operation, attempt, kept: r.kept }),
        onNone: () => ({
          _tag: "Declined",
          operation: r.operation,
          reason: r.reason,
          kept: r.kept,
        }),
      }),
  });

// A row whose value cannot be saved even alone is saved as the ending a crash before its save
// would have restored: its Attempt's unknown Restored. Only an answered row carries a value.
const unsaved = (r: OwedRow) =>
  ({ ...r, channel: "unknown", reason: "Restored", value: undefined }) satisfies OwedRow;

/**
 * An identity's saved rows as one canonical text, in owed order, each encoded by its machine's row
 * Schema. Every row is kept; a value with no canonical form is saved as its Attempt's unknown
 * Restored and counted in `unsaved`. A row no release owes is a defect.
 */
export const encodeOwed = (compiled: Compiled, actor: ActorId, rows: ReadonlyArray<OwedRow>) => {
  const walkers = owedWalkersOf(compiled);

  const encodes = (r: OwedRow) =>
    Result.isSuccess(Result.flatMap(walkers.row.encode(rowOf(actor, r)), textOf));

  const saved = rows.map((r) => {
    if (encodes(r)) return { row: rowOf(actor, r), lost: false };

    if (!encodes(unsaved(r)))
      return defect(`an owed row no release owes: ${r.operation} ${r.channel} ${r.reason}`);

    return { row: rowOf(actor, unsaved(r)), lost: true };
  });

  return Result.map(
    Result.flatMap(
      Result.mapError(
        walkers.record.encode({ format: FORMAT, rows: saved.map((s) => s.row) }),
        () => "rows",
      ),
      textOf,
    ),
    (text) => ({ text, unsaved: saved.filter((s) => s.lost).length }),
  );
};

// A lane record's Schemas, by its operation, one Schema the writer encodes with and the boot
// decodes with: a head with its input, which gives the key text its key names and the digest saved
// beside it, and the inputs queued behind it; or the displaced Attempts alone, at least one.
// Attempt ids never repeat, so no displaced Attempt is listed twice or is the head's own.
const laneSchemaOf = (operation: Operation) => {
  const head = exact({
    _tag: Schema.Literal("Head"),
    format: Schema.Literal(FORMAT),
    attempt: AttemptIdSchema,
    input: operation.inputJson,
    digest: Schema.String,
    retryCount: Count,
    inFlight: Schema.Boolean,
    queue: Schema.Array(operation.inputJson),
    displaced: Schema.Array(AttemptIdSchema),
  });

  const headless = exact({
    _tag: Schema.Literal("Displaced"),
    format: Schema.Literal(FORMAT),
    displaced: Schema.NonEmptyArray(AttemptIdSchema),
  });

  return exact({
    keyText: Schema.String,
    record: Schema.toTaggedUnion("_tag")(Schema.Union([head, headless])),
  }).check(
    Schema.makeFilter(
      ({ keyText, record }) =>
        new Set(record.displaced).size === record.displaced.length &&
        (record._tag === "Displaced" ||
          (!record.displaced.includes(record.attempt) &&
            Option.contains(keyTextOf(operation, record.input), keyText) &&
            Result.getOrUndefined(
              Result.map(operation.walk.input.text(record.input), (t) => digestOf(t.text)),
            ) === record.digest)),
    ),
  );
};

// Each operation's lane record walker, built once.
const laneWalkers = new WeakMap<
  Operation,
  ReturnType<typeof walkerOf<ReturnType<typeof laneSchemaOf>>>
>();

const laneWalkerOf = (operation: Operation) => {
  const known = laneWalkers.get(operation);

  if (known !== undefined) return known;

  const made = walkerOf(laneSchemaOf(operation));
  laneWalkers.set(operation, made);

  return made;
};

/**
 * A lane's record as canonical text, encoded by its operation's lane Schema: its Attempt with its
 * input and that input's digest, the retryCount it carries on the wire (a re-send waiting for this
 * capture counts itself), whether it is in flight, the inputs of the commits queued behind it, and
 * the Attempts of the displaced heads whose endings it owes. A lane gone Idle while it still owes a
 * displaced Attempt's ending keeps a record of those alone. Its identity, contract and key text are
 * its key.
 */
export const encodeLane = (
  compiled: Compiled,
  operationName: string,
  lane: Option.Option<Lane>,
  displaced: ReadonlyArray<string>,
) => {
  const operation = compiled.operations.get(operationName);

  if (operation === undefined) return Result.fail("operation");

  const record = Option.match(lane, {
    onNone: () =>
      Result.succeed({ keyText: "", record: { _tag: "Displaced", format: FORMAT, displaced } }),
    onSome: (l) =>
      Result.map(operation.walk.input.text(l.head.input), (input) => ({
        keyText: Option.getOrElse(keyTextOf(operation, l.head.input), () => ""),
        record: {
          _tag: "Head",
          format: FORMAT,
          attempt: l.head.id,
          input: l.head.input,
          digest: digestOf(input.text),
          retryCount: l.head.retryCount + (Phase.$is("Recapturing")(l.head.phase) ? 1 : 0),
          inFlight: !Phase.$is("Held")(l.head.phase),
          queue: l.queue.map((q) => q.input),
          displaced,
        },
      })),
  });

  return Result.flatMap(record, (r) =>
    Result.flatMap(
      Result.mapError(laneWalkerOf(operation).encode(r), () => "lane"),
      (encoded) => textOf(encoded.record),
    ),
  );
};

/**
 * A record the boot could not read: kept, unchanged, under its key, with the kind its prefix
 * names, if any.
 */
type Quarantined = {
  readonly key: string;
  readonly kind: Option.Option<RecordKind>;
  readonly reason: string;
};

/**
 * A saved Waiting or Kept row as a boot reads it back: owed to its identity, delivered current
 * from the active leaf.
 */
type RestoredRow = Omit<
  Owed,
  "id" | "delivery" | "to" | "actor" | "attempt" | "lane" | "operation"
> & {
  readonly actor: NamedActor;
  readonly operation: OperationName;
  readonly attempt: Option.Option<AttemptId>;
  readonly lane: Option.Option<LaneKey>;
  readonly kept: boolean;
};

/**
 * A lane as the boot reads it back: its Held head, if its record has one, under its Attempt.
 */
type RestoredLane = {
  readonly key: RecordKey;
  readonly id: LaneKey;
  readonly actor: NamedActor;
  readonly lane: Option.Option<Lane & { readonly head: Lane["head"] & { readonly id: AttemptId } }>;
  readonly inFlight: boolean;
  readonly endings: ReadonlyArray<RestoredRow>;
};

/**
 * What a boot reads back: actor records, lanes by the id their key names (with no lane when the
 * record holds only displaced Attempts), the rows each lane record owes, the saved rows, the
 * records it quarantined, and the actor records of machines no entry declares, which it discards.
 */
export type Restored = {
  readonly records: ReadonlyArray<RestoredActor>;
  readonly lanes: ReadonlyArray<RestoredLane>;
  readonly rows: ReadonlyArray<RestoredRow>;
  readonly quarantined: ReadonlyArray<Quarantined>;
  readonly discarded: ReadonlyArray<string>;
};

/**
 * Decodes the store's records with the machines they name, one record at a time.
 *
 * **Details**
 *
 * - Each key is read first: its kind, a declared and persisted machine, a name its identity reads,
 *   and for a lane the contract of a write operation and its key text.
 * - Each text must be canonical, carry the current `format` and decode by its kind's Schema,
 *   built from the machine its key names; any other record is quarantined and its bytes stay.
 * - An actor record of a machine no entry declares is discarded.
 * - Restored lanes are Held: an Attempt acknowledged once ends unknown `Restored`.
 */
// RETURN_TYPE: the Restored contract the step boots from.
export const decodeRecords = (
  machines: ReadonlyMap<string, Compiled>,
  stored: ReadonlyMap<string, string>,
): Restored => {
  const actorRecord = decodeActor(machines);
  const laneReader = (operation: Operation) => decodedBy(laneWalkerOf(operation));
  const owedReader = (compiled: Compiled) => decodedBy(owedWalkersOf(compiled).record);

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const rowsRecord = (parts: KeyParts, value: unknown) =>
    Result.map(owedReader(parts.compiled)(value), (r) =>
      r.rows.map((e) => {
        const of = { kept: e.kept, actor: parts.actor, route: Route.Current() };
        const why = (reason: string) => ({ why: reason });

        // A row on a lane takes its operation from the lane's contract.
        const onLane = (tail: LaneTail, attempt: AttemptId) => ({
          operation: operationOfTail(parts.compiled, tail),
          lane: Option.some(laneKeyOf(parts.actor, tail)),
          attempt: Option.some(attempt),
        });

        return owedWalkersOf(parts.compiled).rows.match(e, {
          Answered: (a) => ({
            ...of,
            ...onLane(a.lane, a.attempt),
            channel: a.channel,
            reason: a.reason,
            value: a.value,
          }),
          Unsent: (u) => ({
            ...of,
            ...onLane(u.lane, u.attempt),
            channel: "notSent" as const,
            reason: u.reason,
            value: why(u.reason),
          }),
          Refused: (f) => ({
            ...of,
            operation: f.operation,
            lane: Option.none<LaneKey>(),
            attempt: Option.some(f.attempt),
            channel: "unknown" as const,
            reason: "StorageRefused",
            value: why("StorageRefused"),
          }),
          Declined: (d) => ({
            ...of,
            operation: d.operation,
            lane: Option.none<LaneKey>(),
            attempt: Option.none<AttemptId>(),
            channel: "notSent" as const,
            reason: d.reason,
            value: why(d.reason),
          }),
        }) satisfies RestoredRow;
      }),
    );

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const laneRecord = (parts: LaneParts, value: unknown) =>
    Result.map(
      laneReader(parts.operation)({ keyText: parts.keyText, record: value }),
      // RETURN_TYPE: the lane as the boot reads it back, its head under a branded Attempt.
      ({ record: r }): RestoredLane => {
        const { actor, id, key } = parts;
        const operation = parts.operationName;
        const ended = { kept: false, actor, operation, route: Route.Current() };
        const head = r._tag === "Head" ? Option.some(r) : Option.none();

        // A saved queue and the displaced heads a cancel was pending on are not restored as work:
        // each queued commit ends NotSent Restored and each displaced Attempt unknown Restored,
        // before the head's own Restored at the start.
        const endings: ReadonlyArray<RestoredRow> = [
          ...Option.match(head, { onNone: () => [], onSome: (h) => h.queue }).map(() => ({
            ...ended,
            attempt: Option.none<AttemptId>(),
            lane: Option.none<LaneKey>(),
            channel: "notSent" as const,
            reason: "Restored",
            value: { why: "Restored" },
          })),
          ...r.displaced.map((attempt) => ({
            ...ended,
            attempt: Option.some(attempt),
            lane: Option.some(id),
            channel: "unknown" as const,
            reason: "Restored",
            value: undefined,
          })),
        ];

        return {
          key,
          id,
          actor,
          inFlight: Option.exists(head, (h) => h.inFlight),
          lane: Option.map(head, (h) => ({
            actor,
            operation,
            head: {
              id: h.attempt,
              input: h.input,
              retryCount: h.retryCount,
              owner: 0,
              phase: Phase.Held(),
            },
            queue: [],
          })),
          endings,
        };
      },
    );

  // A store reads back in key order, whatever order the records were written in.
  const entries = [...stored].toSorted(([a], [b]) => byCodeUnits(a, b));

  const records: Array<RestoredActor> = [];
  const restoredLanes: Array<RestoredLane> = [];
  const rows: Array<RestoredRow> = [];
  const quarantined: Array<Quarantined> = [];
  const discarded: Array<string> = [];

  for (const [key, text] of entries) {
    const kind = Option.map(kindOfKey(key), (k) => k.kind);
    const parts = readRecordKey(machines, key);

    // An actor record of a machine no entry declares is discarded; its lanes and rows are not.
    if (Result.isFailure(parts) && parts.failure === "machine" && Option.contains(kind, "actor")) {
      discarded.push(key);
      continue;
    }

    const done = Result.flatMap(parts, (p) =>
      Result.flatMap(Result.mapError(decodeCanonical(text), reasonOf), (json) => {
        if (p.kind === "actor")
          return Result.map(
            actorRecord(p.key, p.compiled, p.actor, json),
            (r) => void records.push(r),
          );

        if (p.kind === "lane")
          return Result.map(laneRecord(p, json), (l) => void restoredLanes.push(l));

        return Result.map(rowsRecord(p, json), (r) => void rows.push(...r));
      }),
    );

    if (Result.isFailure(done)) quarantined.push({ key, kind, reason: done.failure });
  }

  return { records, lanes: restoredLanes, rows, quarantined, discarded };
};

// A walker's decode, failing as a record its Schema refuses.
// FLOW_STATE_ALLOW_UNKNOWN: a canonical JSON value, decoded here once by the Schema its key names.
const decodedBy =
  <A>(walker: Walker<A, unknown>) =>
  (value: unknown) =>
    Result.mapError(walker.decode(value), () => "schema");

type LaneParts = Extract<KeyParts, { readonly kind: "lane" }>;
