import { Option, Predicate, Result, Schema } from "effect";
import { parseCanonical, writeCanonical } from "./codec.ts";
import { keyTextOfLane, type Owner } from "./record-key.ts";
import { strictly } from "./record-shape.ts";

// Format 5's lane and owed records, read only to step them into one work body. Formats 1 to 4 saved
// them in the same shape.
const LaneFive = Schema.Struct({
  format: Schema.Literals([1, 2, 3, 4, 5]),
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

const OwedFive = Schema.Struct({
  format: Schema.Literals([1, 2, 3, 4, 5]),
  machine: Schema.String,
  name: Schema.String,
  rows: Schema.Array(
    Schema.Struct({
      operation: Schema.String,
      lane: Schema.NullOr(Schema.String),
      attempt: Schema.NullOr(Schema.String),
      channel: Schema.Literals(["success", "failure", "notSent", "unknown"]),
      reason: Schema.String,
      value: Schema.Json,
      kept: Schema.Boolean,
    }),
  ),
});

type Json = Schema.Json;

type JsonObject = { readonly [field: string]: Json };

/**
 * One format 5 lane record of a group, with the operation and key text its key names.
 */
export type LegacyLane = {
  readonly operation: string;
  readonly keyText: string;
  // FLOW_STATE_ALLOW_UNKNOWN: a stored value, decoded here by format 5's lane Schema.
  readonly json: unknown;
};

const failed = Result.fail("step" as const);

// RETURN_TYPE: a type guard narrows a JSON value to its object form.
const isObject = (json: Json): json is JsonObject =>
  Predicate.isObject(json) && !Array.isArray(json);

const same = (a: Json, b: Json) =>
  Result.getOrUndefined(writeCanonical(a)) === Result.getOrUndefined(writeCanonical(b));

// An input without the fields its key text's JSON object names, each of which must equal the key's.
const restOf = (input: Json, key: JsonObject) => {
  if (!isObject(input)) return failed;

  const fields = Object.keys(key);

  if (!fields.every((f) => Object.hasOwn(input, f) && same(input[f] ?? null, key[f] ?? null)))
    return failed;

  return Result.succeed(Object.fromEntries(Object.entries(input).filter(([f]) => !(f in key))));
};

const keyOf = (keyText: string) =>
  Result.flatMap(
    Result.mapError(parseCanonical(keyText), () => "step" as const),
    (json) => (isObject(json) ? Result.succeed(json) : failed),
  );

type RowFive = (typeof OwedFive.Type)["rows"][number];

// A format 5 row's ending: a Flow-made unknown saved its missing value as null.
const endingOf = (row: RowFive) => ({
  channel: row.channel,
  reason: row.reason,
  ...Option.match(
    Option.filter(Option.some(row.value), () => !(row.channel === "unknown" && row.value === null)),
    { onNone: () => ({}), onSome: (value) => ({ value }) },
  ),
});

// Each head's one unknown from the owed rows of its Attempt; a second one, or a final ending of a
// head's Attempt, fails the step.
const unknownsOf = (rows: ReadonlyArray<RowFive>, heads: ReadonlySet<string>) => {
  const unknowns = new Map<string, Json>();

  for (const row of rows.filter((r) => r.attempt !== null && heads.has(r.attempt))) {
    const attempt = row.attempt ?? "";

    if (row.channel !== "unknown" || unknowns.has(attempt)) return failed;

    unknowns.set(attempt, { ending: endingOf(row), kept: row.kept });
  }

  return Result.succeed(unknowns);
};

// The owed rows of no head, in order, each with the key text its lane id names.
const rowsOf = (owner: Owner, rows: ReadonlyArray<RowFive>, heads: ReadonlySet<string>) =>
  Result.all(
    rows
      .filter((row) => row.attempt === null || !heads.has(row.attempt))
      .map((row) =>
        Result.map(
          Option.match(Option.fromNullOr(row.lane), {
            onNone: () => Result.succeed(Option.none<string>()),
            onSome: (lane) =>
              Option.match(keyTextOfLane(owner, row.operation, lane), {
                onNone: () => failed,
                onSome: (text) => Result.succeed(Option.some(text)),
              }),
          }),
          (text) =>
            ({
              subject: "",
              contract: row.operation,
              ...Option.match(text, { onNone: () => ({}), onSome: (k) => ({ keyText: k }) }),
              ...Option.match(Option.fromNullOr(row.attempt), {
                onNone: () => ({}),
                onSome: (attempt) => ({ attempt }),
              }),
              ending: endingOf(row),
              kept: row.kept,
            }) satisfies Json,
        ),
      ),
  );

type Body = {
  lanes: Record<string, Record<string, Record<string, Json>>>;
  rows: ReadonlyArray<Json>;
};

// One lane record's entry of the work body: its head, its queue's rests and its displaced Attempts,
// or none when it holds nothing.
const laneOf = (lane: typeof LaneFive.Type, keyText: string, unknown: Option.Option<Json>) =>
  Result.flatMap(keyOf(keyText), (key) => {
    const queue = Result.all(lane.queue.map((q) => restOf(q, key)));
    const displaced = lane.displaced.map((attempt) => ({ attempt }));

    if (lane.attempt === null)
      return Result.map(queue, (rests) =>
        rests.length === 0 && displaced.length === 0
          ? Option.none<Json>()
          : Option.some<Json>({ queue: rests, displaced }),
      );

    const attempt = lane.attempt;

    return Result.flatMap(queue, (rests) =>
      Result.map(restOf(lane.input, key), (rest) =>
        Option.some<Json>({
          head: {
            attempt,
            rest,
            retryCount: lane.retryCount,
            hold: lane.inFlight ? "Out" : "Held",
            claims: [],
            ...Option.match(unknown, {
              onNone: () =>
                lane.inFlight
                  ? {}
                  : {
                      unknown: { ending: { channel: "unknown", reason: "Restored" }, kept: false },
                    },
              onSome: (u) => ({ unknown: u }),
            }),
          },
          queue: rests,
          displaced,
        }),
      ),
    );
  });

/**
 * A group's format 5 lane and owed records stepped into one work body, from their JSON and the
 * owner their keys name alone: each lane at the root subject under its operation's name, a head's
 * input as its rest beside its key, a Held head's unknown from its owed row (or `Restored` when it
 * has none), the other rows in order. `None` when the records hold nothing; fails when a record
 * names another identity, a field of a key differs from the input's, or an owed row ends a head's
 * Attempt with anything but an unknown, or with two.
 */
// FLOW_STATE_ALLOW_UNKNOWN: stored values, decoded here by format 5's Schemas.
export const workFromFive = (
  owner: Owner,
  lanes: ReadonlyArray<LegacyLane>,
  owed: Option.Option<unknown>,
) =>
  Result.gen(function* () {
    const named = (r: { readonly machine: string; readonly name: string }) =>
      r.machine === owner.machine && r.name === owner.name;

    const decodedLanes = yield* Result.all(
      lanes.map((l) =>
        Result.flatMap(
          Result.mapError(strictly(LaneFive)(l.json), () => "step" as const),
          (r) =>
            named(r) && r.operation === l.operation ? Result.succeed({ ...l, record: r }) : failed,
        ),
      ),
    );

    const rows = yield* Option.match(owed, {
      onNone: () => Result.succeed<(typeof OwedFive.Type)["rows"]>([]),
      onSome: (json) =>
        Result.flatMap(
          Result.mapError(strictly(OwedFive)(json), () => "step" as const),
          (r) => (named(r) ? Result.succeed(r.rows) : failed),
        ),
    });

    const heads = new Set(
      decodedLanes.flatMap((l) => (l.record.attempt === null ? [] : [l.record.attempt])),
    );

    const unknowns = yield* unknownsOf(rows, heads);
    const body: Body = { lanes: {}, rows: yield* rowsOf(owner, rows, heads) };

    for (const l of decodedLanes) {
      const unknown = Option.fromUndefinedOr(
        l.record.attempt === null ? undefined : unknowns.get(l.record.attempt),
      );

      const entry = yield* laneOf(l.record, l.keyText, unknown);

      for (const json of Option.toArray(entry)) {
        const root = body.lanes[""] ?? {};
        root[l.operation] = { ...root[l.operation], [l.keyText]: json };
        body.lanes[""] = root;
      }
    }

    return Object.keys(body.lanes).length === 0 && body.rows.length === 0
      ? Option.none<Body>()
      : Option.some(body);
  });
