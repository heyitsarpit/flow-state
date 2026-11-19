import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { secondSerialize, serializeClient } from "../../fixtures/lanes/app.ts";
import { Cancel, Latest, Serialize } from "../../fixtures/lanes/machines/clients.ts";
import { usual } from "../../fixtures/lanes/stories/usual.ts";
import { evidenceOf, Fake, Story, StoryFailed, turnsOf } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { played } from "../rules/played.ts";

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

describe("evidence by token (Stories, a run's evidence)", () => {
  it("Stories evidence: a token selects its own definition's records only, though three machines share the event's name", async () => {
    const run = await played(usual);

    // Each client sent Commit under its own machine: three, two and two before the drop, then two more.
    expect(turnsOf(run, Latest.E.Commit)).toHaveLength(3);
    expect(turnsOf(run, Serialize.E.Commit)).toHaveLength(4);
    expect(turnsOf(run, Cancel.E.Commit)).toHaveLength(2);
    expect(turnsOf(run, Serialize.E.Commit, { actor: serializeClient })).toHaveLength(4);
    expect(turnsOf(run, Serialize.E.Commit, { actor: secondSerialize })).toEqual([]);
    expect(new Set(evidenceOf(run, Serialize.E.Cancel).map((e) => e.actor.machine))).toEqual(
      new Set([Serialize.id]),
    );
  });
});
