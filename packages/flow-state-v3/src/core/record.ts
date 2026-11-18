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
import type { Compiled, Operation, Values } from "./compiled.ts";
import { Count, digestOf, exact, FORMAT, readerOf, reasonOf, textOf } from "./record-format.ts";
import { Channel } from "./vocabulary.ts";
import { keyTextOf } from "./lane-moves.ts";
import { type Owed, Route } from "./ledger.ts";
import { type ActorId, byCodeUnits, type Lane, Phase } from "./world.ts";

type OwedRow = Pick<Owed, "operation" | "lane" | "attempt" | "channel" | "reason" | "value"> & {
  readonly kept: boolean;
};

// A row as saved: a row on a lane names it by its place after the identity, which its key names,
// and the lane's contract gives its operation; any other row names its operation. A Flow-made row
// with no value saves `null`.
const rowJson = (actor: ActorId, r: OwedRow) => ({
  ...Option.match(r.lane, {
    onNone: () => ({ operation: r.operation }),
    onSome: (lane) => ({ lane: laneTailOf(actor, lane) }),
  }),
  attempt: Option.getOrNull(r.attempt),
  channel: r.channel,
  reason: r.reason,
  value: r.value === undefined ? null : r.value,
  kept: r.kept,
});

// A row whose value cannot be saved even alone is saved as the ending a crash before its save
// would have restored: its Attempt's unknown Restored.
const unsaved = (r: OwedRow) =>
  ({ ...r, channel: "unknown", reason: "Restored", value: undefined }) satisfies OwedRow;

/**
 * An identity's saved rows as one canonical text, in owed order. Every row is kept; a value with no
 * canonical form is saved as its Attempt's unknown Restored and counted in `unsaved`.
 */
export const encodeOwed = (actor: ActorId, rows: ReadonlyArray<OwedRow>) => {
  const saved = rows.map((r) =>
    Result.isSuccess(toCanonicalRow(actor, r))
      ? { row: rowJson(actor, r), lost: false }
      : { row: rowJson(actor, unsaved(r)), lost: true },
  );

  return Result.map(textOf({ format: FORMAT, rows: saved.map((s) => s.row) }), (text) => ({
    text,
    unsaved: saved.filter((s) => s.lost).length,
  }));
};

const toCanonicalRow = (actor: ActorId, r: OwedRow) => textOf(rowJson(actor, r));

/**
 * A lane's record as canonical text: its Attempt with its encoded input and that input's digest,
 * the retryCount it carries on the wire (a re-send waiting for this capture counts itself),
 * whether it is in flight, the encoded inputs of the commits queued behind it, and the Attempts of
 * the displaced heads whose endings it owes. A lane gone Idle while it still owes a displaced
 * Attempt's ending keeps a record of those alone. Its identity, contract and key text are its key.
 */
export const encodeLane = (
  compiled: Compiled,
  operationName: string,
  lane: Option.Option<Lane>,
  displaced: ReadonlyArray<string>,
) => {
  const operation = compiled.operations.get(operationName);

  if (operation === undefined) return Result.fail("operation");

  const record = (head: Values) =>
    textOf({
      format: FORMAT,
      ...head,
      displaced,
    });

  return Option.match(lane, {
    onNone: () => record({}),
    onSome: (l) =>
      Result.flatMap(Result.all(l.queue.map((q) => operation.walk.input.text(q.input))), (queue) =>
        Result.flatMap(operation.walk.input.text(l.head.input), (input) =>
          record({
            attempt: l.head.id,
            input,
            digest: digestOf(input.text),
            retryCount: l.head.retryCount + (Phase.$is("Recapturing")(l.head.phase) ? 1 : 0),
            inFlight: !Phase.$is("Held")(l.head.phase),
            queue,
          }),
        ),
      ),
  });
};

// A lane record's Schemas, by its operation: a head with its input, which gives the key text its
// key names and the digest saved beside it, and the inputs queued behind it; or the displaced
// Attempts alone, at least one. Attempt ids never repeat, so no displaced Attempt is listed twice
// or is the head's own.
const laneSchemaOf = (operation: Operation) => {
  const head = exact({
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
    format: Schema.Literal(FORMAT),
    displaced: Schema.NonEmptyArray(AttemptIdSchema),
  });

  return exact({ keyText: Schema.String, record: Schema.Union([head, headless]) }).check(
    Schema.makeFilter(
      ({ keyText, record }) =>
        new Set(record.displaced).size === record.displaced.length &&
        (!("attempt" in record) ||
          (!record.displaced.includes(record.attempt) &&
            Option.contains(keyTextOf(operation, record.input), keyText) &&
            Result.getOrUndefined(
              Result.map(operation.walk.input.text(record.input), (t) => digestOf(t.text)),
            ) === record.digest)),
    ),
  );
};

// An owed record's Schema, by its machine: at least one row, each an ending of an Attempt on a lane
// of a contract the machine writes, by key text that names itself back, or naming an operation the
// machine declares; only a decline has no Attempt. An Attempt ends once: no two rows of one record
// hold a success, failure or NotSent of the same Attempt.
const owedSchemaOf = (compiled: Compiled) => {
  const row = {
    attempt: AttemptIdSchema,
    channel: Channel,
    reason: Schema.String,
    value: Schema.Json,
    kept: Schema.Boolean,
  };

  const operation = operationNameOf(compiled);

  return exact({
    format: Schema.Literal(FORMAT),
    rows: Schema.NonEmptyArray(
      Schema.Union([
        exact({ lane: laneTailOfMachine(compiled), ...row }),
        exact({ operation, ...row }),
        exact({ operation, ...row, attempt: Schema.Null, channel: Schema.Literal("notSent") }),
      ]),
    ).check(
      Schema.makeFilter((rows) => {
        const ended = rows.flatMap((r) =>
          r.attempt !== null && r.channel !== "unknown" ? [r.attempt] : [],
        );

        return new Set(ended).size === ended.length;
      }),
    ),
  });
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
  const laneReader = memo((operation: Operation) => readerOf(laneSchemaOf(operation), "schema"));
  const owedReader = memo((compiled: Compiled) => readerOf(owedSchemaOf(compiled), "schema"));

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const rowsRecord = (parts: KeyParts, value: unknown) =>
    Result.map(owedReader(parts.compiled)(value), (r) =>
      r.rows.map((e) => {
        // A row on a lane takes its operation from the lane's contract.
        const { operation, lane } =
          "lane" in e
            ? {
                operation: operationOfTail(parts.compiled, e.lane),
                lane: Option.some(laneKeyOf(parts.actor, e.lane)),
              }
            : { operation: e.operation, lane: Option.none<LaneKey>() };

        return {
          kept: e.kept,
          actor: parts.actor,
          operation,
          attempt: Option.fromNullOr(e.attempt),
          lane,
          channel: e.channel,
          reason: e.reason,
          // A Flow-made unknown row saved with no value reads back with none.
          value: e.channel === "unknown" && e.value === null ? undefined : e.value,
          route: Route.Current(),
        } satisfies RestoredRow;
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
        const head = "attempt" in r ? Option.some(r) : Option.none();

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

type LaneParts = Extract<KeyParts, { readonly kind: "lane" }>;

// A function kept by its argument: each Schema's reader is built once per boot.
const memo = <K, V>(make: (key: K) => V) => {
  const made = new Map<K, V>();

  return (key: K) => {
    const known = made.get(key) ?? make(key);
    made.set(key, known);

    return known;
  };
};
