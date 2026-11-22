import { Option, Predicate, Result, Schema } from "effect";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import type { Rule } from "./rules.ts";

// Formats 1 and 2 are read through their steps, so a store may still hold them until the record is
// written again.
const Actor = {
  format: Schema.Literals([1, 2, 3, 4, 5, 6]),
  machine: Schema.String,
  name: Schema.String,
};

// Each kind's fields as WriteAhead R4 and R5 list them, and the timer shapes R4 gives: running,
// held, or idle; format 4's running timers carried their send instead.
const TimerHead = {
  name: Schema.String,
  key: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
};

const Timer = Schema.Union([
  Schema.Struct({
    ...TimerHead,
    armedAt: Schema.Number,
    attempt: Schema.Number,
    dueAt: Schema.Number,
  }),
  Schema.Struct({
    ...TimerHead,
    armedAt: Schema.Number,
    attempt: Schema.Number,
    left: Schema.Number,
    pausedBy: Schema.Array(Schema.String),
  }),
  Schema.Struct({ name: Schema.String, dueAt: Schema.Number, send: Schema.String }),
  Schema.Struct(TimerHead),
  // An idle timer keeps the pause reasons it last read true (Turn R19).
  Schema.Struct({ ...TimerHead, pausedBy: Schema.NonEmptyArray(Schema.String) }),
]);

// Format 6's timer, as Records R12 spells `TimerShape`: an absent field is a clean outcome; its
// arming is exactly one of idle, refused, due or held (Schedules R14, SavedForm).
const Failed = Schema.Struct({ code: Schema.String, slot: Schema.String });

const TimerSix = Schema.Struct({
  key: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  selection: Schema.optionalKey(Schema.String),
  selectionFailed: Schema.optionalKey(Failed),
  reasons: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)),
  arming: Schema.Union([
    Schema.Struct({ _tag: Schema.Literal("Idle") }),
    Schema.Struct({ _tag: Schema.Literal("Refused"), code: Schema.String, slot: Schema.String }),
    Schema.Struct({
      _tag: Schema.Literal("Due"),
      armedAt: Schema.Number,
      attempt: Schema.Number,
      dueAt: Schema.Number,
    }),
    Schema.Struct({
      _tag: Schema.Literal("Held"),
      armedAt: Schema.Number,
      attempt: Schema.Number,
      left: Schema.Number,
    }),
  ]),
  firing: Schema.optionalKey(Failed),
});

// Format 6's schedules: by state path, then name, a keyed schedule's timers as a list.
const SchedulesSix = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, Schema.Union([TimerSix, Schema.Array(TimerSix)])),
);

const KINDS = {
  "actor/": Schema.Struct({
    ...Actor,
    state: Schema.String,
    memory: Schema.Json,
    schedules: Schema.Union([Schema.Array(Timer), SchedulesSix]),
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

  // RETURN_TYPE: a type guard narrows a JSON value to its list form.
  const isJsonList = (j: Schema.Json): j is ReadonlyArray<Schema.Json> => Array.isArray(j);

  // RETURN_TYPE: a container's steps write its items, so one of them names the step type.
  const stepsOf = (json: Schema.Json): ReadonlyArray<() => void> => {
    if (isJsonList(json))
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

// A timer is exactly one of its shapes: a field of another shape, such as `left` beside `dueAt`,
// makes it none.
const hasExactTimers = (json: Schema.Json) =>
  Predicate.hasProperty(json, "schedules") &&
  Predicate.hasProperty(json, "format") &&
  Option.isSome(
    Schema.decodeUnknownOption(json.format === 6 ? SchedulesSix : Schema.Array(Timer))(
      json.schedules,
      { onExcessProperty: "error" },
    ),
  );

const IS_KIND = {
  "actor/": (json: Schema.Json) => Schema.is(KINDS["actor/"])(json) && hasExactTimers(json),
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

// Format 6 as its writer emits it (Records `Types`): strict structs in normal form, each count a
// non-negative integer, each Attempt id in the mint's form. A record outside this form is one no
// encoder wrote.
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const AttemptText = Schema.String.check(Schema.isPattern(/^att-[0-9a-f]+-\d+$/u));

const WrittenTimer = Schema.Struct({
  key: Schema.optionalKey(Schema.Json),
  selection: Schema.optionalKey(Schema.String),
  selectionFailed: Schema.optionalKey(Failed),
  reasons: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)),
  arming: Schema.Union([
    Schema.Struct({ _tag: Schema.Literal("Idle") }),
    Schema.Struct({ _tag: Schema.Literal("Refused"), code: Schema.String, slot: Schema.String }),
    Schema.Struct({ _tag: Schema.Literal("Due"), armedAt: Count, attempt: Count, dueAt: Count }),
    Schema.Struct({ _tag: Schema.Literal("Held"), armedAt: Count, attempt: Count, left: Count }),
  ]),
  firing: Schema.optionalKey(Failed),
});

const ScheduleMap = Schema.Record(
  Schema.String,
  Schema.Union([WrittenTimer, Schema.Array(WrittenTimer)]),
);

const Provider = Schema.Struct({ machine: Schema.String, name: Schema.String });

const Position = Schema.Struct({
  state: Schema.String,
  memory: Schema.Record(Schema.String, Schema.Json),
  schedules: Schema.Record(Schema.String, ScheduleMap),
  slots: Schema.Record(
    Schema.String,
    Schema.Struct({
      provider: Schema.optionalKey(Provider),
      seen: Schema.optionalKey(Schema.Struct({ value: Schema.Json })),
      baselines: Schema.Record(
        Schema.String,
        Schema.Struct({ value: Schema.optionalKey(Schema.Json) }),
      ),
    }),
  ),
  graph: Schema.Record(Schema.String, Schema.Record(Schema.String, Provider)),
  instances: Schema.Record(
    Schema.String,
    Schema.Struct({
      status: Schema.Literals(["Live", "Frozen"]),
      reset: Schema.optionalKey(Schema.String),
      memory: Schema.Record(Schema.String, Schema.Json),
      schedules: ScheduleMap,
    }),
  ),
  bookmarks: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json)),
  ),
});

const Head = Schema.Struct({
  attempt: AttemptText,
  rest: Schema.Json,
  retryCount: Count,
  hold: Schema.Literals(["Out", "Held"]),
  unknown: Schema.optionalKey(Schema.Struct({ ending: Schema.Json, kept: Schema.Boolean })),
  claims: Schema.Array(
    Schema.Struct({
      entity: Schema.String,
      keyText: Schema.String,
      fields: Schema.Array(Schema.String),
      basedOn: Schema.optionalKey(Schema.Json),
    }),
  ),
});

// A lane holds a head, with a queue behind it, or only displaced Attempts.
const Lane = Schema.Union([
  Schema.Struct({
    head: Head,
    queue: Schema.Array(Schema.Json),
    displaced: Schema.Array(Schema.Struct({ attempt: AttemptText, rest: Schema.Json })),
  }),
  Schema.Struct({
    queue: Schema.Tuple([]),
    displaced: Schema.NonEmptyArray(Schema.Struct({ attempt: AttemptText, rest: Schema.Json })),
  }),
]);

const Row = Schema.Struct({
  subject: Schema.String,
  contract: Schema.String,
  keyText: Schema.String,
  attempt: Schema.optionalKey(AttemptText),
  rest: Schema.Json,
  ending: Schema.Json,
  kept: Schema.Boolean,
});

const NonEmptyMap = <S extends Schema.Top>(value: S) =>
  Schema.Record(Schema.String, value).check(
    Schema.makeFilter((map) => Object.keys(map).length > 0, { expected: "a map with an entry" }),
  );

const Work = Schema.Struct({
  lanes: Schema.Record(Schema.String, NonEmptyMap(NonEmptyMap(Lane))),
  rows: Schema.Array(Row),
});

const envelopeOf = <S extends Schema.Top>(body: S) =>
  Schema.Struct({ body, format: Schema.Literal(6), shape: Schema.optionalKey(Schema.String) });

const WRITTEN = { "actor/": envelopeOf(Position), "work/": envelopeOf(Work) } as const;

// Every Attempt id a work body holds, in heads, displaced lists and rows.
const attemptsOf = (work: typeof Work.Type) => [
  ...Object.values(work.lanes).flatMap((byContract) =>
    Object.values(byContract).flatMap((byKey) =>
      Object.values(byKey).flatMap((lane) =>
        "head" in lane
          ? [lane.head.attempt, ...lane.displaced.map((d) => d.attempt)]
          : lane.displaced.map((d) => d.attempt),
      ),
    ),
  ),
  ...work.rows.flatMap((r) => (r.attempt === undefined ? [] : [r.attempt])),
];

/**
 * Whether a stored record is in the form format 6's writer emits (Records R11, I2, Stage 1 rows 1
 * to 8): an actor or work key whose text is canonical JSON, decodes by its kind's strict Shape with
 * no member left over, and, for a work record, holds a lane or a row and no Attempt id twice.
 */
export const writtenForm = (key: string, text: string) => {
  const kind = (["actor/", "work/"] as const).find((k) => key.startsWith(k));
  const json = Schema.decodeUnknownOption(JsonText)(text);

  if (kind === undefined || Option.isNone(json) || canonicalText(json.value) !== text) return false;

  const decoded = Schema.decodeUnknownOption(WRITTEN[kind])(json.value, {
    onExcessProperty: "error",
  });

  if (Option.isNone(decoded)) return false;

  const body = decoded.value.body;

  if (!Schema.is(Work)(body)) return true;

  const attempts = attemptsOf(body);

  return (
    (Object.keys(body.lanes).length > 0 || body.rows.length > 0) &&
    new Set(attempts).size === attempts.length
  );
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
  breaches: (run: StoryRun<string>) => {
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
