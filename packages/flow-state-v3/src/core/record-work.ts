import { Option, Predicate, Result, type Schema } from "effect";
import { toCanonicalJson } from "./codec.ts";
import type { Compiled, Operation, Values } from "./compiled.ts";
import { Audience, Delivery, type Owed } from "./ledger.ts";
import { keyTextOfLane } from "./record-key.ts";
import { textOf } from "./record.ts";
import {
  type ActorId,
  type Carried,
  type Displaced,
  type Lane,
  type LaneId,
  Phase,
  Place,
} from "./world.ts";

type Json = Schema.Json;

// A part of a work body as it is written: JSON, or an input's encoded form, which is JSON.
type Part = Json | Values;

type LaneJson = {
  readonly head: Option.Option<Part>;
  readonly queue: ReadonlyArray<Part>;
  readonly displaced: ReadonlyArray<Part>;
};

/**
 * What an identity's work record is written from: its lanes, the displaced Attempts it owes, the
 * rows owed to it in order, and the parts it carries.
 */
export type WorkParts = {
  readonly actor: ActorId;
  readonly lanes: ReadonlyArray<readonly [LaneId, Lane]>;
  readonly displaced: ReadonlyArray<Displaced>;
  readonly rows: ReadonlyArray<Owed>;
  readonly carried: Carried;
};

/**
 * Whether a row is a decline of a commit whose input has no encoded form: no Attempt, NotSent
 * Unencodable. Its saved row has no key and no rest.
 */
export const isUnencodableDecline = (row: {
  readonly attempt: Option.Option<string>;
  readonly channel: string;
  readonly reason: string;
}) => Option.isNone(row.attempt) && row.channel === "notSent" && row.reason === "Unencodable";

// An input as its operation's encoded JSON without its key fields.
const restOf = (operation: Operation, input: Values) =>
  Result.map(operation.walk.input.encode(input), (encoded) =>
    Object.fromEntries(Object.entries(encoded).filter(([f]) => !operation.keyFields.includes(f))),
  );

const valueOf = (value: Option.Option<Json>) =>
  Option.match(value, { onNone: () => ({}), onSome: (v) => ({ value: v }) });

// An ending as a row saves it; a value with no canonical form is saved as the ending a crash before
// its save would have restored: its Attempt's unknown Restored.
const endingJson = (row: Pick<Owed, "channel" | "reason" | "value">) =>
  Option.match(
    row.value === undefined
      ? Option.some(Option.none<Json>())
      : Option.map(Result.getSuccess(toCanonicalJson(row.value)), Option.some),
    {
      onNone: () => ({ ending: { channel: "unknown", reason: "Restored" }, lost: true }),
      onSome: (value) => ({
        ending: { channel: row.channel, reason: row.reason, ...valueOf(value) },
        lost: false,
      }),
    },
  );

type Entry = { readonly contract: string; readonly keyText: string; readonly lane: LaneJson };

// A lane as its work record saves it, with its head's one unknown from the rows owed for its
// Attempt.
const laneEntry = (operation: Operation, lane: Lane, rows: ReadonlyArray<Owed>) =>
  Result.gen(function* () {
    const text = yield* Result.fromNullishOr(
      Option.getOrUndefined(operation.walk.keyText(lane.head.input)),
      () => "key",
    );

    const rest = yield* Result.mapError(restOf(operation, lane.head.input), () => "input");

    const queue = yield* Result.mapError(
      Result.all(lane.queue.map((q) => restOf(operation, q.input))),
      () => "input",
    );

    const unknown = Option.fromUndefinedOr(
      rows.find((r) => Option.contains(r.attempt, lane.head.id) && r.channel === "unknown"),
    );

    const head = {
      attempt: lane.head.id,
      rest,
      retryCount: lane.head.retryCount + (Phase.$is("Recapturing")(lane.head.phase) ? 1 : 0),
      hold: Phase.$is("Held")(lane.head.phase) ? "Held" : "Out",
      claims: [],
      ...Option.match(unknown, {
        onNone: () => ({}),
        onSome: (u) => ({
          unknown: { ending: endingJson(u).ending, kept: Delivery.$is("Kept")(u.delivery) },
        }),
      }),
    };

    return {
      contract: operation.contract,
      keyText: text,
      lane: { head: Option.some(head), queue, displaced: [] },
    } satisfies Entry;
  });

// A displaced Attempt as its lane's work entry saves it, with its rest.
const displacedEntry = (operation: Operation, d: Displaced) =>
  Option.match(
    Option.all({
      text: keyTextOfLane(d.actor, d.operation, d.lane),
      rest: Result.getSuccess(restOf(operation, d.head.input)),
    }),
    {
      onNone: () => Result.fail("displaced"),
      onSome: ({ text, rest }) =>
        Result.succeed({
          contract: operation.contract,
          keyText: text,
          lane: { head: Option.none(), queue: [], displaced: [{ attempt: d.head.id, rest }] },
        } satisfies Entry),
    },
  );

// The rows saved apart from the heads: a head's one unknown sits in its slot, and an unknown a later
// row of the same Attempt answers is replaced by it (Records, Lanes and rows).
const savedRows = (rows: ReadonlyArray<Owed>, heads: ReadonlySet<string>) => {
  const last = new Map<string, number>();
  const firstFinal = new Map<string, number>();

  for (const [at, row] of rows.entries())
    for (const attempt of Option.toArray(row.attempt)) {
      last.set(attempt, at);

      if (row.channel !== "unknown" && !firstFinal.has(attempt)) firstFinal.set(attempt, at);
    }

  return rows.filter((row, at) =>
    Option.match(row.attempt, {
      onNone: () => true,
      onSome: (attempt) =>
        !heads.has(attempt) &&
        (firstFinal.get(attempt) ?? at) >= at &&
        (row.channel !== "unknown" || last.get(attempt) === at),
    }),
  );
};

// What one row saves: its JSON, or nothing when its input has no key (counted lost), with whether
// its value was saved as unknown Restored.
type RowSaved = { readonly json: Option.Option<Part>; readonly unsaved: boolean };

// RETURN_TYPE: a RowSaved, so its JSON branches are one Part option.
const rowJson = (operation: Option.Option<Operation>, row: Owed): RowSaved => {
  const { ending, lost } = endingJson(row);
  const kept = Delivery.$is("Kept")(row.delivery);

  const keyed = Option.flatMap(operation, (op) =>
    Option.flatMap(row.input, (input) =>
      Option.all({
        contract: Option.some(op.contract),
        keyText: op.walk.keyText(input),
        rest: Result.getSuccess(restOf(op, input)),
      }),
    ),
  );

  return Option.match(keyed, {
    // A decline whose input has no encoded form has no key: it is saved without one, and read
    // without one, since it has no lane and its mapper takes no input.
    onNone: () => ({
      json: Option.filter(
        Option.map(operation, (op) => ({ subject: "", contract: op.contract, ending, kept })),
        () => isUnencodableDecline(row),
      ),
      unsaved: false,
    }),
    onSome: ({ contract, keyText, rest }) => ({
      json: Option.some({
        subject: "",
        contract,
        keyText,
        ...Option.match(row.attempt, { onNone: () => ({}), onSome: (attempt) => ({ attempt }) }),
        rest,
        ending,
        kept,
      }),
      unsaved: lost,
    }),
  });
};

const laneJson = (lane: LaneJson) => ({
  ...Option.match(lane.head, { onNone: () => ({}), onSome: (head) => ({ head }) }),
  queue: lane.queue,
  displaced: lane.displaced,
});

type ByKey = Map<string, Building | Part>;

type Nested = Map<string, Map<string, ByKey>>;

const at = <V>(map: Map<string, V>, key: string, empty: () => V) => {
  const known = map.get(key);

  if (known !== undefined) return known;

  const made = empty();
  map.set(key, made);

  return made;
};

const laneAt = (lanes: Nested, subject: string, contract: string) =>
  at(
    at(lanes, subject, () => new Map<string, ByKey>()),
    contract,
    () => new Map<string, Building | Part>(),
  );

// A lane being written: its head, and the queue and displaced Attempts gathered for it.
type Building = {
  head: Option.Option<Part>;
  readonly queue: Array<Part>;
  readonly displaced: Array<Part>;
};

// RETURN_TYPE: a type guard tells a lane being written from a carried part's JSON.
const isBuilding = (value: Building | Part): value is Building =>
  Predicate.hasProperty(value, "head") && Option.isOption(value.head);

// A lane's entries merged into the one being written: a head with its queue, and displaced
// Attempts beside it, gathered in place.
const merge = (byKey: Map<string, Building | Part>, keyText: string, entry: LaneJson) => {
  const was = byKey.get(keyText);

  const lane: Building =
    was !== undefined && isBuilding(was) ? was : { head: Option.none(), queue: [], displaced: [] };

  lane.head = Option.orElse(lane.head, () => entry.head);
  lane.queue.push(...entry.queue);
  lane.displaced.push(...entry.displaced);
  byKey.set(keyText, lane);
};

// The body's lanes, with each carried part written back at its place, unchanged: a whole subject,
// a whole contract's lanes, a lane, or a displaced Attempt beside a lane's own.
const lanesOf = (entries: ReadonlyArray<Entry>, carried: Carried) => {
  const lanes: Nested = new Map();
  const subjects = new Map<string, Json>();
  const contracts = new Map<string, Map<string, Json>>();

  for (const e of entries) merge(laneAt(lanes, "", e.contract), e.keyText, e.lane);

  for (const part of carried)
    Place.$match(part.place, {
      Subject: ({ subject }) => void subjects.set(subject, part.json),
      Contract: ({ subject, contract }) =>
        void at(contracts, subject, () => new Map<string, Json>()).set(contract, part.json),
      Lane: ({ subject, contract, keyText }) =>
        void laneAt(lanes, subject, contract).set(keyText, part.json),
      Displaced: ({ subject, contract, keyText }) =>
        merge(laneAt(lanes, subject, contract), keyText, {
          head: Option.none(),
          queue: [],
          displaced: [part.json],
        }),
      Row: () => undefined,
    });

  const keyed = (byKey: ReadonlyMap<string, Building | Part>) =>
    Object.fromEntries(
      [...byKey].map(([text, lane]) => [text, isBuilding(lane) ? laneJson(lane) : lane]),
    );

  const subjectOf = (subject: string) => {
    const whole = contracts.get(subject) ?? new Map<string, Json>();
    const byContract = lanes.get(subject) ?? new Map<string, ByKey>();
    const names = new Set([...byContract.keys(), ...whole.keys()]);

    return Object.fromEntries(
      [...names].map((contract) => [
        contract,
        whole.get(contract) ??
          keyed(byContract.get(contract) ?? new Map<string, Building | Part>()),
      ]),
    );
  };

  return Object.fromEntries(
    [...new Set([...lanes.keys(), ...contracts.keys(), ...subjects.keys()])].map((subject) => [
      subject,
      subjects.get(subject) ?? subjectOf(subject),
    ]),
  );
};

// The rows, with each carried row written back after the count of rows read before it.
const rowsOf = (rows: ReadonlyArray<Part>, carried: Carried) =>
  carried.reduce<ReadonlyArray<Part>>(
    (placed, part, n) =>
      Place.$match(part.place, {
        Row: ({ after }) => placed.toSpliced(Math.min(after + n, placed.length), 0, part.json),
        Subject: () => placed,
        Contract: () => placed,
        Lane: () => placed,
        Displaced: () => placed,
      }),
    rows,
  );

/**
 * An identity's work record as canonical text, or `None` when it holds nothing: each lane at the
 * root subject by its contract and key text, a head's input saved as its rest and its one unknown
 * in its slot, the rows owed to the identity in order, and each carried part written back at its
 * place. Counts the rows saved as unknown Restored because their value has no canonical form, and
 * the rows left out because their input has none.
 */
export const encodeWork = (machines: ReadonlyMap<string, Compiled>, parts: WorkParts) =>
  Result.gen(function* () {
    const compiled = yield* Result.fromNullishOr(
      machines.get(parts.actor.machine),
      () => "machine",
    );

    const operationOf = (name: string) => Option.fromUndefinedOr(compiled.operations.get(name));
    const owed = parts.rows.filter((r) => Audience.$is("Identity")(r.to));

    const lanes = yield* Result.all(
      parts.lanes.map(([, lane]) =>
        Option.match(operationOf(lane.operation), {
          onNone: () => Result.fail("operation"),
          onSome: (operation) => laneEntry(operation, lane, owed),
        }),
      ),
    );

    const displaced = yield* Result.all(
      parts.displaced.map((d) =>
        Option.match(operationOf(d.operation), {
          onNone: () => Result.fail("operation"),
          onSome: (operation) => displacedEntry(operation, d),
        }),
      ),
    );

    const heads = new Set<string>(parts.lanes.map(([, lane]) => lane.head.id));
    const rows = savedRows(owed, heads).map((row) => rowJson(operationOf(row.operation), row));

    const body = {
      lanes: lanesOf([...lanes, ...displaced], parts.carried),
      rows: rowsOf(
        rows.flatMap((r) => Option.toArray(r.json)),
        parts.carried,
      ),
    };

    return {
      text:
        Object.keys(body.lanes).length === 0 && body.rows.length === 0
          ? Option.none<string>()
          : Option.some(yield* textOf(body)),
      unsaved: rows.filter((r) => r.unsaved).length,
      lost: rows.filter((r) => Option.isNone(r.json)).length,
    };
  });
