import { Equal, Option, Predicate, Result, Schema, Struct } from "effect";
import { toCanonicalJson } from "./codec.ts";
import type { Compiled, Values } from "./compiled.ts";
import {
  ActorJson,
  actorOf,
  decodeBy,
  FORMAT,
  Format,
  FormatJson,
  jsonOf,
  textOf,
} from "./record-format.ts";
import {
  type Frame,
  readSelected,
  sameForm,
  type Selected,
  selectedOf,
  type Source,
} from "./slots.ts";
import { ScheduleDeadline } from "./vocabulary.ts";
import type { ActorId, ActorRecord, Wiring } from "./world.ts";

const WiredJson = Schema.Record(Schema.String, ActorJson);

const RecordHead = {
  machine: Schema.String,
  name: Schema.String,
  state: Schema.String,
  memory: Schema.Json,
  schedules: Schema.Array(ScheduleDeadline),
  context: WiredJson,
};

// A reaction's baseline inputs that differ from the record's last-seen slots and memory: a slot
// with no `value` was never selected then; `memory` names the shared copy of the memory fields it
// read, when they differ from the record's own.
const FrameJson = Schema.NullOr(
  Schema.Struct({
    slots: Schema.Record(Schema.String, Schema.Struct({ value: Schema.optionalKey(Schema.Json) })),
    memory: Schema.NullOr(Schema.Number),
  }),
);

const ActorRecordJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(FORMAT),
  seen: Schema.Record(Schema.String, Schema.Json),
  unknown: Schema.Array(Schema.String),
  reactions: Schema.Array(FrameJson),
  memories: Schema.Array(Schema.Record(Schema.String, Schema.Json)),
  graph: Schema.Record(Schema.String, WiredJson),
});

// Format 2: each reaction's baseline carried its own copy of the memory fields it read.
const ActorRecordTwoJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(2),
  seen: Schema.Record(Schema.String, Schema.Json),
  reactions: Schema.Array(
    Schema.NullOr(
      Schema.Struct({
        slots: Schema.Record(
          Schema.String,
          Schema.Struct({ value: Schema.optionalKey(Schema.Json) }),
        ),
        memory: Schema.Record(Schema.String, Schema.Json),
      }),
    ),
  ),
  graph: Schema.Record(Schema.String, WiredJson),
});

// Format 1's last-seen forms: JSON as it was selected, and undefined, Options, arrays and plain
// objects tagged.
const SeenOne = Schema.Struct({
  "~": Schema.Literals(["json", "undefined", "none", "some", "array", "object"]),
  value: Schema.optionalKey(Schema.Json),
  items: Schema.optionalKey(Schema.Json),
  fields: Schema.optionalKey(Schema.Json),
});

const ActorRecordOneJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(1),
  seen: Schema.Record(Schema.String, SeenOne),
  unknown: Schema.optionalKey(Schema.Array(Schema.String)),
});

// FLOW_STATE_ALLOW_UNKNOWN: a format-1 form is JSON read by its tag; its value has its selector's type.
type OneValue = unknown;

type FormFields = { readonly [key: string]: OneValue };

// A form no release wrote.
const notAForm = Result.fail("seen");

// The value a format-1 last-seen form held: JSON as it is, and undefined, Options, arrays and
// plain objects tagged; fails on any other form.
// RETURN_TYPE: recursive: an Option, array or object form holds forms.
const valueOfOne = (form: OneValue): Result.Result<OneValue, string> =>
  Predicate.isObject(form) && !Array.isArray(form) && Predicate.isString(form["~"])
    ? (formsOne.get(form["~"])?.(form) ?? notAForm)
    : notAForm;

// Each format-1 tag's reading, looked up by the tag alone.
const formsOne = new Map<string, (form: FormFields) => Result.Result<OneValue, string>>([
  ["json", (f) => (Object.hasOwn(f, "value") ? Result.succeed(f["value"]) : notAForm)],
  ["undefined", () => Result.succeed(undefined)],
  ["none", () => Result.succeed(Option.none())],
  ["some", (f) => Result.map(valueOfOne(f["value"]), (v) => Option.some(v))],
  [
    "array",
    (f) => {
      const items = f["items"];

      return Array.isArray(items) ? Result.all(items.map(valueOfOne)) : notAForm;
    },
  ],
  [
    "object",
    (f) => {
      const fields = f["fields"];

      return Predicate.isObject(fields) && !Array.isArray(fields)
        ? Result.map(
            Result.all(
              Object.entries(fields).map(([k, v]) => Result.map(valueOfOne(v), (x) => [k, x])),
            ),
            Object.fromEntries,
          )
        : notAForm;
    },
  ],
]);

const wiredJson = (wired: ReadonlyMap<string, ActorId>) =>
  Object.fromEntries([...wired].map(([slot, p]) => [slot, { machine: p.machine, name: p.name }]));

// A memory field in its Schema's JSON form.
// FLOW_STATE_ALLOW_UNKNOWN: a memory field has its field Schema's type.
const fieldJson = (compiled: Compiled, name: string, value: unknown) =>
  Result.mapError(
    Schema.encodeUnknownResult(compiled.fields.find((f) => f.name === name)?.json ?? Schema.Never)(
      value,
    ),
    () => "memory",
  );

// A slot's JSON as a record holds it, a -0 written as 0; none past a codec bound.
// FLOW_STATE_ALLOW_UNKNOWN: a selection's JSON form, checked here by the codec.
const savedJson = (json: unknown) => Result.getSuccess(toCanonicalJson(json, "zero"));

// What a record saves of its context, at one of three depths: everything; everything but the
// memory copies its baselines read; or no slot value either. What a depth leaves out is saved
// unknown, so a start from the record hears it again rather than missing it.
type Depth = "whole" | "no copies" | "no values";

// The memory each baseline read, shared by every baseline read from the same memory: only the
// fields whose JSON differs from the record's own are copied.
const copiesOf = (compiled: Compiled, record: ActorRecord) =>
  Result.gen(function* () {
    const copies = new Map<Source, Map<string, Values[string]>>();

    for (const frame of record.frames.flatMap(Option.toArray))
      for (const [name, value] of frame.memory) {
        const json = yield* fieldJson(compiled, name, value);
        const own = yield* fieldJson(compiled, name, record.memory[name]);
        const copy = copies.get(frame.source) ?? new Map<string, Values[string]>();

        if (!Equal.equals(json, own)) copies.set(frame.source, copy.set(name, json));
      }

    return copies;
  });

// One baseline's saved inputs: the slots that differ from the record's, and the shared copy it
// names; none when the record at this depth cannot hold them, so it hears its next wave.
const frameJson = (
  record: ActorRecord,
  frame: Frame,
  depth: Depth,
  copied: ReadonlyArray<Source>,
  shared: ReadonlyArray<Source>,
) => {
  const slots = [...frame.slots]
    .filter(([slot, s]) => !sameForm(s, Option.fromUndefinedOr(record.seen.get(slot))))
    .map(([slot, s]) => ({
      slot,
      json: Option.map(s, (v) => (depth === "no values" ? Option.none() : savedJson(v.json))),
    }));

  const at = shared.indexOf(frame.source);
  const lost = copied.includes(frame.source) && at < 0;

  if (lost || slots.some((x) => Option.exists(x.json, Option.isNone))) return null;

  return {
    slots: Object.fromEntries(
      slots.map(({ slot, json }) => [
        slot,
        Option.match(Option.flatten(json), { onNone: () => ({}), onSome: (value) => ({ value }) }),
      ]),
    ),
    memory: Option.getOrNull(Option.liftPredicate(at, (n) => n >= 0)),
  };
};

const contextJson = (compiled: Compiled, record: ActorRecord, depth: Depth) =>
  Result.map(copiesOf(compiled, record), (copies) => {
    const seen = [...record.seen].map(([slot, s]) => ({
      slot,
      json: depth === "no values" ? Option.none() : savedJson(s.json),
    }));

    const copied = [...copies.keys()];
    const shared = depth === "whole" ? copied : [];

    const reactions = record.frames.map((frame) =>
      Option.match(frame, {
        onNone: () => null,
        onSome: (f) => frameJson(record, f, depth, copied, shared),
      }),
    );

    const unknown = seen.filter((s) => Option.isNone(s.json)).map((s) => s.slot);

    const dropped = reactions.filter(
      (r, at) => r === null && Option.isSome(record.frames[at] ?? Option.none()),
    );

    return {
      context: {
        seen: Object.fromEntries(
          seen.flatMap((s) =>
            Option.toArray(Option.map(s.json, (json) => [s.slot, json] as const)),
          ),
        ),
        unknown,
        reactions,
        memories: shared.map((source) => Object.fromEntries(copies.get(source) ?? [])),
      },
      unsaved: unknown.length + dropped.length,
    };
  });

/**
 * An actor's record as canonical text: its state, its memory encoded by the machine's memory
 * Schema, its schedules' deadlines, its context bindings, each slot's last-seen selection in its
 * Schema's JSON form, each reaction's baseline inputs where they differ from those (the memory it
 * read in one copy shared by every baseline read from the same memory), and the bindings of every
 * provider up its graph; with how many slots and baselines it saved unknown, or why it cannot
 * encode. What a record cannot hold of its context is saved unknown, never in its memory's place.
 */
export const encodeActor = (compiled: Compiled, record: ActorRecord) =>
  Result.flatMap(jsonOf(compiled.memoryJson, record.memory), (memory) => {
    const at = (depth: Depth) =>
      Result.flatMap(contextJson(compiled, record, depth), ({ context, unsaved }) =>
        Result.map(
          textOf({
            format: FORMAT,
            machine: record.actor.machine,
            name: record.actor.name,
            state: record.state,
            memory,
            schedules: record.schedules,
            context: wiredJson(record.context),
            ...context,
            graph: Object.fromEntries([...record.graph].map(([key, w]) => [key, wiredJson(w)])),
          }),
          (text) => ({ text, unsaved }),
        ),
      );

    return Result.orElse(at("whole"), () => Result.orElse(at("no copies"), () => at("no values")));
  });

// A reaction's saved baseline inputs, each read back through its slot's or field's Schema; its
// memory is the shared copy it names.
const frameOf = (
  compiled: Compiled,
  frame: NonNullable<typeof FrameJson.Type>,
  memories: ReadonlyArray<ReadonlyMap<string, Values[string]>>,
  own: Values,
) =>
  Result.gen(function* () {
    const slots = yield* Result.all(
      Object.entries(frame.slots).flatMap(([slot, saved]) =>
        Option.toArray(
          Option.map(Option.fromUndefinedOr(compiled.context.get(slot)), (declared) =>
            saved.value === undefined
              ? Result.succeed([slot, Option.none<Selected>()] as const)
              : Result.map(
                  Result.mapError(readSelected(declared.json, saved.value), () => "frame"),
                  (s) => [slot, Option.some(s)] as const,
                ),
          ),
        ),
      ),
    );

    const memory = yield* frame.memory === null
      ? Result.succeed(new Map<string, Values[string]>())
      : Result.fromNullishOr(memories[frame.memory], () => "frame");

    // Baselines that share a copy share their source, so they share it again when saved.
    return {
      slots: new Map(slots),
      memory,
      source: frame.memory === null ? own : memory,
    } satisfies Frame;
  });

// A shared memory copy, each field read back through its Schema.
const copyOf = (compiled: Compiled, copy: { readonly [name: string]: Schema.Json }) =>
  Result.map(
    Result.all(
      Object.entries(copy).flatMap(([name, json]) =>
        Option.toArray(
          Option.map(Option.fromUndefinedOr(compiled.fields.find((f) => f.name === name)), (f) =>
            Result.map(decodeBy(f.json, "frame")(json), (value) => [name, value] as const),
          ),
        ),
      ),
    ),
    (fields) => new Map(fields),
  );

/**
 * An actor record read back with the machine it names: the current format by its Schema, formats 1
 * and 2 through their pure steps; its slots, baseline inputs and memory each through their own
 * Schemas.
 */
export const decodeActor = (machines: ReadonlyMap<string, Compiled>) => {
  const machineOf = (r: { readonly machine: string }) =>
    Result.fromNullishOr(machines.get(r.machine), () => "machine");

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const actorRecord = (value: unknown) =>
    Result.gen(function* () {
      const { format } = yield* decodeBy(FormatJson, "format")(value);

      const r = yield* stepsTo(format, value);

      const compiled = yield* machineOf(r);
      const memory = yield* decodeBy(compiled.memoryJson, "memory")(r.memory);

      const seen = new Map(
        yield* Result.all(
          Object.entries(r.seen).flatMap(([slot, json]) =>
            Option.toArray(
              Option.map(Option.fromUndefinedOr(compiled.context.get(slot)), (declared) =>
                Result.map(
                  Result.mapError(readSelected(declared.json, json), () => "seen"),
                  (s) => [slot, s] as const,
                ),
              ),
            ),
          ),
        ),
      );

      const memories = yield* Result.all(r.memories.map((copy) => copyOf(compiled, copy)));
      const own = { memory };

      // Baselines that do not match the machine's reactions in number are read from the record's
      // own slots and memory.
      const frames =
        r.reactions.length === compiled.reactions.length
          ? yield* Result.all(
              r.reactions.map((frame) =>
                frame === null
                  ? Result.succeed(Option.none<Frame>())
                  : Result.map(frameOf(compiled, frame, memories, own), (f) =>
                      Option.some<Frame>(f),
                    ),
              ),
            )
          : compiled.reactions.map(() =>
              Option.some<Frame>({ slots: new Map(), memory: new Map(), source: own }),
            );

      const graph: Wiring = new Map(
        Object.entries(r.graph).map(([key, wired]) => [
          key,
          new Map(Object.entries(wired).map(([slot, p]) => [slot, actorOf(p)])),
        ]),
      );

      return {
        actor: actorOf(r),
        state: r.state,
        memory,
        schedules: r.schedules,
        context: new Map(Object.entries(r.context).map(([slot, p]) => [slot, actorOf(p)])),
        seen,
        frames,
        graph,
      } satisfies ActorRecord;
    });

  // A record of any format this release reads, in the current format.
  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its format names.
  const stepsTo = (format: typeof Format.Type, value: unknown) => {
    if (format === FORMAT) return decodeBy(ActorRecordJson, "schema")(value);

    if (format === 2) return Result.map(decodeBy(ActorRecordTwoJson, "schema")(value), stepTwo);

    return stepOne(value);
  };

  // A format-2 actor record in the current format: each baseline's own memory copy becomes a
  // shared copy it names.
  // RETURN_TYPE: the current format's record, read again by its Schema's type.
  const stepTwo = (two: typeof ActorRecordTwoJson.Type): typeof ActorRecordJson.Type => {
    const memories: Array<{ readonly [name: string]: Schema.Json }> = [];

    return {
      ...two,
      format: FORMAT,
      unknown: [],
      reactions: two.reactions.map((frame) => {
        if (frame === null) return null;

        if (Object.keys(frame.memory).length === 0) return { slots: frame.slots, memory: null };

        return { slots: frame.slots, memory: memories.push(frame.memory) - 1 };
      }),
      memories,
    };
  };

  // A format-1 actor record, read by the current format's Schema: each saved slot's value passes
  // through its slot's Schema and stays its last-seen selection where the Schema takes it; a slot
  // saved unknown, or one its Schema refuses, was never selected; each reaction's baseline reads the
  // record's own slots and memory, as format 1 did.
  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by format 1's Schema.
  const stepOne = (value: unknown) =>
    Result.gen(function* () {
      const one = yield* decodeBy(ActorRecordOneJson, "schema")(value);
      const compiled = yield* machineOf(one);

      const seen = yield* Result.all(
        Object.entries(one.seen).map(([slot, form]) =>
          Result.map(valueOfOne(form), (value) =>
            Option.toArray(
              Option.flatMap(Option.fromUndefinedOr(compiled.context.get(slot)), (declared) =>
                Option.map(Result.getSuccess(selectedOf(declared.json, value)), (s) => [
                  slot,
                  s.json,
                ]),
              ),
            ),
          ),
        ),
      );

      return {
        ...Struct.omit(one, ["unknown"]),
        format: FORMAT,
        seen: Object.fromEntries(seen.flat()),
        reactions: compiled.reactions.map(() => ({ slots: {}, memory: null })),
        unknown: [],
        memories: [],
        graph: {},
      } satisfies typeof ActorRecordJson.Type;
    });

  return actorRecord;
};
