import { Option, Result, Schema, Struct } from "effect";
import { BOUNDS, decodeCanonical, measure } from "./codec.ts";
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

/**
 * The key of one part of an identity's owed record: the first part is `owed/<identity>`, and each
 * later one adds `|` and its number, four digits, so the parts read back in order.
 */
export const owedPartKey = (key: string, part: number) =>
  part === 0 ? owedRecordKey(key) : `${owedRecordKey(key)}|${String(part).padStart(4, "0")}`;

// The identity key an owed part's key names.
const owedIdentityOf = (key: string) => key.slice("owed/".length).replace(/\|\d{4}$/u, "");

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

// Rows in owed order, cut into parts in one pass: a part closes when the next row would take it
// past a codec bound, counting from the record with no rows.
const packParts = <Row>(
  empty: { readonly bytes: number; readonly nodes: number },
  costs: ReadonlyArray<{ readonly bytes: number; readonly nodes: number; readonly row: Row }>,
) => {
  let part: Array<Row> = [];
  const parts = [part];
  let bytes = empty.bytes;
  let nodes = empty.nodes;

  for (const cost of costs) {
    const past =
      bytes + cost.bytes > BOUNDS.bytes ||
      nodes + cost.nodes > BOUNDS.nodes ||
      part.length >= BOUNDS.items;

    if (past && part.length > 0) {
      part = [];
      parts.push(part);
      bytes = empty.bytes;
      nodes = empty.nodes;
    }

    part.push(cost.row);
    bytes += cost.bytes;
    nodes += cost.nodes;
  }

  return parts;
};

/**
 * An identity's saved rows as canonical texts, in owed order: one record while they fit the
 * codec's bounds, else as many parts as they need, each a whole record (`owedPartKey`). Every row
 * is kept; a value that cannot be saved even in a part of its own is saved as its Attempt's
 * unknown Restored and counted in `unsaved`. Each row is measured once, then the parts are filled
 * in one pass. Fails only when a row cannot be saved even so.
 */
export const encodeOwed = (actor: ActorId, rows: ReadonlyArray<OwedRow>) => {
  const header = { format: FORMAT, machine: actor.machine, name: actor.name };

  const sizeOf = (saved: ReadonlyArray<ReturnType<typeof rowJson>>) =>
    Result.mapError(measure({ ...header, rows: saved }), reasonOf);

  return Result.gen(function* () {
    const empty = yield* sizeOf([]);

    // A row's cost in a part: what it adds to a part holding it alone, a comma included.
    const costs = yield* Result.all(
      rows.map((r) => {
        const whole = rowJson(r);
        const alone = sizeOf([whole]);

        const saved = Result.isSuccess(alone)
          ? Result.succeed({ row: whole, size: alone.success, lost: false })
          : Result.map(sizeOf([rowJson(unsaved(r))]), (size) => ({
              row: rowJson(unsaved(r)),
              size,
              lost: true,
            }));

        return Result.map(saved, ({ row, size, lost }) => ({
          bytes: size.bytes - empty.bytes + 1,
          nodes: size.nodes - empty.nodes,
          row,
          lost,
        }));
      }),
    );

    const texts = yield* Result.all(
      packParts(empty, costs).map((part) => textOf({ ...header, rows: part })),
    );

    return { texts, unsaved: costs.filter((c) => c.lost).length };
  });
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
  readonly owedParts: ReadonlyMap<string, number>;
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

  // How many owed parts each identity has on disk, read or not, so its next write removes the rest.
  const owedParts = new Map<string, number>();

  for (const [key] of entries)
    if (key.startsWith("owed/")) {
      const identity = owedIdentityOf(key);
      owedParts.set(identity, (owedParts.get(identity) ?? 0) + 1);
    }

  return { records, lanes, rows, quarantined, owedParts };
};
