import { Option, Predicate, Result, Schema } from "effect";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import type { Rule } from "./rules.ts";

// Format 6's timer failure, as `Schedules` saves it.
const Failed = Schema.Struct({ code: Schema.String, slot: Schema.String });

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

// A row holds its key and rest, but a decline whose input had no encoded form, which holds
// neither.
const Row = Schema.Union([
  Schema.Struct({
    subject: Schema.String,
    contract: Schema.String,
    keyText: Schema.String,
    attempt: Schema.optionalKey(AttemptText),
    rest: Schema.Json,
    ending: Schema.Json,
    kept: Schema.Boolean,
  }),
  Schema.Struct({
    subject: Schema.String,
    contract: Schema.String,
    ending: Schema.Struct({
      channel: Schema.Literal("notSent"),
      reason: Schema.Literal("Unencodable"),
      value: Schema.optionalKey(Schema.Json),
    }),
    kept: Schema.Boolean,
  }),
]);

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
  ...work.rows.flatMap((r) =>
    "attempt" in r ? Option.toArray(Option.fromUndefinedOr(r.attempt)) : [],
  ),
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

// A text's judgement, kept by key and text: a store holds the same text at many cuts.
const writtenByText = (() => {
  const known = new Map<string, boolean>();

  return (key: string, text: string) => {
    const at = `${key}\n${text}`;
    const was = known.get(at);

    if (was !== undefined) return was;

    const judged = writtenForm(key, text);
    known.set(at, judged);

    return judged;
  };
})();

// The identity part of a key: after its kind, and for a format 5 lane key before its first `|`.
const ownerOf = (key: string) => {
  const rest = key.slice(key.indexOf("/") + 1);

  return key.startsWith("lane/") ? rest.slice(0, rest.indexOf("|")) : rest;
};

// A record of an identity whose records the Story put itself carries what it put byte for byte
// (Records, Carried), so only the records of other identities are judged.
const breachesAt = (cut: Cut, at: string, put: ReadonlySet<string>) => {
  const owners = new Set([...put].map((entry) => ownerOf(entry.slice(0, entry.indexOf("\n")))));

  return [...cut.records.stored].flatMap(([key, text]) =>
    owners.has(ownerOf(key)) || writtenByText(key, text)
      ? []
      : [`Records I2, R11: at ${at}, ${key} is not in the form format 6's writer emits`],
  );
};

/**
 * WriteAhead I21, with Codec R4: only a position that cannot encode withholds its identity, so a
 * work record is always written. An UnencodableValue naming a work record is a breach when it
 * withholds (its reason starts `withheld:`), since a value that cannot be saved is saved as unknown
 * Restored and only reported; that identity's sends would wait for ever.
 */
export const onlyActorsWithheld: Rule = {
  rule: "WriteAhead I21",
  breaches: (run: StoryRun) =>
    run.evidence.flatMap((e) =>
      e._tag === "Reported" &&
      e.code === "UnencodableValue" &&
      Option.exists(e.record, (key) => key.startsWith("work/") && e.reason.startsWith("withheld:"))
        ? [
            `WriteAhead I21: ${Option.getOrElse(e.record, () => "")} withheld its identity: ${e.reason}`,
          ]
        : [],
    ),
};

/**
 * Records I2 and R11, at every cut: every key the Runtime wrote is an actor or work record in the
 * form format 6's writer emits (`writtenForm`). The records of an identity the Story put records
 * for itself are not judged.
 */
export const recordKinds: Rule = {
  rule: "Records I2",
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
