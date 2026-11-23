import { Option, Predicate, Result, Schema } from "effect";
import { type Cut, type StoryRun, writerDecodes } from "../../src/host/testing/index.ts";
import type { Rule } from "./rules.ts";

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

/**
 * Whether a stored record is in the form format 6's writer emits (Records R11, I2, Stage 1 rows 1
 * to 8): an actor or work key whose text is canonical JSON and decodes, strictly, by the one Shape
 * codec of its kind that the writer encodes with and the boot decodes with. The oracle is that
 * codec, so it cannot accept more than the writer can emit.
 */
export const writtenForm = (key: string, text: string) => {
  const kind = (["actor/", "work/"] as const).find((k) => key.startsWith(k));
  const json = Schema.decodeUnknownOption(JsonText)(text);

  if (kind === undefined || Option.isNone(json) || canonicalText(json.value) !== text) return false;

  return writerDecodes(kind, json.value);
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
