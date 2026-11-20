import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { secondSerialize, serializeClient } from "../../fixtures/lanes/app.ts";
import { Cancel, Latest, Serialize } from "../../fixtures/lanes/machines/clients.ts";
import { usual } from "../../fixtures/lanes/stories/usual.ts";
import { evidenceOf, Fake, Story, turnsOf } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { played } from "../rules/played.ts";

// A persisted note with a constant start.
const Note = definition({
  id: "Read/Note",
  persist: true,
  states: ["READY"],
  events: {},
  memory: { body: Flow.initial(Schema.String, "hello") },
});

const NoteMachine = machine(Note, ({ S }) => ({ default: S.READY }));

const note = actorRef(NoteMachine, "note");

const notes = runtimeSetup({
  app: app({ id: "read-notes", machines: { note: NoteMachine } }),
  scope: "notes",
  persistence: { captureMs: 0 },
});

describe("a typed read (Stories, read(target))", () => {
  it("Stories read(target), Actors R25: a quarantined record reads as the fresh start an ensure would make, quarantined, never {}", async () => {
    const run = await Story.app(notes, { id: "read/quarantined", fixtures: [] })
      .world(Fake.storage.put("actor/Read/Note/note", '{"format":1}'))
      .reload()
      .checkpoint("booted")
      .run();

    expect(run.checkpoints.booted.read(note)).toEqual(
      expect.objectContaining({
        state: "READY",
        memory: { body: "hello" },
        lifecycle: "quarantined",
      }),
    );
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
