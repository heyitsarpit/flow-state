import { Data, Option, Predicate, Result, type Schema } from "effect";
import { decodeCanonical } from "./codec.ts";
import type { Compiled } from "./compiled.ts";
import { positionFromOlder } from "./actor-record.ts";
import { workFromFive } from "./record-step.ts";
import { keyText, type Owner, ownerText, parseKey, RecordKey } from "./record-key.ts";
import {
  FORMAT,
  FormatOf,
  type Position,
  PositionRecord,
  strictly,
  type Work,
  WorkRecord,
} from "./record-shape.ts";
import { byCodeUnits, Quarantine } from "./world.ts";

type Json = Schema.Json;

type Side = "position" | "work";

type Read = { readonly key: string; readonly format: number; readonly json: Json };

type LegacyRead = Read & { readonly operation: string; readonly keyText: string };

// What stage 1 made of one stored key, by the first row of the Stage 1 table it fails.
type KeyRead = Data.TaggedEnum<{
  Foreign: { key: string };
  Failed: { key: string; owner: Owner; side: Side; detail: string };
  Newer: { key: string; owner: Owner };
  Read: { owner: Owner; record: RecordKey; read: Read };
}>;

const KeyRead = Data.taggedEnum<KeyRead>();

// An identity's keys as stage 1 read them, gathered before its group is judged.
type Raw = {
  readonly owner: Owner;
  readonly position: ReadonlyArray<Read>;
  readonly work: ReadonlyArray<Read>;
  readonly lanes: ReadonlyArray<LegacyRead>;
  readonly owed: ReadonlyArray<Read>;
  readonly failed: ReadonlyArray<{
    readonly key: string;
    readonly side: Side;
    readonly detail: string;
  }>;
  readonly newer: ReadonlyArray<string>;
};

/**
 * One identity's keys after stage 1: its position's body, its work's body (stepped from format 5's
 * lane and owed records or not), the legacy keys the next work write removes, and whether its
 * legacy records held nothing, so that write removes them alone.
 */
export type Group = {
  readonly owner: Owner;
  readonly keys: ReadonlyArray<string>;
  readonly position: Option.Option<{
    readonly key: string;
    readonly body: Position;
    readonly text: Option.Option<string>;
  }>;
  readonly work: Option.Option<{
    readonly key: string;
    readonly body: Work;
    readonly stepped: boolean;
  }>;
  readonly legacy: ReadonlyArray<string>;
  readonly emptied: boolean;
};

// RETURN_TYPE: the Side a key's kind is on.
const sideOf = (key: RecordKey): Side => (RecordKey.$is("Actor")(key) ? "position" : "work");

// The formats a key of each kind may hold, at most FORMAT.
const formatFits = (key: RecordKey, format: number) =>
  RecordKey.$match(key, {
    Actor: () => format >= 1,
    Work: () => format === FORMAT,
    Lane: () => format >= 1 && format < FORMAT,
    Owed: () => format >= 1 && format < FORMAT,
  });

// A record's `format` member alone, read before its body.
const formatField = (json: Json) =>
  Predicate.isObject(json) && !Array.isArray(json) && Object.hasOwn(json, "format")
    ? { format: json["format"] }
    : {};

// Rows 1 to 3 of the Stage 1 table on one key: its grammar, its text, its format.
// RETURN_TYPE: the KeyRead union, whichever row decides it.
const readKey = (text: string, value: string): KeyRead =>
  Option.match(parseKey(text), {
    onNone: () => KeyRead.Foreign({ key: text }),
    onSome: (record) => {
      const failed = (detail: string) =>
        KeyRead.Failed({ key: text, owner: record.owner, side: sideOf(record), detail });

      const json = decodeCanonical(value);

      if (Result.isFailure(json)) return failed("text");

      const format = Result.getSuccess(strictly(FormatOf)(formatField(json.success)));

      if (Option.isNone(format)) return failed("format");

      if (format.value.format > FORMAT) return KeyRead.Newer({ key: text, owner: record.owner });

      return formatFits(record, format.value.format)
        ? KeyRead.Read({
            owner: record.owner,
            record,
            read: { key: text, format: format.value.format, json: json.success },
          })
        : failed("format");
    },
  });

// RETURN_TYPE: the Raw an identity's first key starts.
const emptyRaw = (owner: Owner): Raw => ({
  owner,
  position: [],
  work: [],
  lanes: [],
  owed: [],
  failed: [],
  newer: [],
});

// The raw group with one more key read into it.
// RETURN_TYPE: the Raw with one more key, whichever kind it is.
const withKey = (raw: Raw, read: KeyRead): Raw =>
  KeyRead.$match(read, {
    Foreign: () => raw,
    Failed: ({ key, side, detail }) => ({ ...raw, failed: [...raw.failed, { key, side, detail }] }),
    Newer: ({ key }) => ({ ...raw, newer: [...raw.newer, key] }),
    Read: ({ record, read: one }) =>
      RecordKey.$match(record, {
        Actor: () => ({ ...raw, position: [...raw.position, one] }),
        Work: () => ({ ...raw, work: [...raw.work, one] }),
        Lane: ({ operation, keyText: lane }) => ({
          ...raw,
          lanes: [...raw.lanes, { ...one, operation, keyText: lane }],
        }),
        Owed: () => ({ ...raw, owed: [...raw.owed, one] }),
      }),
  });

// A position's body in the current format: its envelope's body, or an older format stepped.
const positionBody = (machines: ReadonlyMap<string, Compiled>, owner: Owner, read: Read) => {
  if (read.format === FORMAT)
    return Result.mapBoth(strictly(PositionRecord)(read.json), {
      onFailure: () => "schema",
      onSuccess: (r) => r.body,
    });

  const compiled = machines.get(owner.machine);

  if (compiled === undefined) return Result.fail("machine");

  return Result.flatMap(
    Result.mapError(positionFromOlder(compiled, owner, read.format, read.json), () => "step"),
    (body) => Result.mapError(strictly(PositionRecord.fields.body)(body), () => "schema"),
  );
};

type WorkSide = Option.Option<{ readonly body: Work; readonly stepped: boolean }>;

// A group's legacy records stepped into one work body, decoded by its Shape; none when they hold
// nothing.
const steppedBody = (raw: Raw) =>
  Result.flatMap(
    Result.mapError(
      workFromFive(
        raw.owner,
        raw.lanes.map((l) => ({ operation: l.operation, keyText: l.keyText, json: l.json })),
        Option.map(Option.fromUndefinedOr(raw.owed[0]), (o) => o.json),
      ),
      () => "step",
    ),
    (body) =>
      Option.match(body, {
        onNone: () => Result.succeed<WorkSide>(Option.none()),
        onSome: (b) =>
          Result.mapBoth(strictly(WorkRecord.fields.body)(b), {
            onFailure: () => "schema",
            onSuccess: (decoded) =>
              Option.some({ body: decoded, stepped: true }) satisfies WorkSide,
          }),
      }),
  );

// A group's work side in the current format: its work record's body, or its legacy records stepped
// into one; none when they hold nothing.
const workBody = (raw: Raw) =>
  Option.match(Option.fromUndefinedOr(raw.work[0]), {
    onSome: (read) =>
      Result.mapBoth(strictly(WorkRecord)(read.json), {
        onFailure: () => "schema",
        onSuccess: (r) => Option.some({ body: r.body, stepped: false }) satisfies WorkSide,
      }),
    onNone: () =>
      raw.lanes.length === 0 && raw.owed.length === 0
        ? Result.succeed<WorkSide>(Option.none())
        : steppedBody(raw),
  });

const keysOf = (raw: Raw) => [
  ...[...raw.position, ...raw.work, ...raw.lanes, ...raw.owed].map((r) => r.key),
  ...raw.failed.map((f) => f.key),
  ...raw.newer,
];

// Rows 2, 3, 6 and 7 on a group's position side; a failure resets the position alone.
const positionSide = (
  machines: ReadonlyMap<string, Compiled>,
  stored: ReadonlyMap<string, string>,
  raw: Raw,
) => {
  const failed = raw.failed.find((f) => f.side === "position");

  if (failed !== undefined)
    return {
      position: Option.none(),
      kept: [[failed.key, Quarantine.Reset({ why: "Structure", detail: failed.detail })] as const],
    };

  return Option.match(Option.fromUndefinedOr(raw.position[0]), {
    onNone: () => ({ position: Option.none(), kept: [] }),
    onSome: (read) =>
      Result.match(positionBody(machines, raw.owner, read), {
        onFailure: (detail) => ({
          position: Option.none(),
          kept: [[read.key, Quarantine.Reset({ why: "Structure", detail })] as const],
        }),
        onSuccess: (body) => ({
          position: Option.some({
            key: read.key,
            body,
            text:
              read.format < FORMAT
                ? Option.none<string>()
                : Option.fromUndefinedOr(stored.get(read.key)),
          }),
          kept: [],
        }),
      }),
  });
};

// Rows 2, 3 and 5 to 8 on a group's work side; a failure keeps every work-side key.
const workSide = (raw: Raw) => {
  const legacy = [...raw.lanes, ...raw.owed].map((l) => l.key);
  const failed = raw.failed.filter((f) => f.side === "work");
  const both = raw.work.length > 0 && legacy.length > 0;

  const work =
    failed.length > 0 || both
      ? Result.fail(failed[0]?.detail ?? "work and legacy keys")
      : workBody(raw);

  return Result.match(work, {
    onFailure: (detail) => ({
      work: Option.none<{ readonly body: Work; readonly stepped: boolean }>(),
      legacy: [],
      emptied: false,
      kept: [...raw.work.map((w) => w.key), ...legacy, ...failed.map((f) => f.key)].map(
        (key) => [key, Quarantine.Kept({ why: "Structure", detail })] as const,
      ),
    }),
    onSuccess: (side) => ({
      work: side,
      legacy,
      emptied: Option.isNone(side) && legacy.length > 0,
      kept: [],
    }),
  });
};

/**
 * Stage 1 of the boot's admission: every stored key read by the key grammar, its text as canonical
 * JSON and its format, then each group's sides stepped to the current format and decoded by their
 * kind's strict Shape. Returns each group and every key it settled: kept or reset. The machine is
 * read only by the steps of positions saved before format 6.
 */
export const structure = (
  machines: ReadonlyMap<string, Compiled>,
  stored: ReadonlyMap<string, string>,
) => {
  const quarantined = new Map<string, Quarantine>();
  const raws = new Map<string, Raw>();

  for (const [text, value] of [...stored].toSorted(([a], [b]) => byCodeUnits(a, b))) {
    const read = readKey(text, value);

    if (KeyRead.$is("Foreign")(read))
      quarantined.set(text, Quarantine.Kept({ why: "Foreign", detail: "key" }));
    else
      raws.set(
        ownerText(read.owner),
        withKey(raws.get(ownerText(read.owner)) ?? emptyRaw(read.owner), read),
      );
  }

  const groups: Array<Group> = [];

  for (const raw of raws.values()) {
    const keys = keysOf(raw);

    if (raw.newer.length > 0) {
      for (const key of keys)
        quarantined.set(key, Quarantine.Kept({ why: "Newer", detail: "format" }));
      continue;
    }

    const position = positionSide(machines, stored, raw);
    const work = workSide(raw);

    for (const [key, q] of [...position.kept, ...work.kept]) quarantined.set(key, q);

    groups.push({
      owner: raw.owner,
      keys,
      position: position.position,
      work: Option.map(work.work, (w) => ({
        key: keyText(RecordKey.Work({ owner: raw.owner })),
        ...w,
      })),
      legacy: work.legacy,
      emptied: work.emptied,
    });
  }

  return { groups, quarantined };
};
