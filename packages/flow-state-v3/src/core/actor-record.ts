import { Equal, Option, Predicate, Result, Schema, Struct } from "effect";
import type { Compiled } from "./compiled.ts";
import {
  ActorJson,
  actorOf,
  decodeBy,
  FORMAT,
  FormatJson,
  jsonOf,
  textOf,
} from "./record-format.ts";
import { type Frame, readSelected, sameForm, type Selected, selectedOf } from "./slots.ts";
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
// with no `value` was never selected then.
const FrameJson = Schema.NullOr(
  Schema.Struct({
    slots: Schema.Record(Schema.String, Schema.Struct({ value: Schema.optionalKey(Schema.Json) })),
    memory: Schema.Record(Schema.String, Schema.Json),
  }),
);

const ActorRecordJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(FORMAT),
  seen: Schema.Record(Schema.String, Schema.Json),
  reactions: Schema.Array(FrameJson),
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

// A reaction's baseline inputs as saved: only the slots and memory fields whose JSON form differs
// from the record's own, so each reads back exactly as it was read.
const frameJson = (compiled: Compiled, record: ActorRecord, frame: Frame) =>
  Result.map(
    Result.all(
      [...frame.memory].map(([name, value]) =>
        Result.flatMap(fieldJson(compiled, name, value), (json) =>
          Result.map(fieldJson(compiled, name, record.memory[name]), (own) =>
            Equal.equals(json, own) ? [] : [[name, json] as const],
          ),
        ),
      ),
    ),
    (memory) => ({
      slots: Object.fromEntries(
        [...frame.slots]
          .filter(([slot, s]) => !sameForm(s, Option.fromUndefinedOr(record.seen.get(slot))))
          .map(([slot, s]) => [
            slot,
            Option.match(s, { onNone: () => ({}), onSome: (v) => ({ value: v.json }) }),
          ]),
      ),
      memory: Object.fromEntries(memory.flat()),
    }),
  );

/**
 * An actor's record as canonical text: its state, its memory encoded by the machine's memory
 * Schema, its schedules' deadlines, its context bindings, each slot's last-seen selection in its
 * Schema's JSON form, each reaction's baseline inputs where they differ from those, and the
 * bindings of every provider up its graph; or why it cannot encode.
 */
export const encodeActor = (compiled: Compiled, record: ActorRecord) =>
  Result.gen(function* () {
    const memory = yield* jsonOf(compiled.memoryJson, record.memory);

    const reactions = yield* Result.all(
      record.frames.map((frame) =>
        Option.match(frame, {
          onNone: () => Result.succeed(null),
          onSome: (f) => frameJson(compiled, record, f),
        }),
      ),
    );

    return yield* textOf({
      format: FORMAT,
      machine: record.actor.machine,
      name: record.actor.name,
      state: record.state,
      memory,
      schedules: record.schedules,
      context: wiredJson(record.context),
      seen: Object.fromEntries([...record.seen].map(([slot, s]) => [slot, s.json])),
      reactions,
      graph: Object.fromEntries([...record.graph].map(([key, w]) => [key, wiredJson(w)])),
    });
  });

// A reaction's saved baseline inputs, each read back through its slot's or field's Schema.
const frameOf = (compiled: Compiled, frame: NonNullable<typeof FrameJson.Type>) =>
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

    const memory = yield* Result.all(
      Object.entries(frame.memory).flatMap(([name, json]) =>
        Option.toArray(
          Option.map(Option.fromUndefinedOr(compiled.fields.find((f) => f.name === name)), (f) =>
            Result.map(
              Result.mapError(Schema.decodeUnknownResult(f.json)(json), () => "frame"),
              (value) => [name, value] as const,
            ),
          ),
        ),
      ),
    );

    return { slots: new Map(slots), memory: new Map(memory) } satisfies Frame;
  });

/**
 * An actor record read back with the machine it names: the current format by its Schema, format 1
 * through its pure step; its slots, baseline inputs and memory each through their own Schemas.
 */
export const decodeActor = (machines: ReadonlyMap<string, Compiled>) => {
  const machineOf = (r: { readonly machine: string }) =>
    Result.fromNullishOr(machines.get(r.machine), () => "machine");

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const actorRecord = (value: unknown) =>
    Result.gen(function* () {
      const r = yield* Result.flatMap(decodeBy(FormatJson, "format")(value), ({ format }) =>
        format === FORMAT ? decodeBy(ActorRecordJson, "schema")(value) : stepOne(value),
      );

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

      const frames = yield* Result.all(
        r.reactions.map((frame) =>
          frame === null
            ? Result.succeed(Option.none<Frame>())
            : Result.map(frameOf(compiled, frame), (f) => Option.some(f)),
        ),
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
        reactions: compiled.reactions.map(() => ({ slots: {}, memory: {} })),
        graph: {},
      } satisfies typeof ActorRecordJson.Type;
    });

  return actorRecord;
};
