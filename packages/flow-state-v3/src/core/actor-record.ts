import { Option, Predicate, Result, Schema, Struct } from "effect";
import type { Compiled, Values } from "./compiled.ts";
import { InternalsId } from "./compiled.ts";
import {
  ActorJson,
  actorOf,
  decodeBy,
  FORMAT,
  Format,
  FormatJson,
  readFailed,
  textOf,
} from "./record-format.ts";
import { readSelected, sameForm, type Selected, selectedOf } from "./slots.ts";
import { SavedTimerFive, timerFromFive } from "./actor-record-five.ts";
import { type ReadFailure, SavedSchedules, type SavedTimer } from "./vocabulary.ts";
import type { ActorId, ActorRecord, Wiring } from "./world.ts";

const WiredJson = Schema.Record(Schema.String, ActorJson);

const RecordHead = {
  machine: Schema.String,
  name: Schema.String,
  state: Schema.String,
  // FLOW_STATE_ALLOW_UNKNOWN: read by the machine's memory walker; the host's parser made it JSON.
  memory: Schema.Unknown,
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
// event, which name one reaction: a reaction added, removed or moved keeps its own,
// and one with nothing saved takes its slot's last selection.
const BaselinesJson = Schema.Record(Schema.String, Schema.Record(Schema.String, BaselineJson));

const ActorRecordJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(FORMAT),
  schedules: SavedSchedules,
  seen: Schema.Record(Schema.String, Schema.Json),
  baselines: BaselinesJson,
  graph: Schema.Record(Schema.String, WiredJson),
});

// Format 5: the current record with each schedule's timers as one list of names.
const ActorRecordFiveJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(5),
  schedules: Schema.Array(SavedTimerFive),
  seen: Schema.Record(Schema.String, Schema.Json),
  baselines: BaselinesJson,
  graph: Schema.Record(Schema.String, WiredJson),
});

// Format 4: the current record with only each armed schedule's deadline and send event.
const ActorRecordFourJson = Schema.Struct({
  ...RecordHead,
  format: Schema.Literal(4),
  schedules: DeadlinesJson,
  seen: Schema.Record(Schema.String, Schema.Json),
  baselines: BaselinesJson,
  graph: Schema.Record(Schema.String, WiredJson),
});

// Format 3: each reaction's baseline inputs (the slots and memory fields its own select read)
// where they differed from the record's, the memory in copies the baselines shared.
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

// A form no release wrote.
const notAForm = Result.fail<ReadFailure>("seen");

// The value a format-1 last-seen form held: JSON as it is, and undefined, Options, arrays and
// plain objects tagged; fails on any other form.
// RETURN_TYPE: recursive: an Option, array or object form holds forms.
const valueOfOne = (form: OneValue): Result.Result<OneValue, ReadFailure> =>
  Predicate.isObject(form) && !Array.isArray(form) && Predicate.isString(form["~"])
    ? (formsOne.get(form["~"])?.(form) ?? notAForm)
    : notAForm;

// Each format-1 tag's reading, looked up by the tag alone.
const formsOne = new Map<string, (form: FormFields) => Result.Result<OneValue, ReadFailure>>([
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

// A memory's fields as canonical text, each kept by its value, so a step re-encodes only the
// fields it changed.
const memoryText = (compiled: Compiled, memory: Values) =>
  Result.map(
    Result.all(
      compiled[InternalsId].fields
        .filter((f) => Object.hasOwn(memory, f.name))
        .toSorted((a, b) => Number(a.name > b.name) - Number(a.name < b.name))
        .map((f) =>
          Result.mapBoth(f.walk.text(memory[f.name]), {
            onFailure: (why) => why.replace(" at $", ` at $.memory.${f.name}`),
            onSuccess: (text) => [f.name, text] as const,
          }),
        ),
    ),
    (fields) => Object.fromEntries(fields),
  );

// A saved baseline of a reaction: its value, none with no `value`.
const savedOf = (baseline: Option.Option<Selected>) =>
  Option.match(baseline, { onNone: () => ({}), onSome: (b) => ({ value: b.text }) });

// The saved baselines: each that differs from its slot's last selection, by slot and event.
const baselinesJson = (compiled: Compiled, record: ActorRecord) => {
  const bySlot = new Map<string, Record<string, ReturnType<typeof savedOf>>>();

  for (const [at, reaction] of compiled[InternalsId].reactions.entries()) {
    const baseline = record.baselines[at] ?? Option.none();

    if (!sameForm(baseline, Option.fromUndefinedOr(record.seen.get(reaction.slot))))
      bySlot.set(reaction.slot, {
        ...bySlot.get(reaction.slot),
        [reaction.event.event]: savedOf(baseline),
      });
  }

  return Object.fromEntries(bySlot);
};

/**
 * An actor's record as canonical text: its state, its memory encoded by the machine's memory
 * Schema, its schedules' timers, its context bindings, each slot's last selection in its
 * Schema's canonical JSON form, each reaction's baseline where it differs from its slot's, and the
 * bindings of every provider up its graph; or why it cannot encode.
 */
export const encodeActor = (compiled: Compiled, record: ActorRecord) =>
  Result.gen(function* () {
    const memory = yield* memoryText(compiled, record.memory);

    return yield* textOf({
      format: FORMAT,
      machine: record.actor.machine,
      name: record.actor.name,
      state: record.state,
      memory,
      schedules: record.schedules,
      context: wiredJson(record.context),
      seen: Object.fromEntries([...record.seen].map(([slot, s]) => [slot, s.text])),
      baselines: baselinesJson(compiled, record),
      graph: Object.fromEntries([...record.graph].map(([key, w]) => [key, wiredJson(w)])),
    });
  });

// A reaction's saved baseline read back through its slot's Schema: its slot's last selection where
// it saved none of its own.
const baselineOf = (
  compiled: Compiled,
  reaction: { readonly slot: string },
  saved: Option.Option<typeof BaselineJson.Type>,
  seen: ReadonlyMap<string, Selected>,
) => {
  if (Option.isNone(saved)) return Result.succeed(Option.fromUndefinedOr(seen.get(reaction.slot)));

  const json = saved.value.value;

  if (json === undefined) return Result.succeed(Option.none<Selected>());

  return Result.flatMap(
    Result.fromNullishOr(compiled.context.get(reaction.slot), readFailed("baseline")),
    (declared) =>
      Result.map(Result.mapError(readSelected(declared.walk, json), readFailed("baseline")), (s) =>
        Option.some(s),
      ),
  );
};

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

// What a record saved of a reaction's baseline: nothing where it saved none of its own.
const savedFor = (
  saved: typeof BaselinesJson.Type,
  reaction: { readonly slot: string; readonly event: { readonly event: string } },
) => {
  const ofSlot = Object.hasOwn(saved, reaction.slot) ? saved[reaction.slot] : undefined;

  return Option.fromUndefinedOr(
    ofSlot !== undefined && Object.hasOwn(ofSlot, reaction.event.event)
      ? ofSlot[reaction.event.event]
      : undefined,
  );
};

/**
 * An actor record read back with the machine it names: the current format by its Schema, formats 1
 * to 4 through their pure steps; its slots, baselines and memory each through their own Schemas.
 */
export const decodeActor = (machines: ReadonlyMap<string, Compiled>) => {
  const machineOf = (r: { readonly machine: string }) =>
    Result.fromNullishOr(machines.get(r.machine), readFailed("machine"));

  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its key names.
  const actorRecord = (value: unknown) =>
    Result.gen(function* () {
      const { format } = yield* decodeBy(FormatJson, "format")(value);

      const r = yield* stepsTo(format, value);

      const compiled = yield* machineOf(r);

      const memory = yield* Result.mapError(
        compiled[InternalsId].walk.decode(r.memory),
        readFailed("memory"),
      );

      const seen = new Map(
        yield* Result.all(
          Object.entries(r.seen).flatMap(([slot, json]) =>
            Option.toArray(
              Option.map(Option.fromUndefinedOr(compiled.context.get(slot)), (declared) =>
                Result.map(
                  Result.mapError(readSelected(declared.walk, json), readFailed("seen")),
                  (s) => [slot, s] as const,
                ),
              ),
            ),
          ),
        ),
      );

      // A reaction with no saved baseline of its own takes its slot's last selection.
      const baselines = yield* Result.all(
        compiled[InternalsId].reactions.map((reaction) =>
          baselineOf(compiled, reaction, savedFor(r.baselines, reaction), seen),
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
        baselines,
        graph,
      } satisfies ActorRecord;
    });

  // A record of any format this release reads, in the current format.
  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its format names.
  const stepsTo = (format: typeof Format.Type, value: unknown) => {
    if (format === FORMAT) return decodeBy(ActorRecordJson, "schema")(value);

    return Result.flatMap(stepsToFive(format, value), stepFive);
  };

  // A record of format 1 to 5, in format 5.
  // FLOW_STATE_ALLOW_UNKNOWN: one stored value, decoded by the Schema its format names.
  const stepsToFive = (format: Exclude<typeof Format.Type, typeof FORMAT>, value: unknown) => {
    if (format === 5) return decodeBy(ActorRecordFiveJson, "schema")(value);

    if (format === 4)
      return Result.flatMap(decodeBy(ActorRecordFourJson, "schema")(value), stepFour);

    if (format === 3)
      return Result.flatMap(
        Result.flatMap(decodeBy(ActorRecordThreeJson, "schema")(value), stepThree),
        stepFour,
      );

    if (format === 2)
      return Result.flatMap(
        Result.flatMap(
          Result.map(decodeBy(ActorRecordTwoJson, "schema")(value), stepTwo),
          stepThree,
        ),
        stepFour,
      );

    return Result.flatMap(stepOne(value), stepFour);
  };

  // A format-5 actor record in the current format: each saved timer filed under the state on the
  // record's chain that declares its schedule (a name no state on the chain declares is dropped,
  // as the decoder drops it), keyed ones as a list; `dueAt` is a due run, `left` a held one,
  // neither an idle timer; `pausedBy` is its reasons; no baseline was saved.
  const stepFive = (five: typeof ActorRecordFiveJson.Type) =>
    Result.map(machineOf(five), (compiled) => {
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

      const stepped: typeof ActorRecordJson.Type = { ...five, format: FORMAT, schedules };

      return stepped;
    });

  // A format-4 actor record in format 5: each deadline is a timer armed at it with no
  // firing yet; its send, which the definition declares, is dropped. A schedule its state's entry
  // arms that has no deadline had ended or was disarmed, so it is saved idle, and a restore does
  // not start it again.
  const stepFour = (four: typeof ActorRecordFourJson.Type) =>
    Result.map(machineOf(four), (compiled) => {
      const saved = new Set(four.schedules.map((d) => d.name));

      const idle = (compiled.states.get(four.state)?.chain ?? []).flatMap((path) =>
        (compiled.states.get(path)?.schedules ?? [])
          .filter((s) => s.onEntry && Option.isNone(s.keys) && !saved.has(s.name))
          .map((s) => ({ name: s.name })),
      );

      const stepped: typeof ActorRecordFiveJson.Type = {
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

      return stepped;
    });

  // A format-3 actor record in format 4: each reaction's baseline is its frame's value
  // of the reaction's slot, else its slot's last selection; a reaction with no frame has none.
  // Frames that do not match the machine's reactions in number are their slots' last selections.
  const stepThree = (three: typeof ActorRecordThreeJson.Type) =>
    Result.map(machineOf(three), (compiled) => {
      const stepped: typeof ActorRecordFourJson.Type = {
        ...Struct.omit(three, ["memories", "reactions"]),
        format: 4,
        baselines:
          three.reactions.length === compiled[InternalsId].reactions.length
            ? framesBySlot(compiled, three.reactions)
            : {},
      };

      return stepped;
    });

  // A format-2 actor record in format 3: each baseline keeps the slots it saved; the memory copy it
  // carried, which no baseline reads any more, is dropped.
  // RETURN_TYPE: format 3's record, read again by its Schema's type.
  const stepTwo = (two: typeof ActorRecordTwoJson.Type): typeof ActorRecordThreeJson.Type => ({
    ...two,
    format: 3,
    reactions: two.reactions.map((frame) =>
      frame === null ? null : { slots: frame.slots, memory: null },
    ),
    memories: [],
  });

  // A format-1 actor record, read by format 4's Schema: each saved slot's value passes
  // through its slot's Schema and stays its last selection where the Schema takes it; a slot saved
  // unknown, or one its Schema refuses, was never selected; each reaction's baseline is its slot's
  // last selection, as format 1 read it.
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
                Option.map(
                  Result.getSuccess(selectedOf(declared.walk, value)),
                  (s) => [slot, s.json] as const,
                ),
              ),
            ),
          ),
        ),
      );

      const stepped: typeof ActorRecordFourJson.Type = {
        ...Struct.omit(one, ["unknown"]),
        format: 4,
        seen: Object.fromEntries(seen.flat()),
        baselines: {},
        graph: {},
      };

      return stepped;
    });

  return actorRecord;
};
