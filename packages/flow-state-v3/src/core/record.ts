import { Option, Predicate, Result, Schema } from "effect";
import { decodeCanonical, parseCanonical, toCanonicalJson, writeJson } from "./codec.ts";
import { decodeActor } from "./actor-record.ts";
import { decodeName } from "./identity.ts";
import type { Compiled, Operation, Values } from "./compiled.ts";
import {
  actorOf,
  decodeBy,
  FORMAT,
  Format,
  FormatJson,
  reasonOf,
  textOf,
} from "./record-format.ts";
import { Channel } from "./vocabulary.ts";
import { keyTextOf } from "./lane-moves.ts";
import { type Owed, Route } from "./ledger.ts";
import {
  type ActorId,
  type ActorRecord,
  type Lane,
  actorKey,
  byCodeUnits,
  Phase,
} from "./world.ts";

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

// The identity every kind of record names.
const IdentityJson = Schema.Struct({ machine: Schema.String, name: Schema.String });

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
 * Why a boot keeps a lane record aside whose identity decodes but whose operation its machine no
 * longer declares: a hold an earlier release left.
 */
const OPERATION_GONE = "operation";

/**
 * The operation of a lane record of `actor` the boot kept aside because its machine no longer
 * declares that operation: a hold an earlier release left, which forget drops.
 */
export const retiredOperation = (actor: ActorId, key: string, reason: string) => {
  const own = laneRecordKey(`${actorKey(actor)}|`);

  return reason === OPERATION_GONE && key.startsWith(own)
    ? Option.fromUndefinedOr(key.slice(own.length).split("|")[0])
    : Option.none<string>();
};

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
      Result.flatMap(Result.all(l.queue.map((q) => operation.walk.input.text(q.input))), (queue) =>
        Result.flatMap(operation.walk.input.text(l.head.input), (input) =>
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
type Quarantined = { readonly key: string; readonly reason: string };

/**
 * A saved Waiting or Kept row as a boot reads it back: owed to its identity, delivered current
 * from the active leaf.
 */
type RestoredRow = Omit<Owed, "id" | "delivery" | "to"> & { readonly kept: boolean };

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

  // A row's operation is one its machine declares, and a lane it names is that identity's lane of
  // that operation. The machine itself is the identity check's.
  const rowOf = (
    compiled: Option.Option<Compiled>,
    actor: ActorId,
    operation: string,
    lane: Option.Option<string>,
  ) => {
    if (Option.exists(compiled, (c) => !c.operations.has(operation)))
      return Result.fail("operation");

    return Option.match(lane, {
      onNone: () => true,
      onSome: (id) => id.startsWith(`${actorKey(actor)}|${operation}|`),
    })
      ? Result.succeed(operation)
      : Result.fail("lane");
  };

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const rowsRecord = (value: unknown) =>
    Result.map(
      Result.flatMap(decodeBy(OwedJson, "schema")(value), (r) =>
        Result.map(
          Result.all(
            r.rows.map((e) =>
              rowOf(
                Option.fromUndefinedOr(machines.get(r.machine)),
                actorOf(r),
                e.operation,
                Option.fromNullOr(e.lane),
              ),
            ),
          ),
          () => r,
        ),
      ),
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
          route: Route.Current(),
        })) satisfies ReadonlyArray<RestoredRow>,
    );

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const laneRecord = (id: string, value: unknown) =>
    Result.gen(function* () {
      const r = yield* decodeBy(LaneRecordJson, "schema")(value);
      const compiled = yield* machineOf(r);

      const operation = yield* Result.fromNullishOr(
        compiled.operations.get(r.operation),
        () => OPERATION_GONE,
      );

      const actor = actorOf(r);
      const own = `${actorKey(actor)}|${r.operation}|`;

      if (!id.startsWith(own)) return yield* Result.fail("key");
      yield* keyNamesItself(operation, id.slice(own.length));

      const lane = yield* Option.match(Option.fromNullOr(r.attempt), {
        onNone: () => Result.succeed(Option.none<Lane>()),
        onSome: (attempt) =>
          Result.flatMap(
            Result.mapError(operation.walk.input.decode(r.input), () => "input"),
            (input) =>
              Result.map(
                Result.flatMap(
                  Result.fromNullishOr(
                    Option.getOrUndefined(keyTextOf(operation, input)),
                    () => "key",
                  ),
                  (text) => (id === `${own}${text}` ? Result.succeed(text) : Result.fail("key")),
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

      const ended = { kept: false, actor, operation: r.operation, route: Route.Current() };

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

  // A lane key's text, read by its operation's key fields, must name itself back, as a name does.
  // A lane key's text: its operation's key fields in their input order, as JSON text written back
  // byte for byte; its values are read by their Schemas only when a head's input names it.
  const keyNamesItself = (operation: Operation, text: string) =>
    Result.flatMap(
      Result.mapError(parseCanonical(text), () => "key"),
      (json) =>
        Predicate.isObject(json) &&
        !Array.isArray(json) &&
        Object.keys(json).join("\n") ===
          operation.inputFields.filter((f) => operation.keyFields.includes(f)).join("\n") &&
        Result.getOrUndefined(writeJson(json)) === text
          ? Result.succeed(text)
          : Result.fail("key"),
    );

  // The identity a record names, trusted only when its machine is declared, it is one a ref could
  // give (never a local actor's) and its key is the key that identity's record of this kind is
  // saved under: exactly, or for a lane, as the start of its id.
  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, read for the identity its key names.
  const identityIn = (kind: (typeof KINDS)[number], key: string, value: unknown) =>
    Result.gen(function* () {
      const named = yield* decodeBy(IdentityJson, "schema")(value);

      yield* decodeName(yield* machineOf(named), named.name);
      const own = `${kind}${actorKey(actorOf(named))}`;

      const keyed = kind === "lane/" ? key.startsWith(`${own}|`) : key === own;

      return yield* keyed ? Result.succeed(named) : Result.fail("key");
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
      // A key of no kind is never read; a record is read first for its format, then for the
      // identity it names, which must be the one its key names.
      (json) =>
        Result.map(
          kind === undefined
            ? Result.fail("kind")
            : Result.flatMap(decodeBy(FormatJson, "format")(json), () =>
                identityIn(kind, key, json),
              ),
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
