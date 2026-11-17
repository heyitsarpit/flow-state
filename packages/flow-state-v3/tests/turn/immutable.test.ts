import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";

const Notes = definition({
  id: "Immutable/Notes",
  persist: true,
  states: ["OPEN"],
  events: { Add: { note: Schema.String }, Scribble: { note: Schema.String } },
  memory: { notes: Flow.initial(Schema.Array(Schema.String), []) },
});

// Add writes a new list, as memory updates must; Scribble pushes onto the list it was given.
const NotesMachine = machine(Notes, ({ S }) => ({
  default: S.OPEN,
  on: {
    Add: { updateMemory: ({ memory, event }) => ({ notes: [...memory.notes, event.note] }) },
    Scribble: {
      updateMemory: ({ memory, event }) => {
        // SAFETY: the mutation the contract forbids, to show it throws where it happens.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a machine that breaks the immutability contract
        (memory.notes as Array<string>).push(event.note);

        return { notes: memory.notes };
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

describe("admitted values are immutable (Pending D29)", () => {
  it("Turn R24, Pending D29: a machine that mutates its memory throws where it mutates in test: the turn is refused as its update's defect and memory keeps its last value", async () => {
    const run = await Story.app(setup, { id: "immutable/scribble", fixtures: [] })
      .ensure(notes)
      .send(notes, { _tag: "Add", note: "one" })
      .send(notes, { _tag: "Scribble", note: "two" })
      .checkpoint("after")
      .run();

    expect(run.checkpoints.after.read(notes)?.memory.notes).toEqual(["one"]);
    expect(run.evidence.flatMap((e) => (e._tag === "Issue" ? [e.code] : []))).toEqual(["Defect"]);
  });
});
