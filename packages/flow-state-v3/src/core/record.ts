import { Option, Result, Schema, Struct } from "effect";
import type { Compiled, Values } from "./compiled.ts";
import { Channel, ScheduleDeadline } from "./vocabulary.ts";
import type { Owed } from "./ledger.ts";
import {
  type ActorId,
  type ActorRecord,
  actorKey,
  type Incarnation,
  type Lane,
  byCodeUnits,
  laneId,
  Phase,
  sentBefore,
} from "./world.ts";

/**
 * Flow's record format, stamped on every actor and lane record.
 */
export const FORMAT = 1;

const ActorRecordJson = Schema.Struct({
  format: Schema.Literal(FORMAT),
  machine: Schema.String,
  name: Schema.String,
  state: Schema.String,
  memory: Schema.Json,
  schedules: Schema.Array(ScheduleDeadline),
});

const LaneRecordJson = Schema.Struct({
  format: Schema.Literal(FORMAT),
  machine: Schema.String,
  name: Schema.String,
  operation: Schema.String,
  attempt: Schema.String,
  input: Schema.Json,
  retryCount: Schema.Number,
  mayHaveApplied: Schema.Boolean,
  inFlight: Schema.Boolean,
  queue: Schema.Array(Schema.Json),
  displaced: Schema.Array(Schema.String),
});

const OwedJson = Schema.Struct({
  format: Schema.Literal(FORMAT),
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

/**
 * The key an identity's saved rows are stored under: one record, in the order they were owed.
 */
export const owedRecordKey = (key: string) => `owed/${key}`;

/**
 * An identity's saved rows as JSON data, in owed order; a value JSON cannot carry keeps `null`.
 */
// RETURN_TYPE: an owed record is JSON data for the store.
export const encodeOwed = (
  actor: ActorId,
  rows: ReadonlyArray<
    Pick<Owed, "operation" | "lane" | "attempt" | "channel" | "reason" | "value"> & {
      readonly kept: boolean;
    }
  >,
): Values => ({
  format: FORMAT,
  machine: actor.machine,
  name: actor.name,
  rows: rows.map((r) => ({
    operation: r.operation,
    lane: Option.getOrNull(r.lane),
    attempt: Option.getOrNull(r.attempt),
    channel: r.channel,
    reason: r.reason,
    value: Result.getOrElse(Schema.decodeUnknownResult(Schema.Json)(r.value), () => null),
    kept: r.kept,
  })),
});

/**
 * The key an actor's record is stored under.
 */
export const actorRecordKey = (key: string) => `actor/${key}`;

/**
 * The key a lane's record is stored under.
 */
export const laneRecordKey = (lane: string) => `lane/${lane}`;

const jsonOf = (json: Schema.Codec<Values, Values>, value: Values) =>
  Schema.encodeUnknownResult(json)(value);

/**
 * An incarnation's record as JSON data: its state, its memory encoded by the
 * machine's memory Schema, and its schedules' deadlines. A memory that cannot encode is `None`.
 */
export const encodeActor = (compiled: Compiled, incarnation: Incarnation) =>
  Result.getSuccess(
    Result.map(jsonOf(compiled.memoryJson, incarnation.memory), (memory) => ({
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
    })),
  );

/**
 * A lane's record as JSON data: its Attempt with its encoded input, the retryCount it carries on
 * the wire (a re-send waiting for this capture counts itself), whether it was InFlight at capture, the encoded inputs of the commits queued behind it, and the Attempts of the displaced
 * heads whose endings it owes.
 */
export const encodeLane = (compiled: Compiled, lane: Lane, displaced: ReadonlyArray<string>) => {
  const operation = compiled.operations.get(lane.operation);

  if (operation === undefined) return Option.none();

  const queue = Result.all(lane.queue.map((q) => jsonOf(operation.inputJson, q.input)));

  return Result.getSuccess(
    Result.flatMap(queue, (queued) =>
      Result.map(jsonOf(operation.inputJson, lane.head.input), (input) => ({
        format: FORMAT,
        machine: lane.actor.machine,
        name: lane.actor.name,
        operation: lane.operation,
        attempt: lane.head.id,
        input,
        retryCount: lane.head.retryCount + (Phase.$is("Recapturing")(lane.head.phase) ? 1 : 0),
        mayHaveApplied: sentBefore(lane.head),
        inFlight: !Phase.$is("Held")(lane.head.phase),
        queue: queued,
        displaced,
      })),
    ),
  );
};

const decodeActorJson = Schema.decodeUnknownResult(ActorRecordJson);

const decodeLaneJson = Schema.decodeUnknownResult(LaneRecordJson);

/**
 * What a boot reads back: actor records, lanes by id, parked and kept endings, each decoded by
 * its machine's Schemas; a record that does not decode is dropped (quarantine is not built here).
 */
export type Restored = {
  readonly records: ReadonlyArray<ActorRecord>;
  readonly lanes: ReadonlyArray<{
    readonly id: string;
    readonly lane: Lane;
    readonly inFlight: boolean;
    readonly endings: ReadonlyArray<RestoredRow>;
  }>;
  readonly rows: ReadonlyArray<RestoredRow>;
  readonly undecodable: ReadonlySet<string>;
};

/**
 * A saved Waiting or Kept row as a boot reads it back: owed to its identity, delivered current
 * from the active leaf.
 */
export type RestoredRow = Omit<Owed, "id" | "delivery" | "to"> & { readonly kept: boolean };

/**
 * Decodes the store's records with the machines they name.
 *
 * **Details**
 *
 * Restored lanes are Held: an Attempt acknowledged once ends unknown `Restored`.
 */
// FLOW_STATE_ALLOW_UNKNOWN: the store's values are parsed JSON, decoded here once by their Schemas.
// RETURN_TYPE: the Restored contract the step boots from.
export const decodeRecords = (
  machines: ReadonlyMap<string, Compiled>,
  // FLOW_STATE_ALLOW_UNKNOWN: the store's values are parsed JSON, decoded here once by their Schemas.
  stored: ReadonlyMap<string, unknown>,
): Restored => {
  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const actorRecord = (value: unknown) =>
    Option.gen(function* () {
      const r = yield* Result.getSuccess(decodeActorJson(value));
      const compiled = yield* Option.fromUndefinedOr(machines.get(r.machine));

      const memory = yield* Result.getSuccess(
        Schema.decodeUnknownResult(compiled.memoryJson)(r.memory),
      );

      return {
        actor: { machine: r.machine, name: r.name },
        state: r.state,
        memory,
        schedules: r.schedules,
      } satisfies ActorRecord;
    });

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const rowsRecord = (value: unknown) =>
    Option.map(Result.getSuccess(Schema.decodeUnknownResult(OwedJson)(value)), (r) => {
      const actor = { machine: r.machine, name: r.name };

      return r.rows.map((e) => ({
        kept: e.kept,
        actor,
        operation: e.operation,
        attempt: Option.fromNullOr(e.attempt),
        lane: Option.fromNullOr(e.lane),
        channel: e.channel,
        reason: e.reason,
        value: e.value,
        owner: 0,
        current: true,
      })) satisfies ReadonlyArray<RestoredRow>;
    });

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const laneRecord = (value: unknown) =>
    Option.gen(function* () {
      const r = yield* Result.getSuccess(decodeLaneJson(value));

      const operation = yield* Option.fromUndefinedOr(
        machines.get(r.machine)?.operations.get(r.operation),
      );

      const input = yield* Result.getSuccess(
        Schema.decodeUnknownResult(operation.inputJson)(r.input),
      );

      const actor = { machine: r.machine, name: r.name };

      const keyText = yield* Result.getSuccess(
        Schema.encodeUnknownResult(operation.key)(Struct.pick(input, operation.keyFields)),
      );

      const lane: Lane = {
        actor,
        operation: r.operation,
        head: {
          id: r.attempt,
          input,
          retryCount: r.retryCount,
          owner: 0,
          phase: Phase.Held(),
        },
        queue: [],
      };

      const id = laneId(actor, r.operation, keyText);

      const ended = {
        kept: false,
        actor,
        operation: r.operation,
        owner: 0,
        current: true,
      };

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

      return { id, inFlight: r.inFlight, lane, endings };
    });

  // A store reads back in key order, whatever order the records were written in.
  const entries = [...stored].toSorted(([a], [b]) => byCodeUnits(a, b));

  // FLOW_STATE_ALLOW_UNKNOWN: a stored value is parsed JSON until its key's decoder reads it.
  const of = <A>(prefix: string, decode: (value: unknown) => Option.Option<A>) =>
    entries.flatMap(([key, value]) =>
      key.startsWith(prefix) ? Option.toArray(decode(value)) : [],
    );

  const records = of("actor/", actorRecord);
  const rows = of("owed/", rowsRecord).flat();
  const decoded = new Set(records.map((r) => actorRecordKey(actorKey(r.actor))));

  return {
    records,
    undecodable: new Set(
      entries.flatMap(([key]) =>
        key.startsWith("actor/") && !decoded.has(key) ? [key.slice(6)] : [],
      ),
    ),
    lanes: of("lane/", laneRecord),
    rows,
  };
};
