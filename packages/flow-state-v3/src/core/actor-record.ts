import { Option, Predicate, Result, Schema, Struct } from "effect";
import type { Compiled } from "./compiled.ts";
import { InternalsId } from "./compiled.ts";
import { selectedOf } from "./slots.ts";
import { SavedTimerFive, timerFromFive } from "./actor-record-five.ts";
import type { Owner } from "./record-key.ts";
import { strictly, type SavedTimer } from "./record-shape.ts";

// Formats 1 to 5 of a position, read only to step them to the current format. Each was saved with
// its identity in its content, compared with its key's at the last step.

const Provider = Schema.Struct({ machine: Schema.String, name: Schema.String });

const WiredJson = Schema.Record(Schema.String, Provider);

const RecordHead = {
  machine: Schema.String,
  name: Schema.String,
  state: Schema.String,
  memory: Schema.Record(Schema.String, Schema.Json),
  context: WiredJson,
};

// Formats 1 to 4: each armed schedule's deadline and send event, by name.
const DeadlinesJson = Schema.Array(
  Schema.Struct({ name: Schema.String, dueAt: Schema.Number, send: Schema.String }),
);

// A reaction's baseline where it differs from its slot's last selection: no `value` for a
// reaction with no baseline.
const BaselineJson = Schema.Struct({ value: Schema.optionalKey(Schema.Json) });

// The baselines that differ from their slot's last selection, by slot and then by the reaction's
// event.
const BaselinesJson = Schema.Record(Schema.String, Schema.Record(Schema.String, BaselineJson));

// Format 5: each schedule's timers as one list of names.
const ActorRecordFiveJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(5),
  schedules: Schema.Array(SavedTimerFive),
  seen: Schema.Record(Schema.String, Schema.Json),
  baselines: BaselinesJson,
  graph: Schema.Record(Schema.String, WiredJson),
});

// Format 4: only each armed schedule's deadline and send event.
const ActorRecordFourJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(4),
  schedules: DeadlinesJson,
  seen: Schema.Record(Schema.String, Schema.Json),
  baselines: BaselinesJson,
  graph: Schema.Record(Schema.String, WiredJson),
});

// Format 3: each reaction's baseline inputs where they differed from the record's.
const FrameThreeJson = Schema.NullOr(
  Schema.Struct({
    slots: Schema.Record(Schema.String, Schema.Struct({ value: Schema.optionalKey(Schema.Json) })),
    memory: Schema.NullOr(Schema.Number),
  }),
);

const ActorRecordThreeJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(3),
  schedules: DeadlinesJson,
  seen: Schema.Record(Schema.String, Schema.Json),
  reactions: Schema.Array(FrameThreeJson),
  memories: Schema.Array(Schema.Record(Schema.String, Schema.Json)),
  graph: Schema.Record(Schema.String, WiredJson),
});

// Format 2: each reaction's baseline carried its own copy of the memory fields it read.
const ActorRecordTwoJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(2),
  schedules: DeadlinesJson,
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
  schedules: DeadlinesJson,
  seen: Schema.Record(Schema.String, SeenOne),
  unknown: Schema.optionalKey(Schema.Array(Schema.String)),
});

// FLOW_STATE_ALLOW_UNKNOWN: a format-1 form is JSON read by its tag; its value has its selector's type.
type OneValue = unknown;

type FormFields = { readonly [key: string]: OneValue };

type Five = typeof ActorRecordFiveJson.Type;

type Failed = "step";

// A form no release wrote.
const notAForm = Result.fail<Failed>("step");

// The value a format-1 last-seen form held: JSON as it is, and undefined, Options, arrays and
// plain objects tagged; fails on any other form.
// RETURN_TYPE: recursive: an Option, array or object form holds forms.
const valueOfOne = (form: OneValue): Result.Result<OneValue, Failed> =>
  Predicate.isObject(form) && !Array.isArray(form) && Predicate.isString(form["~"])
    ? (formsOne.get(form["~"])?.(form) ?? notAForm)
    : notAForm;

// Each format-1 tag's reading, looked up by the tag alone.
const formsOne = new Map<string, (form: FormFields) => Result.Result<OneValue, Failed>>([
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

// A format-3 frame's baseline of a reaction's slot: none with no frame, else the frame's value of
// the slot, else nothing saved (the slot's last selection).
const frameBaseline = (frame: typeof FrameThreeJson.Type, slot: string) => {
  if (frame === null) return Option.some({});

  return Option.fromUndefinedOr(Object.hasOwn(frame.slots, slot) ? frame.slots[slot] : undefined);
};

// Format 3's frames, one per reaction in its order, as format 4's baselines by slot and event.
const framesBySlot = (compiled: Compiled, frames: ReadonlyArray<typeof FrameThreeJson.Type>) => {
  const bySlot = new Map<string, Record<string, typeof BaselineJson.Type>>();

  for (const [at, reaction] of compiled[InternalsId].reactions.entries())
    for (const saved of Option.toArray(frameBaseline(frames[at] ?? null, reaction.slot)))
      bySlot.set(reaction.slot, { ...bySlot.get(reaction.slot), [reaction.event.event]: saved });

  return Object.fromEntries(bySlot);
};

// A format-4 record in format 5: each deadline is a timer armed at it with no firing yet; its send,
// which the definition declares, is dropped. A schedule its state's entry arms that has no deadline
// had ended or was disarmed, so it is saved idle.
// RETURN_TYPE: format 5's record, read again by its Schema's type.
const stepFour = (compiled: Compiled, four: typeof ActorRecordFourJson.Type): Five => {
  const saved = new Set(four.schedules.map((d) => d.name));

  const idle = (compiled.states.get(four.state)?.chain ?? []).flatMap((path) =>
    (compiled.states.get(path)?.schedules ?? [])
      .filter((s) => s.onEntry && Option.isNone(s.keys) && !saved.has(s.name))
      .map((s) => ({ name: s.name })),
  );

  return {
    ...four,
    format: 5,
    schedules: [
      ...four.schedules.map((d) => ({
        name: d.name,
        armedAt: d.dueAt,
        attempt: 0,
        dueAt: d.dueAt,
      })),
      ...idle,
    ],
  };
};

// A format-3 record in format 4: each reaction's baseline is its frame's value of the reaction's
// slot, else its slot's last selection; frames that do not match the machine's reactions in number
// are their slots' last selections.
// RETURN_TYPE: format 4's record, read again by its Schema's type.
const stepThree = (
  compiled: Compiled,
  three: typeof ActorRecordThreeJson.Type,
): typeof ActorRecordFourJson.Type => ({
  ...Struct.omit(three, ["memories", "reactions"]),
  format: 4,
  baselines:
    three.reactions.length === compiled[InternalsId].reactions.length
      ? framesBySlot(compiled, three.reactions)
      : {},
});

// A format-2 record in format 3: each baseline keeps the slots it saved; the memory copy it carried
// is dropped.
// RETURN_TYPE: format 3's record, read again by its Schema's type.
const stepTwo = (two: typeof ActorRecordTwoJson.Type): typeof ActorRecordThreeJson.Type => ({
  ...two,
  format: 3,
  reactions: two.reactions.map((frame) =>
    frame === null ? null : { slots: frame.slots, memory: null },
  ),
  memories: [],
});

// A format-1 record in format 4: each saved slot's value passes through its slot's Schema and stays
// its last selection where the Schema takes it; a slot saved unknown, or one its Schema refuses,
// was never selected.
const stepOne = (compiled: Compiled, one: typeof ActorRecordOneJson.Type) =>
  Result.map(
    Result.all(
      Object.entries(one.seen).map(([slot, form]) =>
        Result.map(valueOfOne(form), (value) =>
          Option.toArray(
            Option.flatMap(Option.fromUndefinedOr(compiled.context.get(slot)), (declared) =>
              Option.map(
                Result.getSuccess(selectedOf(declared.walk, value)),
                (s) => [slot, s.json] as const,
              ),
            ),
          ),
        ),
      ),
    ),
    (seen) =>
      ({
        ...Struct.omit(one, ["unknown"]),
        format: 4,
        seen: Object.fromEntries(seen.flat()),
        baselines: {},
        graph: {},
      }) satisfies typeof ActorRecordFourJson.Type,
  );

// A position of format 1 to 5, in format 5.
// FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its format names.
const toFive = (compiled: Compiled, format: number, value: unknown) => {
  const four = (r: typeof ActorRecordFourJson.Type) => stepFour(compiled, r);

  if (format === 5) return strictly(ActorRecordFiveJson)(value);

  if (format === 4) return Result.map(strictly(ActorRecordFourJson)(value), four);

  if (format === 3)
    return Result.map(strictly(ActorRecordThreeJson)(value), (r) => four(stepThree(compiled, r)));

  if (format === 2)
    return Result.map(strictly(ActorRecordTwoJson)(value), (r) =>
      four(stepThree(compiled, stepTwo(r))),
    );

  if (format === 1)
    return Result.flatMap(strictly(ActorRecordOneJson)(value), (r) =>
      Result.map(stepOne(compiled, r), four),
    );

  return Result.fail("schema" as const);
};

// Format 5's timers filed under the state on the record's chain that declares each schedule (a name
// no state on the chain declares is dropped), keyed ones as a list.
const schedulesOf = (compiled: Compiled, five: Five) => {
  const pathOf = new Map(
    (compiled.states.get(five.state)?.chain ?? []).flatMap((path) =>
      (compiled.states.get(path)?.schedules ?? []).map((s) => [s.name, path] as const),
    ),
  );

  const schedules: Record<string, Record<string, SavedTimer | Array<SavedTimer>>> = {};

  for (const timer of five.schedules) {
    const path = pathOf.get(timer.name);

    if (path === undefined) continue;

    const saved = timerFromFive(timer);
    const byName = schedules[path] ?? {};
    const was = byName[timer.name];
    const listed = Array.isArray(was) ? was : [];

    byName[timer.name] = timer.key === undefined ? saved : [...listed, saved];
    schedules[path] = byName;
  }

  return schedules;
};

// A record's own member, never one its prototype holds.
const ownOf = <V>(record: { readonly [key: string]: V }, key: string) =>
  Object.hasOwn(record, key) ? Option.fromUndefinedOr(record[key]) : Option.none<V>();

// A format 5 position as format 6's body: its identity compared with its key's and dropped; its
// slots' bindings, last selections and baselines in one entry per slot; no instances.
const stepFive = (compiled: Compiled, owner: Owner, five: Five) => {
  if (five.machine !== owner.machine || five.name !== owner.name)
    return Result.fail("step" as const);

  const slots = [
    ...new Set([
      ...Object.keys(five.context),
      ...Object.keys(five.seen),
      ...Object.keys(five.baselines),
    ]),
  ].map(
    (slot) =>
      [
        slot,
        {
          ...Option.match(ownOf(five.context, slot), {
            onNone: () => ({}),
            onSome: (provider) => ({ provider }),
          }),
          ...Option.match(ownOf(five.seen, slot), {
            onNone: () => ({}),
            onSome: (value) => ({ seen: { value } }),
          }),
          baselines: five.baselines[slot] ?? {},
        },
      ] as const,
  );

  return Result.succeed({
    state: five.state,
    memory: five.memory,
    schedules: schedulesOf(compiled, five),
    slots: Object.fromEntries(slots),
    graph: five.graph,
    instances: {},
  });
};

/**
 * A position saved in format 1 to 5, stepped to the current format's body with the machine its key
 * names: the earlier steps read the machine as they always did, and the last files each timer under
 * the state that declares its schedule. Fails when the record does not decode by its format's
 * Schema or names another identity than its key.
 */
// FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its format names.
export const positionFromOlder = (
  compiled: Compiled,
  owner: Owner,
  format: number,
  value: unknown,
) =>
  Result.flatMap(
    Result.mapError(toFive(compiled, format, value), () => "step" as const),
    (five) => stepFive(compiled, owner, five),
  );
