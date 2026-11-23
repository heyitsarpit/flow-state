import { Option, Predicate, Result, Schema } from "effect";
import type { Compiled, Operation, Values } from "./compiled.ts";
import { Route, type Owed } from "./ledger.ts";
import { keyFieldsOf, namesOf, operationNamed } from "./record-names.ts";
import type { SavedEnding, SavedHead, SavedLane, SavedRow, Work } from "./record-shape.ts";
import { isUnencodableDecline } from "./record-work.ts";
import { Decline } from "./vocabulary.ts";
import {
  type ActorId,
  byCodeUnits,
  type CarriedPart,
  type Lane,
  type LaneId,
  laneId,
  OwnedBy,
  Phase,
  Place,
} from "./world.ts";

type Json = Schema.Json;

type Key = { readonly [field: string]: Json };

/**
 * A saved row as the boot reads it back: owed to its identity, delivered current from the active
 * leaf, Kept or waiting for the identity's next start.
 */
export type RestoredRow = Omit<Owed, "id" | "delivery" | "life" | "origin" | "refusal"> & {
  readonly kept: boolean;
};

/**
 * A row the boot restores, with whether it derived it (an ending owed now) or read it back.
 */
export type Owing = { readonly row: RestoredRow; readonly derived: boolean };

/**
 * What one identity's work record gives the boot: its lanes, restored Held; its rows in delivery
 * order (saved rows, then those derived from queues and displaced lists, then heads' unknowns in
 * lane-id order); its carried parts; and whether its saved form changes.
 */
export type WorkRead = {
  readonly lanes: ReadonlyArray<readonly [LaneId, Lane]>;
  readonly rows: ReadonlyArray<Owing>;
  readonly carried: ReadonlyArray<CarriedPart>;
  readonly dirty: boolean;
};

// One lane's or row's share of a work record's reading.
type Part = {
  readonly lanes: ReadonlyArray<readonly [LaneId, Lane]>;
  readonly saved: ReadonlyArray<RestoredRow>;
  readonly derived: ReadonlyArray<RestoredRow>;
  readonly heads: ReadonlyArray<readonly [LaneId, Owing]>;
  readonly carried: ReadonlyArray<CarriedPart>;
  readonly dirty: boolean;
};

const none: Part = { lanes: [], saved: [], derived: [], heads: [], carried: [], dirty: false };

// RETURN_TYPE: two parts joined are one Part, field by field.
const both = (a: Part, b: Part): Part => ({
  lanes: [...a.lanes, ...b.lanes],
  saved: [...a.saved, ...b.saved],
  derived: [...a.derived, ...b.derived],
  heads: [...a.heads, ...b.heads],
  carried: [...a.carried, ...b.carried],
  dirty: a.dirty || b.dirty,
});

const carriedPart = (part: CarriedPart) => ({ ...none, carried: [part] }) satisfies Part;

const root = "";

// RETURN_TYPE: a type guard narrows a JSON value to its object form.
const isJsonObject = (json: Json): json is Key => Predicate.isObject(json) && !Array.isArray(json);

// An input read from its rest merged with its key: a rest that holds a key field does not read, nor
// one whose input does not name the same key back.
const inputOf = (operation: Operation, key: Key, text: string, rest: Json) =>
  isJsonObject(rest) && !Object.keys(key).some((f) => Object.hasOwn(rest, f))
    ? Option.filter(
        Result.getSuccess(
          operation.walk.input.decode(
            Object.fromEntries([...Object.entries(rest), ...Object.entries(key)]),
          ),
        ),
        (input) => Option.contains(operation.walk.keyText(input), text),
      )
    : Option.none<Values>();

// An ending as a row of its channel reads it: a decline names one of Flow's reasons.
const endingReads = (ending: SavedEnding) =>
  ending.channel !== "notSent" || Schema.is(Decline)(ending.reason);

const endingOf = (ending: SavedEnding) => ({
  channel: ending.channel,
  reason: ending.reason,
  value: ending.value,
});

type Readable = {
  readonly queue: ReadonlyArray<Values>;
  readonly displaced: ReadonlyArray<{
    readonly attempt: SavedLane["displaced"][number]["attempt"];
    readonly input: Option.Option<Values>;
    readonly json: SavedLane["displaced"][number];
  }>;
  readonly head: Option.Option<{
    readonly saved: SavedHead;
    readonly input: Values;
  }>;
};

// A lane entry's parts read with its key, or none when any part that must read does not.
const readable = (operation: Operation, key: Key, text: string, lane: SavedLane) => {
  const read = (rest: Json) => inputOf(operation, key, text, rest);
  const queue = lane.queue.map(read);
  const head = "head" in lane ? Option.some(lane.head) : Option.none();
  const headInput = Option.map(head, (h) => read(h.rest));

  const displaced = lane.displaced.map((d) => ({
    attempt: d.attempt,
    input: Option.map(Option.fromUndefinedOr(d.rest), read),
    json: d,
  }));

  const unread =
    queue.some(Option.isNone) ||
    displaced.some((d) => Option.exists(d.input, Option.isNone)) ||
    Option.exists(headInput, Option.isNone) ||
    Option.exists(head, (h) => h.unknown !== undefined && !endingReads(h.unknown.ending));

  return unread
    ? Option.none<Readable>()
    : Option.some<Readable>({
        queue: queue.flatMap(Option.toArray),
        displaced: displaced.map((d) => ({ ...d, input: Option.flatten(d.input) })),
        head: Option.flatMap(head, (saved) =>
          Option.map(Option.flatten(headInput), (input) => ({ saved, input })),
        ),
      });
};

// A readable lane by the table of Lanes and rows: its head restored Held, owing its unknown (the
// one saved, or Restored for a head out at the capture); each queued commit NotSent Restored; each
// displaced Attempt with its rest unknown Restored, and one with none carried.
// RETURN_TYPE: a Part, so each share of the lane joins the others.
const restored = (
  actor: ActorId,
  operation: Operation,
  contract: string,
  text: string,
  lane: Readable,
): Part => {
  const id = laneId(actor, operation.name, text);
  const ended = { actor, operation: operation.name, route: Route.Current(), kept: false };

  const queued = lane.queue.map(
    (input) =>
      ({
        ...ended,
        attempt: Option.none(),
        lane: Option.none(),
        channel: "notSent",
        reason: "Restored",
        value: { why: "Restored" },
        input: Option.some(input),
      }) satisfies RestoredRow,
  );

  const displaced = lane.displaced.map((d) =>
    Option.match(d.input, {
      onNone: () =>
        carriedPart({
          place: Place.Displaced({ subject: root, contract, keyText: text }),
          json: d.json,
          why: "Unread",
          held: Option.none(),
        }),
      onSome: (input) =>
        ({
          ...none,
          dirty: true,
          derived: [
            {
              ...ended,
              attempt: Option.some(d.attempt),
              lane: Option.some(id),
              channel: "unknown",
              reason: "Restored",
              value: undefined,
              input: Option.some(input),
            },
          ],
        }) satisfies Part,
    }),
  );

  const head = Option.match(lane.head, {
    onNone: () => none,
    onSome: ({ saved, input }) => {
      const unknown = Option.fromUndefinedOr(saved.unknown);

      const owing: ReadonlyArray<readonly [LaneId, Owing]> =
        saved.hold === "Out" || Option.isSome(unknown)
          ? [
              [
                id,
                {
                  row: {
                    ...ended,
                    attempt: Option.some(saved.attempt),
                    lane: Option.some(id),
                    ...Option.match(unknown, {
                      onNone: () => ({
                        channel: "unknown" as const,
                        reason: "Restored",
                        value: undefined,
                        kept: false,
                      }),
                      onSome: (u) => ({ ...endingOf(u.ending), kept: u.kept }),
                    }),
                    input: Option.some(input),
                  },
                  derived: Option.isNone(unknown),
                },
              ],
            ]
          : [];

      return {
        ...none,
        dirty: saved.hold === "Out",
        heads: owing,
        lanes: [
          [
            id,
            {
              actor,
              operation: operation.name,
              head: {
                id: saved.attempt,
                input,
                retryCount: saved.retryCount,
                owner: OwnedBy.Root(),
                phase: Phase.Held(),
                progress: Option.none(),
                started: Option.none(),
              },
              queue: [],
            },
          ],
        ],
      } satisfies Part;
    },
  });

  return [{ ...none, derived: queued, dirty: queued.length > 0 }, ...displaced, head].reduce(
    both,
    none,
  );
};

// One lane entry against its operation: restored by the table, or carried with its key held.
const resolveLane = (
  compiled: Compiled,
  actor: ActorId,
  operation: Operation,
  contract: string,
  text: string,
  lane: SavedLane,
) =>
  Option.match(
    Option.flatMap(
      Option.flatMap(namesOf(compiled).keyText(operation)(text), (kept) =>
        keyFieldsOf(operation, kept),
      ),
      (key) => readable(operation, key, text, lane),
    ),
    {
      onNone: () =>
        carriedPart({
          place: Place.Lane({ subject: root, contract, keyText: text }),
          json: lane,
          why: "Unread",
          held: Option.some({ operation: operation.name, keyText: text }),
        }),
      onSome: (read) => restored(actor, operation, contract, text, read),
    },
  );

// A saved row against its machine: read whole, or none, so it is carried. A decline whose input
// had no encoded form is read with no key.
const resolveRow = (compiled: Compiled, actor: ActorId, row: SavedRow, stepped: boolean) => {
  const operation =
    row.subject === root ? operationNamed(compiled, row.contract, stepped) : Option.none();

  const common = { actor, route: Route.Current(), kept: row.kept, ...endingOf(row.ending) };

  if (row.keyText === undefined || row.rest === undefined)
    return Option.filter(
      Option.map(operation, (op) => ({
        ...common,
        operation: op.name,
        attempt: Option.none(),
        lane: Option.none(),
        input: Option.none(),
      })),
      () =>
        row.keyText === undefined &&
        isUnencodableDecline({ ...row.ending, attempt: Option.fromUndefinedOr(row.attempt) }),
    );

  const text = row.keyText;
  const rest = row.rest;

  return Option.filter(
    Option.flatMap(operation, (op) =>
      Option.flatMap(keyFieldsOf(op, text), (key) =>
        Option.map(inputOf(op, key, text, rest), (input) => ({
          ...common,
          operation: op.name,
          attempt: Option.fromUndefinedOr(row.attempt),
          lane: Option.map(Option.fromUndefinedOr(row.attempt), () => laneId(actor, op.name, text)),
          input: Option.some(input),
        })),
      ),
    ),
    () => endingReads(row.ending),
  );
};

// A subject's lanes by contract: each restored or carried.
const resolveSubject = (
  compiled: Compiled,
  actor: ActorId,
  subject: string,
  byContract: Work["lanes"][string],
  stepped: boolean,
) =>
  Object.entries(byContract)
    .map(([contract, byKey]) =>
      Option.match(operationNamed(compiled, contract, stepped), {
        onNone: () =>
          carriedPart({
            place: Place.Contract({ subject, contract }),
            json: byKey,
            why: "Retired",
            held: Option.none(),
          }),
        onSome: (operation) =>
          Object.entries(byKey)
            .map(([text, lane]) => resolveLane(compiled, actor, operation, contract, text, lane))
            .reduce(both, none),
      }),
    )
    .reduce(both, none);

/**
 * A work record read against its machine through the reference table: each lane restored or
 * carried, each row read or carried at its place, and what a reload owes derived by the table of
 * Lanes and rows. A stepped body names its lanes' contracts by format 5's operation names.
 */
export const resolveWork = (compiled: Compiled, actor: ActorId, body: Work, stepped: boolean) => {
  const lanes = Object.entries(body.lanes)
    .map(([subject, byContract]) =>
      Option.isNone(namesOf(compiled).subject(subject))
        ? carriedPart({
            place: Place.Subject({ subject }),
            json: byContract,
            why: "Retired",
            held: Option.none(),
          })
        : resolveSubject(compiled, actor, subject, byContract, stepped),
    )
    .reduce(both, none);

  const rows = body.rows.reduce<Part>(
    (read, row) =>
      Option.match(resolveRow(compiled, actor, row, stepped), {
        onNone: () =>
          both(
            read,
            carriedPart({
              place: Place.Row({ after: read.saved.length }),
              json: row,
              why: "Unread",
              held: Option.none(),
            }),
          ),
        onSome: (restoredRow) => both(read, { ...none, saved: [restoredRow] }),
      }),
    none,
  );

  const read = both(lanes, rows);

  // One ending per Attempt beyond its final answer: a head out at the save whose Attempt already
  // has a saved row (its parked unknown, or a NotSent) owes nothing more (Operations, Rows).
  const told = new Set(read.saved.flatMap((row) => Option.toArray(row.attempt)));

  const owedByHeads = read.heads
    .toSorted(([a], [b]) => byCodeUnits(a, b))
    .map(([, owing]) => owing)
    .filter((owing) => !owing.derived || !Option.exists(owing.row.attempt, (a) => told.has(a)));

  return {
    lanes: read.lanes,
    rows: [
      ...read.saved.map((row) => ({ row, derived: false })),
      ...read.derived.map((row) => ({ row, derived: true })),
      ...owedByHeads,
    ],
    carried: read.carried,
    dirty: stepped || read.dirty,
  } satisfies WorkRead;
};
