import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Fake, Story, StoryFailed } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";

// A persisted note whose computed start reads another computed field: its fresh start is always
// refused, so a quarantined record of it has no memory of its definition's type.
const Note = definition({
  id: "Read/Note",
  persist: true,
  states: ["READY"],
  events: {},
  memory: {
    body: Flow.initial(Schema.String, "hello"),
    length: Flow.initial(Schema.Number, (fields) => String(fields["body"]).length),
    double: Flow.initial(Schema.Number, (fields) => Number(fields["length"]) * 2),
  },
});

const NoteMachine = machine(Note, ({ S }) => ({ default: S.READY }));

const note = actorRef(NoteMachine, "note");

const notes = runtimeSetup({
  app: app({ id: "read-notes", machines: { note: NoteMachine } }),
  scope: "notes",
  persistence: { captureMs: 0 },
});

describe("a typed read (Stories, read(target))", () => {
  it("Stories read(target): a quarantined record whose fresh start is refused has no typed memory, so reading it fails the test instead of returning {}", async () => {
    const run = await Story.app(notes, { id: "read/refused-start", fixtures: [] })
      .world(Fake.storage.put("actor/Read/Note/note", '{"format":1}'))
      .reload()
      .checkpoint("booted")
      .run();

    expect(() => run.checkpoints.booted.read(note)).toThrow(StoryFailed);
  });
});
