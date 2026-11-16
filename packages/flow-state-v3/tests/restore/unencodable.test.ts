import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { GitApi } from "../../fixtures/sync/contracts.ts";
import { GitLive } from "../../fixtures/sync/git-http.ts";
import { Git, GitFake } from "../../fixtures/sync/server.ts";
import { Story, type StoryRun } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  Outcome,
  runtimeSetup,
  transaction,
} from "../../src/index.ts";
import { checked } from "../rules/rules.ts";

const sync = transaction({
  id: "Restore/sync",
  input: { repo: Schema.String },
  key: ["repo"],
  concurrency: "serialize",
  services: [GitApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(GitApi), (api) =>
      api.sync(input, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});

const Notes = definition({
  id: "Restore/Notes",
  persist: true,
  states: ["READY"],
  events: { Grow: { count: Schema.Number }, Sync: { repo: Schema.String } },
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
      notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const byRepo = ({ event }: { readonly event: { readonly repo: string } }) => ({ repo: event.repo });

// A notebook whose notes grow to any length, past the codec's 4,096 items included, and that syncs.
const NotesMachine = machine(Notes, ({ S, O }) => ({
  default: S.READY,
  on: {
    Grow: {
      updateMemory: ({ event }) => ({
        notes: Array.from({ length: event.count }, (_, i) => `note ${i}`),
      }),
    },
    Sync: { actions: [O.sync.commit(byRepo)] },
    Synced: {},
    Limited: {},
    NotSent: {},
    Unsure: {},
  },
}));

const notes = actorRef(NotesMachine, "mine");

const notesSetup = runtimeSetup({
  app: app({ id: "notes", machines: { notes: NotesMachine } }),
  services: GitLive("https://git.example"),
  scope: "notes",
  persistence: { captureMs: 0 },
});

const notesStory = (id: string) => Story.app(notesSetup, { id, fixtures: [GitFake] });

const KEY = "actor/Restore/Notes/mine";

const reported = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Reported" ? [`${e.code} ${e.reason}`] : []));

const savedCount = (run: StoryRun, checkpoint: string) => {
  const text = run.checkpoints[checkpoint]?.records.stored.get(KEY);

  return text === undefined
    ? undefined
    : Schema.decodeUnknownSync(
        Schema.fromJsonString(
          Schema.Struct({ memory: Schema.Struct({ notes: Schema.Array(Schema.String) }) }),
        ),
      )(text).memory.notes.length;
};

describe("an actor record past a codec bound (Actors R8; WriteAhead R4; Codec R1, R4)", () => {
  it("WriteAhead R4: memory of 4,097 notes is reported UnencodableValue once and never saved; the last good capture restores", async () => {
    const run = checked(
      await notesStory("restore/unencodable")
        .ensure(notes)
        .send(notes, { _tag: "Grow", count: 4096 })
        .checkpoint("good")
        .send(notes, { _tag: "Grow", count: 4097 })
        .send(notes, { _tag: "Grow", count: 4098 })
        .checkpoint("withheld")
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    expect(reported(run)).toEqual(["UnencodableValue withheld: items over 4096 at $.memory.notes"]);
    expect(savedCount(run, "good")).toBe(4096);
    expect(savedCount(run, "withheld")).toBe(4096);
    expect(run.checkpoints.reloaded.read(notes)?.memory["notes"]).toHaveLength(4096);
  });

  it("Actors R8: the end waits while the record cannot encode, and ends once it can", async () => {
    const run = checked(
      await notesStory("restore/unencodable-end")
        .ensure(notes)
        .send(notes, { _tag: "Grow", count: 4097 })
        .detach(notes)
        .advance("1 second")
        .checkpoint("waiting")
        .send(notes, { _tag: "Grow", count: 2 })
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
        .send(notes, { _tag: "Grow", count: 4097 })
        .send(notes, { _tag: "Sync", repo: "flow" })
        .advance("11 seconds")
        .checkpoint("refused")
        .send(notes, { _tag: "Grow", count: 1 })
        .send(notes, { _tag: "Sync", repo: "flow" })
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

  it("Codec R4: a commit whose input is past a codec bound declines NotSent Unencodable and withholds nothing", async () => {
    const run = checked(
      await notesStory("restore/unencodable-input")
        .ensure(notes)
        .send(notes, { _tag: "Sync", repo: "r".repeat(262_145) })
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

  it("Codec R4: a commit whose key fits a string's bound but whose lane id, which an owed row names, does not declines NotSent Unencodable", async () => {
    // The key's text is 262,141 bytes; the lane id adds the identity and operation to it.
    const run = checked(
      await notesStory("restore/lane-id-bound")
        .ensure(notes)
        .send(notes, { _tag: "Sync", repo: "r".repeat(262_130) })
        .advance("1 second")
        .checkpoint("after")
        .run(),
    );

    expect(
      run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [])),
    ).toEqual(["notSent Unencodable"]);
    expect(run.checkpoints.after.read(Git.sync)).toEqual([]);
  });

  it("Codec R4: a commit that would take its lane record past a bound declines NotSent Unencodable, and every other commit is sent and ends", async () => {
    // Each input's text is 200,011 bytes: a head and nine queued commits fit the 2,097,152 bytes
    // of a lane record, and a tenth queued one would not.
    const big = { _tag: "Sync", repo: "r".repeat(200_000) } as const;

    const queued = Array.from({ length: 12 }).reduce<Story>(
      (s) => s.send(notes, big),
      notesStory("restore/lane-record-bound").ensure(notes).world(Git.sync.hold()),
    );

    const run = checked(
      await queued.world(Git.sync.release()).advance("1 second").checkpoint("after").run(),
    );

    const ended = run.evidence.flatMap((e) =>
      e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : [],
    );

    expect(ended.filter((e) => e === "notSent Unencodable")).toHaveLength(2);
    expect(ended.filter((e) => e.startsWith("success"))).toHaveLength(10);
    expect(reported(run)).toEqual([]);
    expect(run.checkpoints.after.read(Git.sync)).toHaveLength(10);
  });

  it("Actors R22: a Runtime disposed while an identity is withheld ends its queued commits once, across the reload", async () => {
    const run = checked(
      await notesStory("restore/unencodable-disposal")
        .ensure(notes)
        .world(Git.sync.hold())
        .send(notes, { _tag: "Sync", repo: "flow" })
        .send(notes, { _tag: "Sync", repo: "flow" })
        .send(notes, { _tag: "Grow", count: 4097 })
        .send(notes, { _tag: "Sync", repo: "flow" })
        .disposeRuntime()
        .advance("5 seconds")
        .reload()
        .advance("1 second")
        .checkpoint("after")
        .run(),
    );

    expect(run.checkpoints.after.inspection.owed).toEqual([]);
  });
});
