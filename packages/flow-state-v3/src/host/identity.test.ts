import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { actorRef, app, definition, Flow, machine } from "../index.ts";
import { bootWith } from "./testing/seam.ts";

const Note = definition({
  id: "Identity/Note",
  persist: true,
  states: ["OPEN"],
  events: { Write: { text: Schema.String } },
  memory: { noteId: Flow.input(Schema.String), body: Flow.initial(Schema.String, "") },
});

const NoteMachine = machine(Note, ({ S }) => ({
  default: S.OPEN,
  on: { Write: { updateMemory: ({ event, memory }) => ({ body: memory.body + event.text }) } },
}));

const notes = app({ id: "notes", machines: { note: NoteMachine } });

const recordKeys = (store: ReadonlyMap<string, string>) =>
  [...store.keys()].filter((k) => k.includes("actor/"));

describe("persisted identities (Actors R6, R9)", () => {
  it("Actors R6: a local actor of a persisted machine is never written to the store", () => {
    const store = new Map<string, string>();
    const { built, tab } = bootWith(notes, store, 1);
    const local = built.runtime.createActor(NoteMachine, { input: { noteId: "n" } });
    local.send({ _tag: "Write", text: "x" });
    tab.settle();

    expect(recordKeys(store)).toEqual([]);

    built.runtime
      .ensureActor(actorRef(NoteMachine, { noteId: "n" }))
      .send({ _tag: "Write", text: "y" });
    tab.settle();

    expect(recordKeys(store)).toHaveLength(1);
  });

  it("Actors R6, R9: a handle follows the identity: after its incarnation ends, it sends to and reads the next one", () => {
    const store = new Map<string, string>();
    const { built, tab, seen } = bootWith(notes, store, 1);
    const note = built.runtime.ensureActor(actorRef(NoteMachine, { noteId: "n" }));
    note.send({ _tag: "Write", text: "a" });
    tab.advance(150);
    tab.settle();

    expect(seen.filter((e) => e._tag === "Finished")).toHaveLength(1);

    note.send({ _tag: "Write", text: "b" });

    expect(Option.map(note.getSnapshot(), (s) => s.memory["body"])).toEqual(Option.some("ab"));
    expect(seen.filter((e) => e._tag === "Incarnated")).toHaveLength(2);
  });
});
