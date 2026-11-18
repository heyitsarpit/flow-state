import { Option, Predicate, Result, Schema } from "effect";
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

// An array index sorts first, by value, as every ECMAScript host orders such keys.
const byKey = (a: string, b: string) => {
  const index = (k: string) => (/^(?:0|[1-9]\d*)$/u.test(k) ? Number(k) : -1);
  const [ia, ib] = [index(a), index(b)];

  if (ia >= 0 && ib >= 0) return ia - ib;

  if (ia >= 0) return -1;

  if (ib >= 0) return 1;

  return Number(a > b) - Number(a < b);
};

// A JSON primitive or key as JSON text.
const primitiveText = (json: Schema.Json) =>
  Result.getOrElse(Schema.encodeUnknownResult(JsonText)(json), () => "");

/**
 * The value as canonical text (Codec R2): every object's keys sorted, no whitespace. Written with
 * its own stack, so text of any depth is judged.
 */
export const canonicalText = (root: Schema.Json) => {
  const out: Array<string> = [];
  const stack: Array<() => void> = [];
  const text = (piece: string) => () => void out.push(piece);

  // A container's parts inside its brackets, each after a comma but the first.
  const around = (open: string, parts: ReadonlyArray<ReadonlyArray<() => void>>, close: string) => [
    text(open),
    ...parts.flatMap((p, i) => (i === 0 ? p : [text(","), ...p])),
    text(close),
  ];

  // RETURN_TYPE: a container's steps write its items, so one of them names the step type.
  const stepsOf = (json: Schema.Json): ReadonlyArray<() => void> => {
    if (Array.isArray(json))
      return around(
        "[",
        json.map((item) => [write(item)]),
        "]",
      );

    if (
      json === null ||
      Predicate.isString(json) ||
      Predicate.isNumber(json) ||
      Predicate.isBoolean(json)
    )
      return [text(primitiveText(json))];

    return around(
      "{",
      Object.entries(json)
        .toSorted(([a], [b]) => byKey(a, b))
        .map(([key, value]) => [text(`${primitiveText(key)}:`), write(value)]),
      "}",
    );
  };

  const write = (json: Schema.Json) => () => {
    const steps = stepsOf(json);

    for (let i = steps.length - 1; i >= 0; i -= 1) stack.push(steps[i] ?? text(""));
  };

  stack.push(write(root));

  for (let step = stack.pop(); step !== undefined; step = stack.pop()) step();

  return out.join("");
};

const HasMayHaveApplied = Schema.Struct({ mayHaveApplied: Schema.Json });

const kindOf = (key: string) =>
  (["actor/", "lane/", "owed/"] as const).find((k) => key.startsWith(k));

type Flaw = "not JSON" | "not canonical text" | "does not decode" | "has mayHaveApplied";

const FLAW_TEXT: Record<Flaw, string> = {
  "not JSON": "is not JSON",
  "not canonical text": "is not canonical text",
  "does not decode": "does not decode by its kind's Schema with its format",
  "has mayHaveApplied": "has a mayHaveApplied field",
};

const IS_KIND = {
  "actor/": Schema.is(KINDS["actor/"]),
  "lane/": Schema.is(KINDS["lane/"]),
  "owed/": Schema.is(KINDS["owed/"]),
} as const;

const isMayHaveApplied = Schema.is(HasMayHaveApplied);

// RETURN_TYPE: the flaws a judgement lists, so the not-JSON branch is typed as a Flaw list.
const flawsOf = (kind: keyof typeof KINDS, text: string) =>
  Option.match(Schema.decodeUnknownOption(JsonText)(text), {
    onNone: () => ["not JSON" as const],
    onSome: (json) => {
      const found: Array<Flaw> = [];

      if (canonicalText(json) !== text) found.push("not canonical text");

      if (!IS_KIND[kind](json)) found.push("does not decode");

      if (kind === "lane/" && isMayHaveApplied(json)) found.push("has mayHaveApplied");

      return found;
    },
  });

const flawsByText = (() => {
  const byKey = new Map<string, Map<string, ReadonlyArray<Flaw>>>();

  return (key: string, kind: keyof typeof KINDS, text: string) => {
    const byText = byKey.get(key) ?? new Map<string, ReadonlyArray<Flaw>>();
    byKey.set(key, byText);

    const known = byText.get(text);

    if (known !== undefined) return known;

    const flaws = flawsOf(kind, text);
    byText.set(text, flaws);

    return flaws;
  };
})();

const breachOf = (key: string, text: string, at: string) => {
  const kind = kindOf(key);

  if (kind === undefined)
    return [`Codec I7: at ${at}, ${key} is not an actor, lane or owed record`];

  const flaws = flawsByText(key, kind, text);

  return flaws.map((flaw) => `Codec I7: at ${at}, ${key} ${FLAW_TEXT[flaw]}`);
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

// The Runtime evidence of the step at index `n`, in order.
const evidenceOfStep = (run: StoryRun, n: number) => {
  const from = run.trace.events.findIndex((e) => e.record._tag === "Step" && e.record.index === n);
  const after = from < 0 ? [] : run.trace.events.slice(from + 1);
  const to = after.findIndex((e) => e.record._tag === "Step");

  return (to < 0 ? after : after.slice(0, to)).flatMap((e) =>
    e.record._tag === "Runtime" ? [e.record.evidence] : [],
  );
};

/**
 * WriteAhead I3, at every reload: a local actor never has a record, so no boot incarnates an actor
 * under a local name (one starting `~`) from the store; only `createActor` makes one, and never
 * during a boot.
 */
export const localNeverRestored: Rule = {
  rule: "WriteAhead I3",
  breaches: (run: StoryRun) =>
    run.steps.flatMap((step, n) =>
      step._tag === "reload"
        ? evidenceOfStep(run, n).flatMap((e) =>
            e._tag === "Incarnated" && e.actor.name.startsWith("~")
              ? [
                  `WriteAhead I3: the boot of the reload at step ${n} incarnated ${e.actor.machine}/${e.actor.name}, a local actor, from the store`,
                ]
              : [],
          )
        : [],
    ),
};
