import { Effect, Schema, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { LIMITS } from "../limits.ts";
import { GitApi } from "../../fixtures/services/git/services.ts";
import { GitLive } from "../../fixtures/services/git/adapters/git.ts";
import { Git } from "../../fixtures/services/git/server/git.ts";
import { GitFake } from "../../fixtures/services/git/server/layer.ts";
import { Fake, Story, type StoryRun } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  Outcome,
  transaction,
  RuntimeDefaults,
  runtimeSetup,
} from "../../src/index.ts";
import { checked } from "../rules/rules.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";

const sync = transaction({
  id: "Restore/sync",
  input: { repo: Schema.String },
  key: ["repo"],
  concurrency: "serialize",
  services: [GitApi],
  commit: (input, { attempt }) =>
    GitApi.use((api) => api.sync(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

// A publish of a document as deep as its author made it, through the same Git host.
const publish = transaction({
  id: "Restore/publish",
  input: { repo: Schema.String, doc: Schema.Json },
  key: ["repo"],
  concurrency: "serialize",
  services: [GitApi],
  commit: (input, { attempt }) =>
    GitApi.use((api) => api.sync({ repo: input.repo }, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

const Notes = definition({
  id: "Restore/Notes",
  persist: true,
  states: ["READY"],
  events: {
    Grow: { count: Schema.Number },
    Scribble: {},
    Sync: { repo: Schema.String },
    Publish: { doc: Schema.Json },
  },
  internalEvents: {
    Synced: {},
    Limited: {},
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: { notes: Flow.initial(Schema.Array(Schema.String), []) },
  operations: ({ E }) => ({
    sync: sync.outcomes({
      success: E.Synced,
      failure: { RateLimited: E.Limited },
      notSent: E.NotSent.from((e) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
    publish: publish.outcomes({
      success: E.Synced,
      failure: { RateLimited: E.Limited },
      notSent: E.NotSent.from((e) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

// A notebook whose notes grow to any length, that a scribble leaves holding a lone surrogate (a
// string with no canonical form), and that syncs.
const NotesMachine = machine(Notes, ({ S, O }) => ({
  default: S.READY,
  on: {
    Grow: {
      updateMemory: ({ event }) => ({
        notes: Array.from({ length: event.count }, (_, i) => `note ${i}`),
      }),
    },
    Scribble: { updateMemory: () => ({ notes: ["\uD800"] }) },
    Sync: { actions: [O.sync.commit(({ event }) => ({ repo: event.repo }))] },
    Publish: { actions: [O.publish.commit(({ event }) => ({ repo: "flow", doc: event.doc }))] },
    Synced: {},
    Limited: {},
    NotSent: {},
    Unsure: {},
  },
}));

const notes = actorRef(NotesMachine, "mine");

const notesSetup = runtimeSetup({
  app: app({ id: "notes", machines: { notes: NotesMachine } }),
  services: Layer.merge(GitLive("https://git.example"), layerIndexedDb()),
  scope: "notes",
  persistence: { captureMs: 0 },
});

const notesStory = (id: string) => Story.app(notesSetup, { id, fixtures: [GitFake] });

const KEY = "actor/Restore/Notes/mine";

const reported = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Reported" ? [`${e.code} ${e.reason}`] : []));

const savedCount = (run: StoryRun<string>, checkpoint: string) => {
  const text = run.checkpoints[checkpoint]?.records.stored.get(KEY);

  return text === undefined
    ? undefined
    : Schema.decodeUnknownSync(
        Schema.fromJsonString(
          Schema.Struct({
            body: Schema.Struct({ memory: Schema.Struct({ notes: Schema.Array(Schema.String) }) }),
          }),
        ),
      )(text).body.memory.notes.length;
};

describe("an actor record that cannot encode (Actors R8; WriteAhead R4; Codec R1, R4)", () => {
  it("WriteAhead R4: memory holding a lone surrogate is reported UnencodableValue once and never saved; the last good capture restores", async () => {
    const run = checked(
      await notesStory("restore/unencodable")
        .ensure(notes)
        .send(notes, Notes.E.Grow({ count: 5000 }))
        .checkpoint("good")
        .send(notes, Notes.E.Scribble())
        .send(notes, Notes.E.Scribble())
        .checkpoint("withheld")
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    expect(reported(run)).toEqual([
      "UnencodableValue withheld: loneSurrogate at $.body.memory.notes[0]",
    ]);
    expect(savedCount(run, "good")).toBe(5000);
    expect(savedCount(run, "withheld")).toBe(5000);
    expect(run.checkpoints.reloaded.read(notes)?.memory.notes).toHaveLength(5000);
  });

  it("Actors R8: the end waits while the record cannot encode, and ends once it can", async () => {
    const run = checked(
      await notesStory("restore/unencodable-end")
        .ensure(notes)
        .send(notes, Notes.E.Scribble())
        .detach(notes)
        .advance("1 second")
        .checkpoint("waiting")
        .send(notes, Notes.E.Grow({ count: 2 }))
        .advance("1 second")
        .checkpoint("ended")
        .run(),
    );

    expect(run.checkpoints.waiting.inspection.actors.map((a) => a.actor)).toEqual([
      "Restore/Notes/mine",
    ]);
    expect(run.checkpoints.ended.inspection.actors).toEqual([]);
    expect(savedCount(run, "ended")).toBe(2);
  });

  it("WriteAhead R12, R13: a send whose actor record cannot encode never waits: it ends NotSent StorageRefused at once, with no StorageSilent, and a sync after the record encodes is sent", async () => {
    const run = checked(
      await notesStory("restore/unencodable-send")
        .ensure(notes)
        .send(notes, Notes.E.Scribble())
        .send(notes, Notes.E.Sync({ repo: "flow" }))
        .advance("11 seconds")
        .checkpoint("refused")
        .send(notes, Notes.E.Grow({ count: 1 }))
        .send(notes, Notes.E.Sync({ repo: "flow" }))
        .advance("1 second")
        .checkpoint("sent")
        .run(),
    );

    const silent = run.evidence.filter((e) => e._tag === "Lane" && e.kind === "StorageSilent");

    expect(silent).toEqual([]);
    expect(
      run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [])),
    ).toEqual(["notSent StorageRefused", "success success"]);
    expect(run.checkpoints.refused.read(Git.sync)).toEqual([]);
    expect(run.checkpoints.sent.read(Git.sync)).toHaveLength(1);
  });

  it("WriteAhead R13: a sync whose batch waits behind one still out, and whose actor record stops encoding before its batch is captured, ends NotSent StorageRefused and is never sent", async () => {
    const run = checked(
      await notesStory("restore/unencodable-before-capture")
        .ensure(notes)
        .world(Fake.storage.hold())
        .send(notes, Notes.E.Grow({ count: 1 }))
        .send(notes, Notes.E.Sync({ repo: "flow" }))
        .send(notes, Notes.E.Scribble())
        .world(Fake.storage.release())
        .advance("1 second")
        .checkpoint("refused")
        .run(),
    );

    expect(
      run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [])),
    ).toEqual(["notSent StorageRefused"]);
    expect(run.checkpoints.refused.read(Git.sync)).toEqual([]);
    expect(savedCount(run, "refused")).toBe(1);
  });

  it("Codec R4: a commit whose input has no canonical form declines NotSent Unencodable and withholds nothing", async () => {
    const run = checked(
      await notesStory("restore/unencodable-input")
        .ensure(notes)
        .send(notes, Notes.E.Sync({ repo: "\uD800" }))
        .advance("1 second")
        .checkpoint("after")
        .run(),
    );

    expect(
      run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [])),
    ).toEqual(["notSent Unencodable"]);
    expect(reported(run)).toEqual([]);
    expect(run.checkpoints.after.read(Git.sync)).toEqual([]);
  });

  it("Codec R4: a commit whose input has no canonical form outside its key (a lone surrogate in its document) declines NotSent Unencodable and sends nothing", async () => {
    const run = checked(
      await notesStory("restore/unencodable-document")
        .ensure(notes)
        .send(notes, Notes.E.Publish({ doc: ["\uD800"] }))
        .advance("1 second")
        .checkpoint("after")
        .run(),
    );

    expect(
      run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [])),
    ).toEqual(["notSent Unencodable"]);
    expect(run.checkpoints.after.read(Git.sync)).toEqual([]);
  });

  it("Codec R1: twelve commits of 200,000 characters on one lane, 2.4 MB queued, are all sent and end; nothing declines or is reported", async () => {
    const big = Notes.E.Sync({ repo: "r".repeat(200_000) });

    const queued = Array.from({ length: 12 }).reduce<Story>(
      (s) => s.send(notes, big),
      notesStory("restore/lane-record-large").ensure(notes).world(Git.sync.hold()),
    );

    const run = checked(
      await queued.world(Git.sync.release()).advance("1 second").checkpoint("after").run(),
    );

    const ended = run.evidence.flatMap((e) =>
      e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [],
    );

    expect(ended).toEqual(Array.from({ length: 12 }, () => "success success"));
    expect(reported(run)).toEqual([]);
    expect(run.checkpoints.after.read(Git.sync)).toHaveLength(12);
  });

  it("Actors R22: a Runtime disposed while an identity is withheld ends its queued commits once, across the reload", async () => {
    const run = checked(
      await notesStory("restore/unencodable-disposal")
        .ensure(notes)
        .world(Git.sync.hold())
        .send(notes, Notes.E.Sync({ repo: "flow" }))
        .send(notes, Notes.E.Sync({ repo: "flow" }))
        .send(notes, Notes.E.Scribble())
        .send(notes, Notes.E.Sync({ repo: "flow" }))
        .disposeRuntime()
        .advance(RuntimeDefaults.disposalBound)
        .reload()
        .advance("1 second")
        .checkpoint("after")
        .run(),
    );

    expect(run.checkpoints.after.inspection.owed).toEqual([]);
  });

  it(
    "Codec R1, R6: a commit whose input is 100,000 deep is sent; another as deep is saved with its lane, survives a reload while held and ends; nothing throws",
    async () => {
      const nest = (depth: number) => {
        let doc: Schema.Json = "leaf";

        for (let n = 0; n < depth; n += 1) doc = [doc];

        return doc;
      };

      // The input holds the document, one container more.
      const run = checked(
        await notesStory("restore/deep-input")
          .ensure(notes)
          .send(notes, Notes.E.Publish({ doc: nest(100_000) }))
          .world(Git.sync.hold())
          .send(notes, Notes.E.Publish({ doc: nest(100_001) }))
          .checkpoint("held")
          .reload()
          .advance("1 second")
          .checkpoint("after")
          .run(),
      );

      expect(
        [...run.checkpoints.held.records.stored.keys()].some((k) => k.startsWith("work/")),
      ).toBe(true);
      expect(
        run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [])),
      ).toEqual(["success success", "unknown Restored"]);
      expect(reported(run)).toEqual([]);
    },
    LIMITS.deepCommit,
  );
});
