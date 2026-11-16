import { Option, Result, Schema, Struct } from "effect";
import { CodecFailure, encodeCanonical, decodeCanonical, toCanonicalJson } from "./codec.ts";
import type { Compiled, Values } from "./compiled.ts";
import { Channel, ScheduleDeadline } from "./vocabulary.ts";
import type { Owed } from "./ledger.ts";
import {
  type ActorId,
  type ActorRecord,
  type Incarnation,
  type Lane,
  byCodeUnits,
  Phase,
} from "./world.ts";

/**
 * Flow's record format, stamped on every actor, lane and owed record.
 */
export const FORMAT = 1;

// The one format a record of this release reads: an older one has no step yet, and a newer, null,
// fractional or string one is never read.
const Format = Schema.Literal(FORMAT);

const ActorJson = Schema.Struct({ machine: Schema.String, name: Schema.String });

const ActorRecordJson = Schema.Struct({
  format: Format,
  machine: Schema.String,
  name: Schema.String,
  state: Schema.String,
  memory: Schema.Json,
  schedules: Schema.Array(ScheduleDeadline),
  context: Schema.Record(Schema.String, ActorJson),
  seen: Schema.Record(Schema.String, Schema.Json),
});

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

const reasonOf = (failure: CodecFailure) =>
  CodecFailure.$match(failure, {
    BoundExceeded: ({ bound, limit, path }) => `${bound} over ${limit} at ${path}`,
    Malformed: ({ reason, path }) => `${reason} at ${path}`,
  });

// The canonical text of a record, or why it has none.
const textOf = (record: Values) => Result.mapError(encodeCanonical(record), reasonOf);

const jsonOf = (json: Schema.Codec<Values, Values>, value: Values) =>
  Result.mapError(Schema.encodeUnknownResult(json)(value), () => "schema");

/**
 * An identity's saved rows as canonical text, in owed order, with how many values it gave up: a
 * value with no canonical form keeps `null`, and when the rows together pass a codec bound their
 * largest values are saved as `null`, one by one, until the record fits (`dropped`).
 */
export const encodeOwed = (
  actor: ActorId,
  rows: ReadonlyArray<
    Pick<Owed, "operation" | "lane" | "attempt" | "channel" | "reason" | "value"> & {
      readonly kept: boolean;
    }
  >,
) => {
  const values = rows.map((r) => Result.getOrNull(toCanonicalJson(r.value)));

  // The values' sizes, largest first: a record past a bound gives up its largest values first.
  const largest = values
    .map((v, at) => ({ at, size: Result.getOrElse(encodeCanonical(v), () => "").length }))
    .toSorted((a, b) => b.size - a.size)
    .map((v) => v.at);

  const recordWithout = (dropped: ReadonlySet<number>) =>
    textOf({
      format: FORMAT,
      machine: actor.machine,
      name: actor.name,
      rows: rows.map((r, at) => ({
        operation: r.operation,
        lane: Option.getOrNull(r.lane),
        attempt: Option.getOrNull(r.attempt),
        channel: r.channel,
        reason: r.reason,
        value: dropped.has(at) ? null : values[at],
        kept: r.kept,
      })),
    });

  let attempt = recordWithout(new Set());
  let dropped = 0;

  while (Result.isFailure(attempt) && dropped < largest.length) {
    dropped += 1;
    attempt = recordWithout(new Set(largest.slice(0, dropped)));
  }

  return Result.map(attempt, (text) => ({ text, dropped }));
};

/**
 * An incarnation's record as canonical text: its state, its memory encoded by the machine's
 * memory Schema, its schedules' deadlines, its context bindings and each slot's last-seen value;
 * or why it cannot encode.
 */
export const encodeActor = (compiled: Compiled, incarnation: Incarnation) =>
  Result.flatMap(jsonOf(compiled.memoryJson, incarnation.memory), (memory) =>
    textOf({
      format: FORMAT,
      machine: incarnation.actor.machine,
      name: incarnation.actor.name,
      state: incarnation.state,
      memory,
      schedules: [...incarnation.schedules].map(([name, armed]) => ({
        name,
        dueAt: armed.dueAt,
        send: armed.send,
      })),
      context: Object.fromEntries(
        [...incarnation.bound].map(([slot, p]) => [slot, { machine: p.machine, name: p.name }]),
      ),
      seen: Object.fromEntries(incarnation.context),
    }),
  );

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

const decodeBy =
  <A, I>(schema: Schema.Codec<A, I>, why: string) =>
  // FLOW_STATE_ALLOW_UNKNOWN: a canonical JSON value, decoded here once by the Schema its key names.
  (value: unknown) =>
    Result.mapError(Schema.decodeUnknownResult(schema)(value), () => why);

const FormatJson = Schema.Struct({ format: Format });

const actorOf = (r: ActorId) => ({
  machine: r.machine,
  name: r.name,
});

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

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const actorRecord = (value: unknown) =>
    Result.gen(function* () {
      const r = yield* decodeBy(ActorRecordJson, "schema")(value);
      const compiled = yield* machineOf(r);
      const memory = yield* decodeBy(compiled.memoryJson, "memory")(r.memory);

      return {
        actor: actorOf(r),
        state: r.state,
        memory,
        schedules: r.schedules,
        context: new Map(Object.entries(r.context).map(([slot, p]) => [slot, actorOf(p)])),
        seen: new Map(Object.entries(r.seen)),
      } satisfies ActorRecord;
    });

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
          value: e.value,
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
