import { Option, Result, Schema, Struct } from "effect";
import type { Compiled, Values } from "./compiled.ts";
import { Channel, ScheduleDeadline } from "./vocabulary.ts";
import {
  type ActorRecord,
  type Incarnation,
  type Lane,
  laneId,
  type Parked,
  Phase,
} from "./world.ts";

/**
 * Flow's record format, stamped on every actor and lane record (WriteAhead R9).
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
  keyText: Schema.String,
  attempt: Schema.String,
  input: Schema.Json,
  retryCount: Schema.Number,
  mayHaveApplied: Schema.Boolean,
  sent: Schema.Boolean,
  inFlight: Schema.Boolean,
});

const ParkedJson = Schema.Struct({
  format: Schema.Literal(FORMAT),
  machine: Schema.String,
  name: Schema.String,
  operation: Schema.String,
  lane: Schema.String,
  kept: Schema.Boolean,
  endings: Schema.Array(
    Schema.Struct({
      attempt: Schema.NullOr(Schema.String),
      channel: Channel,
      reason: Schema.String,
      value: Schema.Json,
    }),
  ),
});

/**
 * The key a lane's parked endings are stored under.
 */
export const parkedRecordKey = (lane: string) => `parked/${lane}`;

/**
 * A lane's parked endings as JSON data; an ending whose value JSON cannot carry keeps `null`.
 */
// RETURN_TYPE: a parked record is JSON data for the store.
export const encodeParked = (parked: Parked): Values => ({
  format: FORMAT,
  machine: parked.actor.machine,
  name: parked.actor.name,
  operation: parked.operation,
  lane: parked.lane,
  kept: parked.kept,
  endings: parked.endings.map((e) => ({
    attempt: Option.getOrNull(e.attempt),
    channel: e.channel,
    reason: e.reason,
    value: Result.getOrElse(Schema.decodeUnknownResult(Schema.Json)(e.value), () => null),
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
 * An incarnation's record as JSON data (WriteAhead R4): its state, its memory encoded by the
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
 * A lane's record as JSON data (WriteAhead R5): its Attempt with its encoded input, and whether
 * it was InFlight at capture.
 */
export const encodeLane = (compiled: Compiled, lane: Lane) => {
  const operation = compiled.operations.get(lane.operation);

  if (operation === undefined) return Option.none();

  return Result.getSuccess(
    Result.map(jsonOf(operation.inputJson, lane.head.input), (input) => ({
      format: FORMAT,
      machine: lane.actor.machine,
      name: lane.actor.name,
      operation: lane.operation,
      keyText: lane.keyText,
      attempt: lane.head.id,
      input,
      retryCount: lane.head.retryCount,
      mayHaveApplied: lane.head.mayHaveApplied,
      sent: lane.head.sent,
      inFlight: !Phase.$is("Held")(lane.head.phase),
    })),
  );
};

const decodeActorJson = Schema.decodeUnknownResult(ActorRecordJson);

const decodeLaneJson = Schema.decodeUnknownResult(LaneRecordJson);

/**
 * What a boot reads back: actor records and lanes, each decoded by its machine's Schemas; a
 * record that does not decode is dropped (quarantine is the Restore Spec's R5, not built here).
 */
export type Restored = {
  readonly records: ReadonlyArray<ActorRecord>;
  readonly lanes: ReadonlyArray<{ readonly lane: Lane; readonly inFlight: boolean }>;
  readonly parked: ReadonlyArray<Parked>;
};

/**
 * Decodes the store's records with the machines they name (Restore R1, R3).
 *
 * **Details**
 *
 * Restored lanes are Held: an Attempt acknowledged once ends unknown `Restored` (Restore R3).
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
  const parkedRecord = (value: unknown) =>
    Option.map(
      Result.getSuccess(Schema.decodeUnknownResult(ParkedJson)(value)),
      (r) =>
        ({
          lane: r.lane,
          actor: { machine: r.machine, name: r.name },
          operation: r.operation,
          kept: r.kept,
          endings: r.endings.map((e) => ({
            operation: r.operation,
            attempt: Option.fromNullOr(e.attempt),
            lane: Option.some(r.lane),
            channel: e.channel,
            reason: e.reason,
            value: e.value,
            owner: 0,
            current: true,
            redelivered: false,
            parked: true,
          })),
        }) satisfies Parked,
    );

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

      const lane: Lane = {
        id: laneId(actor, r.operation, r.keyText),
        actor,
        operation: r.operation,
        key: Struct.pick(input, operation.keyFields),
        keyText: r.keyText,
        head: {
          id: r.attempt,
          input,
          retryCount: r.retryCount,
          mayHaveApplied: r.mayHaveApplied,
          sent: r.sent,
          owner: 0,
          phase: Phase.Held(),
        },
      };

      return { inFlight: r.inFlight, lane };
    });

  const entries = [...stored];

  // FLOW_STATE_ALLOW_UNKNOWN: a stored value is parsed JSON until its key's decoder reads it.
  const of = <A>(prefix: string, decode: (value: unknown) => Option.Option<A>) =>
    entries.flatMap(([key, value]) =>
      key.startsWith(prefix) ? Option.toArray(decode(value)) : [],
    );

  return {
    records: of("actor/", actorRecord),
    lanes: of("lane/", laneRecord),
    parked: of("parked/", parkedRecord),
  };
};
