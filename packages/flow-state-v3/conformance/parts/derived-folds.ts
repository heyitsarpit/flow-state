import { Equal, Option, Predicate, Result, Schema } from "effect";
import { LOST, type Part } from "../../fixtures/part.ts";
import type { Folded, Folds, Labels } from "../fixtures/folds.ts";
import { Answer } from "../world/network.ts";
import {
  alternativesOf,
  type CompiledAlternative,
  type CompiledOf,
  type CompiledOperation,
  type CompiledWrite,
  isLaneGuard,
  type Values,
  writesOf,
} from "./compiled.ts";

/**
 * A part's `classify` for one operation.
 */
export type Classify = Part["server"][string]["classify"];

type Mapping = CompiledWrite["success"];

const isJson = Schema.is(Schema.Json);

const noLabels: Labels = {};

const isJsonObject = Schema.is(Schema.Record(Schema.String, Schema.Json));

const sameKey = Schema.toEquivalence(Schema.Record(Schema.String, Schema.Json));

/**
 * A folded field an update set from a value the suite does not know: any closure that reads it
 * computes nothing, as for a missing label.
 */
const UNKNOWN: Schema.Json = { unknownToTheSuite: true };

const isUnknown = (value: Schema.Json) =>
  isJsonObject(value) && value["unknownToTheSuite"] === true;

/**
 * The values a closure gets in place of an unknown one, run once each: a result that differs
 * between them depends on the unknown value.
 */
const PROBES: ReadonlyArray<Schema.Json> = [null, 0, "a value the suite does not know"];

/**
 * What a value read through {@link reading} read that it did not hold, or holds as unknown; each
 * such read gets `probe`, or nothing.
 */
const reading = (
  values: Values,
  unknown: ReadonlySet<string>,
  probe: Option.Option<Schema.Json>,
) => {
  const missing: Array<string> = [];

  const view = new Proxy(values, {
    get: (target, key) => {
      if (!Predicate.isString(key)) return undefined;

      if (Object.hasOwn(target, key) && !unknown.has(key)) return target[key];

      missing.push(key);

      return Option.getOrUndefined(probe);
    },
  });

  return { view, missing };
};

/**
 * The memory a closure reads: the folded fields decoded, each unknown field held at its initial
 * value only so the whole decodes, and named in `unknown` so a read of it counts as missing.
 */
const decodedOf = (compiled: CompiledOf, fields: Folded) => {
  const unknown = new Set(Object.entries(fields).flatMap(([k, v]) => (isUnknown(v) ? [k] : [])));

  const initial = Option.getOrElse(
    Option.filter(
      Schema.encodeUnknownOption(compiled.memoryJson)(compiled.initialMemory),
      isJsonObject,
    ),
    () => ({}),
  );

  const known = Object.fromEntries(Object.entries(fields).filter(([k]) => !unknown.has(k)));

  return Option.map(
    Schema.decodeUnknownOption(compiled.memoryJson)({ ...initial, ...known }),
    (decoded) => ({ decoded, unknown }),
  );
};

type Run<A> = (input: { readonly memory: Values; readonly event: Values }) => A;

const runWith = <A>(
  decoded: Values,
  unknown: ReadonlySet<string>,
  labels: Labels,
  probe: Option.Option<Schema.Json>,
  run: Run<A>,
) => {
  const memory = reading(decoded, unknown, probe);
  const event = reading(labels, new Set(), probe);

  const result = Result.try({
    try: () => run({ memory: memory.view, event: event.view }),
    catch: () => "threw",
  });

  return { result, missing: memory.missing.length + event.missing.length > 0 };
};

/**
 * Runs a part's closure over labels and folded fields: its result when it read only values the
 * suite knows, `None` when it read a missing or unknown one or threw.
 */
const computed = <A>(compiled: CompiledOf, labels: Labels, fields: Folded, run: Run<A>) =>
  Option.flatMap(decodedOf(compiled, fields), ({ decoded, unknown }) => {
    const { result, missing } = runWith(decoded, unknown, labels, Option.none(), run);

    return Result.isSuccess(result) && !missing ? Option.some(result.success) : Option.none();
  });

/**
 * Runs a part's closure once, or once per probe when it reads a value the suite does not know:
 * its results with the decoded memory, `None` when it threw or the fields do not decode.
 */
const probed = <A>(compiled: CompiledOf, labels: Labels, fields: Folded, run: Run<A>) =>
  Option.flatMap(decodedOf(compiled, fields), ({ decoded, unknown }) => {
    const [head, ...rest] = PROBES;
    const first = runWith(decoded, unknown, labels, Option.fromUndefinedOr(head), run);

    const runs = first.missing
      ? [first, ...rest.map((p) => runWith(decoded, unknown, labels, Option.some(p), run))]
      : [first];

    const results = runs.flatMap(({ result }) =>
      Result.isSuccess(result) ? [result.success] : [],
    );

    return results.length === runs.length ? Option.some({ decoded, results }) : Option.none();
  });

// RETURN_TYPE: Labels, which `Object.fromEntries` would widen to any values.
const jsonEntries = (values: Values): Labels =>
  Object.fromEntries(Object.entries(values).flatMap(([k, v]) => (isJson(v) ? [[k, v]] : [])));

// FLOW_STATE_ALLOW_UNKNOWN: an ending's value is the call's own, which the mapper is written for.
const mapped = (mapping: Option.Option<Mapping>, value: unknown) =>
  Option.match(
    Option.flatMap(mapping, (m) => m.from),
    {
      onNone: () => noLabels,
      onSome: (from) =>
        Result.match(Result.try({ try: () => from.run(value), catch: () => "threw" }), {
          onSuccess: jsonEntries,
          onFailure: () => noLabels,
        }),
    },
  );

/**
 * The labels of an answer the suite's server gave `operation`: the payload its commit's ending
 * maps to, as the part's `classify` sends it.
 *
 * **Gotchas**
 *
 * - A failure `classify` turns into a success only when an earlier send may have applied has no
 *   labels: which channel it takes is the Attempt's, not the answer's.
 */
const answerLabelsOf = (operation: CompiledOperation, classify: Option.Option<Classify>) => {
  const unknown = operation._tag === "Write" ? Option.some(operation.unknown) : Option.none();

  const failed = (tag: string, fields: Schema.JsonObject) => {
    if (LOST.has(tag)) return mapped(unknown, { _tag: tag });

    const succeeds = Option.map(classify, (c) => [c(tag, fields, false), c(tag, fields, true)]);
    const [never, always] = Option.getOrElse(succeeds, () => [false, false]);

    if (never !== always) return {};

    return always
      ? mapped(Option.some(operation.success), fields)
      : mapped(
          Option.fromUndefinedOr(operation.failure.get(tag)),
          Object.fromEntries([["_tag", tag], ...Object.entries(fields)]),
        );
  };

  return (answer: Answer) =>
    Answer.$match(answer, {
      Ok: ({ value }) => mapped(Option.some(operation.success), value),
      Fail: ({ tag, fields }) => failed(tag, fields),
      FailButLanded: ({ tag, fields }) => failed(tag, fields),
      Lost: () => mapped(unknown, { _tag: "NoResponse" }),
      LostButLanded: () => mapped(unknown, { _tag: "NoResponse" }),
      Never: () => noLabels,
      Die: () => noLabels,
    });
};

const guardFoldOf = (compiled: CompiledOf, alternative: CompiledAlternative) => {
  const checks = alternative.guards.flatMap((g) => (g._tag === "Check" ? [g.check] : []));
  const lane = alternative.guards.some(isLaneGuard);

  return (labels: Labels, fields: Folded) =>
    Option.flatMap(
      computed(compiled, labels, fields, ({ memory, event }) =>
        checks.every((check) => check.run({ state: "", memory, event }) === true),
      ),
      (passes) => (passes && lane ? Option.none() : Option.some(passes)),
    );
};

/**
 * An alternative's update as a fold: the fields its patch sets, each encoded; a field whose value
 * differs between the probes of an unknown input is set {@link UNKNOWN}, and a field that does
 * not encode is too.
 */
const updateFoldOf =
  (compiled: CompiledOf, update: NonNullable<Option.Option.Value<CompiledAlternative["update"]>>) =>
  (labels: Labels, fields: Folded) =>
    Option.getOrElse(
      Option.map(
        probed(compiled, labels, fields, ({ memory, event }) =>
          update.run({ memory, event, now: 0 }),
        ),
        ({ decoded, results }) => {
          const [patch = {}, ...others] = results;

          const agreed = Object.keys(patch).filter((k) =>
            others.every((o) => Equal.equals(o[k], patch[k])),
          );

          const known = Object.fromEntries(agreed.map((k) => [k, patch[k]]));

          const encoded = Option.filter(
            Schema.encodeUnknownOption(compiled.memoryJson)({ ...decoded, ...known }),
            isJsonObject,
          );

          return Object.fromEntries(
            Object.keys(patch).map((k) => {
              const value = Option.flatMap(encoded, (e) =>
                agreed.includes(k) ? Option.fromUndefinedOr(e[k]) : Option.none(),
              );

              return [k, Option.getOrElse(value, () => UNKNOWN)];
            }),
          );
        },
      ),
      () => ({}),
    );

/**
 * A write's key from a member's select: the select of the alternative the suite judged ran when
 * one of its members names the write (a commit's input, a keyed retry's or cancel's key);
 * otherwise every such select's, when all of them compute and agree. Unknown (`null`) in every
 * other case.
 */
const keyFoldOf = (compiled: CompiledOf, write: CompiledWrite) => {
  const selects = alternativesOf(compiled).flatMap(({ alternative }) =>
    alternative.actions.flatMap((a) => {
      if (a.operation !== write.name || a._tag === "Lookup") return [];

      if (a._tag === "Commit") return [{ at: alternative.at, select: a.select }];

      return Option.toArray(Option.map(a.key, (select) => ({ at: alternative.at, select })));
    }),
  );

  return (labels: Labels, fields: Folded, at: Option.Option<string>) => {
    const own = selects.filter((s) => Option.contains(at, s.at));

    const keys = (own.length > 0 ? own : selects).map(({ select }) =>
      computed(compiled, labels, fields, ({ memory, event }) => {
        const input = select.run({ memory, event });

        return Object.fromEntries(
          write.keyFields.map((f) => {
            const v = input[f];

            return [f, isJson(v) ? v : null];
          }),
        );
      }),
    );

    const [first] = keys;

    return first !== undefined &&
      Option.isSome(first) &&
      keys.every((k) => Option.isSome(k) && sameKey(k.value, first.value))
      ? first.value
      : null;
  };
};

/**
 * A machine's folds, computed from its own Slots (F3): every guard, update, key and delay runs the
 * part's closure over the labels of a suite-made value and the folded memory.
 *
 * **Details**
 *
 * - The fields are the whole memory in JSON. A closure that reads a value the suite does not know
 *   (a missing label, or a field an earlier update could not compute) computes nothing: a guard
 *   stays opaque, an update sets that field unknown, a key is unknown.
 * - An alternative with a lane guard (`idle`, `retryable`) is decided only when a check fails: the
 *   lane oracles judge the rest.
 */
// RETURN_TYPE: the Folds contract the suite's prediction reads.
export const foldsOf = (
  compiled: CompiledOf,
  classify: (operation: string) => Option.Option<Classify>,
): Folds => {
  const placed = alternativesOf(compiled).map((p) => p.alternative);
  const initial = Schema.encodeUnknownOption(compiled.memoryJson)(compiled.initialMemory);

  return {
    initial: Option.getOrElse(Option.filter(initial, isJsonObject), () => ({})),
    driven: Object.fromEntries(
      [...compiled.external.keys()].map((event) => [
        event,
        (payload: Schema.Json) => (isJsonObject(payload) ? payload : {}),
      ]),
    ),
    answers: Object.fromEntries(
      [...compiled.operations].map(([name, o]) => [name, answerLabelsOf(o, classify(name))]),
    ),
    updates: Object.fromEntries(
      placed.flatMap((a) =>
        Option.match(a.update, {
          onNone: () => [],
          onSome: (update) => [[a.at, updateFoldOf(compiled, update)]],
        }),
      ),
    ),
    guards: Object.fromEntries(
      placed.flatMap((a) =>
        a.guards.some((g) => g._tag !== "InState") ? [[a.at, guardFoldOf(compiled, a)]] : [],
      ),
    ),
    keys: Object.fromEntries(writesOf(compiled).map((w) => [w.name, keyFoldOf(compiled, w)])),
    delays: Object.fromEntries(
      [...compiled.states.values()].flatMap((node) =>
        node.schedules.flatMap((s) =>
          s.delay._tag === "Computed"
            ? [
                [
                  s.name,
                  (fields: Folded) =>
                    Option.getOrElse(
                      computed(compiled, {}, fields, ({ memory }) =>
                        s.delay._tag === "Computed" ? s.delay.ms.run({ memory }) : 0,
                      ),
                      () => 0,
                    ),
                ],
              ]
            : [],
        ),
      ),
    ),
  };
};
