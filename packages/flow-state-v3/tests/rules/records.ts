import { Option, Result, Schema } from "effect";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import type { Rule } from "./rules.ts";

// Formats 1 and 2 are read through their steps, so a store may still hold them until the record is
// written again.
const Actor = { format: Schema.Literals([1, 2, 3]), machine: Schema.String, name: Schema.String };

// Each kind's fields as WriteAhead R4 and R5 list them, and the timer shapes R4 gives.
const Timer = Schema.Union([
  Schema.Struct({
    name: Schema.String,
    key: Schema.optionalKey(Schema.String),
    dueAt: Schema.Number,
  }),
  Schema.Struct({
    name: Schema.String,
    key: Schema.optionalKey(Schema.String),
    left: Schema.Number,
  }),
]);

const KINDS = {
  "actor/": Schema.Struct({
    ...Actor,
    state: Schema.String,
    memory: Schema.Json,
    schedules: Schema.Array(Timer),
  }),
  "lane/": Schema.Struct({
    ...Actor,
    operation: Schema.String,
    attempt: Schema.NullOr(Schema.String),
    retryCount: Schema.Number,
    inFlight: Schema.Boolean,
  }),
  "owed/": Schema.Struct({
    ...Actor,
    rows: Schema.Array(
      Schema.Struct({
        operation: Schema.String,
        attempt: Schema.NullOr(Schema.String),
        lane: Schema.NullOr(Schema.String),
        channel: Schema.Literals(["success", "failure", "notSent", "unknown"]),
        reason: Schema.String,
        value: Schema.Json,
        kept: Schema.Boolean,
      }),
    ),
  }),
} as const;

const JsonText = Schema.fromJsonString(Schema.Json);

const JsonObject = Schema.Record(Schema.String, Schema.Json);

// An array index sorts first, by value, as every ECMAScript host orders such keys.
const byKey = (a: string, b: string) => {
  const index = (k: string) => (/^(?:0|[1-9]\d*)$/u.test(k) ? Number(k) : -1);
  const [ia, ib] = [index(a), index(b)];

  if (ia >= 0 && ib >= 0) return ia - ib;

  if (ia >= 0) return -1;

  if (ib >= 0) return 1;

  return Number(a > b) - Number(a < b);
};

// The value with every object's keys sorted (Codec R2).
// RETURN_TYPE: a recursive function states its result.
const sorted = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) return value.map(sorted);

  if (!Schema.is(JsonObject)(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([a], [b]) => byKey(a, b))
      .map(([k, v]) => [k, sorted(v)]),
  );
};

const HasMayHaveApplied = Schema.Struct({ mayHaveApplied: Schema.Json });

const kindOf = (key: string) =>
  (["actor/", "lane/", "owed/"] as const).find((k) => key.startsWith(k));

const breachOf = (key: string, text: string, at: string) => {
  const kind = kindOf(key);

  if (kind === undefined)
    return [`Codec I7: at ${at}, ${key} is not an actor, lane or owed record`];

  return Option.match(Schema.decodeUnknownOption(JsonText)(text), {
    onNone: () => [`Codec I7: at ${at}, ${key} is not JSON`],
    onSome: (json) => {
      const canonical = Result.getOrUndefined(Schema.encodeUnknownResult(JsonText)(sorted(json)));
      const found: Array<string> = [];

      if (canonical !== text) found.push(`Codec I7: at ${at}, ${key} is not canonical text`);

      if (!Schema.is(KINDS[kind])(json))
        found.push(
          `Codec I7: at ${at}, ${key} does not decode by its kind's Schema with its format`,
        );

      if (kind === "lane/" && Schema.is(HasMayHaveApplied)(json))
        found.push(`Codec I7: at ${at}, ${key} has a mayHaveApplied field`);

      return found;
    },
  });
};

// Records a Story wrote into the store itself, by key and text: the Runtime did not write them.
export const putBy = (run: StoryRun) =>
  new Set(
    run.steps.flatMap((step) =>
      step._tag === "world"
        ? step.words.flatMap((w) => (w._tag === "stored" ? [`${w.key}\n${w.text}`] : []))
        : [],
    ),
  );

const breachesAt = (cut: Cut, at: string, put: ReadonlySet<string>) =>
  [...cut.records.stored].flatMap(([key, text]) =>
    put.has(`${key}\n${text}`) ? [] : breachOf(key, text, at),
  );

/**
 * WriteAhead I21, with Codec R4: only an actor record that cannot encode withholds its identity, so
 * a lane record is always written. Any UnencodableValue naming a lane record is a breach, whatever
 * its reason; one naming an owed record is a breach when it withholds (its reason starts
 * `withheld:`), since a value that cannot be saved is saved as null and only reported. Either way
 * that identity's sends would wait for ever.
 */
export const onlyActorsWithheld: Rule = {
  rule: "WriteAhead I21",
  breaches: (run: StoryRun) =>
    run.evidence.flatMap((e) =>
      e._tag === "Reported" &&
      e.code === "UnencodableValue" &&
      Option.exists(
        e.record,
        (key) =>
          key.startsWith("lane/") || (key.startsWith("owed/") && e.reason.startsWith("withheld:")),
      )
        ? [
            `WriteAhead I21: ${Option.getOrElse(e.record, () => "")} withheld its identity: ${e.reason}`,
          ]
        : [],
    ),
};

/**
 * Codec I7, at every cut: every key the Runtime wrote is `actor/`, `lane/` or `owed/`, its text is
 * canonical (sorted keys, no whitespace) and decodes by its kind's Schema with the current
 * `format`, no lane record has `mayHaveApplied`, and every owed row has a channel. Canonical text
 * that decodes is its own round trip. A record the Story put in the store itself is not judged.
 */
export const recordKinds: Rule = {
  rule: "Codec I7",
  breaches: (run: StoryRun) => {
    const put = putBy(run);

    return [
      ...Object.entries(run.checkpoints).flatMap(([name, cut]) => breachesAt(cut, name, put)),
      ...breachesAt(run.end, "the end", put),
    ];
  },
};
