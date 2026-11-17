import { Option, Result, Schema, Struct } from "effect";
import { decodeCanonical, toCanonicalJson } from "./codec.ts";
import { decodeActor } from "./actor-record.ts";
import type { Compiled, Values } from "./compiled.ts";
import {
  actorOf,
  decodeBy,
  FORMAT,
  Format,
  FormatJson,
  jsonOf,
  reasonOf,
  textOf,
} from "./record-format.ts";
import { Channel } from "./vocabulary.ts";
import type { Owed } from "./ledger.ts";
import { type ActorId, type ActorRecord, type Lane, byCodeUnits, Phase } from "./world.ts";

const LaneRecordJson = Schema.Struct({
  format: Format,
  machine: Schema.String,
  name: Schema.String,
  operation: Schema.String,
  attempt: Schema.NullOr(Schema.String),
  input: Schema.Json,
  retryCount: Schema.Number,
  inFlight: Schema.Boolean,
  queue: Schema.Array(Schema.Json),
  displaced: Schema.Array(Schema.String),
});

const OwedJson = Schema.Struct({
  format: Format,
  machine: Schema.String,
  name: Schema.String,
  rows: Schema.Array(
    Schema.Struct({
      operation: Schema.String,
      lane: Schema.NullOr(Schema.String),
      attempt: Schema.NullOr(Schema.String),
      channel: Channel,
      reason: Schema.String,
      value: Schema.Json,
      kept: Schema.Boolean,
    }),
  ),
});

const KINDS = ["actor/", "lane/", "owed/"] as const;

/**
 * The key an identity's saved rows are stored under: one record, in the order they were owed.
 */
export const owedRecordKey = (key: string) => `owed/${key}`;

/**
 * The key an actor's record is stored under.
 */
export const actorRecordKey = (key: string) => `actor/${key}`;

/**
 * The key a lane's record is stored under.
 */
export const laneRecordKey = (lane: string) => `lane/${lane}`;

type OwedRow = Pick<Owed, "operation" | "lane" | "attempt" | "channel" | "reason" | "value"> & {
  readonly kept: boolean;
};

// A row as saved: a Flow-made row with no value saves `null`.
const rowJson = (r: OwedRow) => ({
  operation: r.operation,
  lane: Option.getOrNull(r.lane),
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
    Result.isSuccess(toCanonicalJson(rowJson(r)))
      ? { row: rowJson(r), lost: false }
      : { row: rowJson(unsaved(r)), lost: true },
  );

  return Result.map(
    textOf({
      format: FORMAT,
      machine: actor.machine,
      name: actor.name,
      rows: saved.map((s) => s.row),
    }),
    (text) => ({ text, unsaved: saved.filter((s) => s.lost).length }),
  );
};

/**
 * A lane's record as canonical text: its Attempt with its encoded input, the retryCount it carries
 * on the wire (a re-send waiting for this capture counts itself), whether it is in flight, the
 * encoded inputs of the commits queued behind it, and the Attempts of the displaced heads whose
 * endings it owes. A lane gone Idle while it still owes a displaced Attempt's ending keeps a record
 * with no head.
 */
export const encodeLane = (
  compiled: Compiled,
  operationName: string,
  actor: ActorId,
  lane: Option.Option<Lane>,
  displaced: ReadonlyArray<string>,
) => {
  const operation = compiled.operations.get(operationName);

  if (operation === undefined) return Result.fail("operation");

  const record = (head: Values) =>
    textOf({
      format: FORMAT,
      machine: actor.machine,
      name: actor.name,
      operation: operationName,
      ...head,
      displaced,
    });

  return Option.match(lane, {
    onNone: () => record({ attempt: null, input: null, retryCount: 0, inFlight: false, queue: [] }),
    onSome: (l) =>
      Result.flatMap(
        Result.all(l.queue.map((q) => jsonOf(operation.inputJson, q.input))),
        (queue) =>
          Result.flatMap(jsonOf(operation.inputJson, l.head.input), (input) =>
            record({
              attempt: l.head.id,
              input,
              retryCount: l.head.retryCount + (Phase.$is("Recapturing")(l.head.phase) ? 1 : 0),
              inFlight: !Phase.$is("Held")(l.head.phase),
              queue,
            }),
          ),
      ),
  });
};

/**
 * A record the boot could not read: kept, unchanged, under its key.
 */
export type Quarantined = { readonly key: string; readonly reason: string };

/**
 * A saved Waiting or Kept row as a boot reads it back: owed to its identity, delivered current
 * from the active leaf.
 */
export type RestoredRow = Omit<Owed, "id" | "delivery" | "to"> & { readonly kept: boolean };

/**
 * What a boot reads back: actor records, lanes by the id their key names (with no lane when the
 * record holds only displaced Attempts), the rows each lane record owes, the saved rows, and the
 * records it quarantined.
 */
export type Restored = {
  readonly records: ReadonlyArray<ActorRecord>;
  readonly lanes: ReadonlyArray<{
    readonly id: string;
    readonly actor: ActorId;
    readonly lane: Option.Option<Lane>;
    readonly inFlight: boolean;
    readonly endings: ReadonlyArray<RestoredRow>;
  }>;
  readonly rows: ReadonlyArray<RestoredRow>;
  readonly quarantined: ReadonlyArray<Quarantined>;
};

/**
 * Decodes the store's records with the machines they name, one record at a time.
 *
 * **Details**
 *
 * - Each text must be canonical, carry the current `format` and decode by its kind's Schema and
 *   its machine's; any other record is quarantined and its bytes stay as they are.
 * - Restored lanes are Held: an Attempt acknowledged once ends unknown `Restored`.
 * - A lane's id is its key's text after `lane/`.
 */
// RETURN_TYPE: the Restored contract the step boots from.
export const decodeRecords = (
  machines: ReadonlyMap<string, Compiled>,
  stored: ReadonlyMap<string, string>,
): Restored => {
  const machineOf = (r: { readonly machine: string }) =>
    Result.fromNullishOr(machines.get(r.machine), () => "machine");

  const actorRecord = decodeActor(machines);

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const rowsRecord = (value: unknown) =>
    Result.map(
      decodeBy(OwedJson, "schema")(value),
      (r) =>
        r.rows.map((e) => ({
          kept: e.kept,
          actor: actorOf(r),
          operation: e.operation,
          attempt: Option.fromNullOr(e.attempt),
          lane: Option.fromNullOr(e.lane),
          channel: e.channel,
          reason: e.reason,
          // A Flow-made unknown row saved with no value reads back with none.
          value: e.channel === "unknown" && e.value === null ? undefined : e.value,
          owner: 0,
          current: true,
        })) satisfies ReadonlyArray<RestoredRow>,
    );

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const laneRecord = (id: string, value: unknown) =>
    Result.gen(function* () {
      const r = yield* decodeBy(LaneRecordJson, "schema")(value);
      const compiled = yield* machineOf(r);

      const operation = yield* Result.fromNullishOr(
        compiled.operations.get(r.operation),
        () => "operation",
      );

      const actor = actorOf(r);

      const lane = yield* Option.match(Option.fromNullOr(r.attempt), {
        onNone: () => Result.succeed(Option.none<Lane>()),
        onSome: (attempt) =>
          Result.flatMap(decodeBy(operation.inputJson, "input")(r.input), (input) =>
            Result.map(
              Result.mapError(
                Schema.encodeUnknownResult(operation.key)(Struct.pick(input, operation.keyFields)),
                () => "key",
              ),
              () =>
                Option.some<Lane>({
                  actor,
                  operation: r.operation,
                  head: {
                    id: attempt,
                    input,
                    retryCount: r.retryCount,
                    owner: 0,
                    phase: Phase.Held(),
                  },
                  queue: [],
                }),
            ),
          ),
      });

      const ended = { kept: false, actor, operation: r.operation, owner: 0, current: true };

      // A saved queue and the displaced heads a cancel was pending on are not restored as work:
      // each queued commit ends NotSent Restored and each displaced Attempt unknown Restored,
      // before the head's own Restored at the start.
      const endings: ReadonlyArray<RestoredRow> = [
        ...r.queue.map(() => ({
          ...ended,
          attempt: Option.none<string>(),
          lane: Option.none<string>(),
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

      return { id, actor, inFlight: r.inFlight, lane, endings };
    });

  // A store reads back in key order, whatever order the records were written in.
  const entries = [...stored].toSorted(([a], [b]) => byCodeUnits(a, b));

  const records: Array<ActorRecord> = [];
  const lanes: Array<Restored["lanes"][number]> = [];
  const rows: Array<RestoredRow> = [];
  const quarantined: Array<Quarantined> = [];

  for (const [key, text] of entries) {
    const kind = KINDS.find((k) => key.startsWith(k));

    const read = Result.flatMap(
      Result.mapError(decodeCanonical(text), reasonOf),
      // A key of no kind is never read; a record is read first for its format alone.
      (json) =>
        Result.map(
          kind === undefined ? Result.fail("kind") : decodeBy(FormatJson, "format")(json),
          () => json,
        ),
    );

    const done = Result.flatMap(read, (json) => {
      if (kind === "actor/") return Result.map(actorRecord(json), (r) => void records.push(r));

      if (kind === "lane/")
        return Result.map(laneRecord(key.slice(kind.length), json), (l) => void lanes.push(l));

      return Result.map(rowsRecord(json), (r) => void rows.push(...r));
    });

    if (Result.isFailure(done)) quarantined.push({ key, reason: done.failure });
  }

  return { records, lanes, rows, quarantined };
};
