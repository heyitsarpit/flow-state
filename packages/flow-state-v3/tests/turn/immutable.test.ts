import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";

// A Date read from its text, as a Schema reads one.
const dateAt = Schema.decodeUnknownSync(Schema.toCodecJson(Schema.Date));

const Notes = definition({
  id: "Immutable/Notes",
  persist: true,
  states: ["OPEN"],
  events: {
    Add: { note: Schema.String },
    Scribble: { note: Schema.String },
    Tag: { note: Schema.String },
    Mark: { note: Schema.String },
    Shift: {},
  },
  memory: {
    notes: Flow.initial(Schema.Array(Schema.String), []),
    tags: Flow.initial(Schema.ReadonlyMap(Schema.String, Schema.Number), new Map<string, number>()),
    marks: Flow.initial(Schema.ReadonlySet(Schema.String), new Set<string>()),
    due: Flow.initial(Schema.Date, dateAt("1970-01-01T00:00:00.000Z")),
  },
});

// SAFETY: the mutation the contract forbids, to show it throws where it happens.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a machine that breaks the immutability contract
const writable = <A>(value: unknown) => value as A;

// Add writes a new list, as memory updates must; every other event changes what it was given.
const NotesMachine = machine(Notes, ({ S }) => ({
  default: S.OPEN,
  on: {
    Add: { updateMemory: ({ memory, event }) => ({ notes: [...memory.notes, event.note] }) },
    Scribble: {
      updateMemory: ({ memory, event }) => {
        writable<Array<string>>(memory.notes).push(event.note);

        return { notes: memory.notes };
      },
    },
    Tag: {
      updateMemory: ({ memory, event }) => {
        writable<Map<string, number>>(memory.tags).set(event.note, 1);

        return { tags: memory.tags };
      },
    },
    Mark: {
      updateMemory: ({ memory, event }) => {
        writable<Set<string>>(memory.marks).add(event.note);

        return { marks: memory.marks };
      },
    },
    Shift: {
      updateMemory: ({ memory }) => {
        memory.due.setTime(5);

        return { due: memory.due };
      },
    },
  },
}));

const notes = actorRef(NotesMachine, "mine");

const setup = runtimeSetup({
  app: app({ id: "immutable", machines: { notes: NotesMachine } }),
  scope: "immutable",
  persistence: { captureMs: 0 },
});

describe("admitted values are immutable (Turn R24)", () => {
  it("Turn R24: a machine that changes its memory in place, an array, a Map, a Set or a Date, throws where it changes it in test: each turn is refused as its update's defect and memory keeps its last value, saved and restored", async () => {
    const run = await Story.app(setup, { id: "immutable/scribble", fixtures: [] })
      .ensure(notes)
      .send(notes, { _tag: "Add", note: "one" })
      .send(notes, { _tag: "Scribble", note: "two" })
      .send(notes, { _tag: "Tag", note: "two" })
      .send(notes, { _tag: "Mark", note: "two" })
      .send(notes, { _tag: "Shift" })
      .checkpoint("after")
      .reload()
      .checkpoint("reloaded")
      .run();

    for (const cut of ["after", "reloaded"] as const) {
      const memory = run.checkpoints[cut].read(notes)?.memory;

      expect(memory?.notes).toEqual(["one"]);
      expect(memory?.tags).toEqual(new Map());
      expect(memory?.marks).toEqual(new Set());
      expect(memory?.due).toEqual(dateAt("1970-01-01T00:00:00.000Z"));
    }

    expect(run.evidence.flatMap((e) => (e._tag === "Issue" ? [e.code] : []))).toEqual([
      "Defect",
      "Defect",
      "Defect",
      "Defect",
    ]);
  });
});
