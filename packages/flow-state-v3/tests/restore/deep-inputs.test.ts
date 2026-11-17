import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Folder as FolderSchema, foldersOf } from "../../fixtures/session/machines/nests.ts";
import { DEEP, PAST_STACK } from "../../fixtures/session/stories/values.ts";
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

// A publish of a folder tree, keyed on the tree itself: its key is as deep as its input.
const publish = transaction({
  id: "Deep/publish",
  input: { folder: FolderSchema },
  key: ["folder"],
  concurrency: "serialize",
  services: [GitApi],
  commit: (_input, { attempt }) =>
    Effect.flatMap(Effect.service(GitApi), (api) =>
      api.sync({ repo: "flow" }, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});

const Shelf = definition({
  id: "Deep/Shelf",
  persist: true,
  states: ["READY"],
  events: { Publish: { depth: Schema.Number } },
  internalEvents: {
    Published: {},
    Limited: {},
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: { shelf: Flow.input(Schema.String), held: Flow.initial(FolderSchema, { kids: [] }) },
  operations: ({ E }) => ({
    publish: publish.outcomes({
      success: E.Published,
      failure: { RateLimited: E.Limited },
      notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const treeOf = ({ event }: { readonly event: { readonly depth: number } }) => ({
  folder: foldersOf(event.depth),
});

// A shelf that holds a folder tree and publishes a tree as deep as each event asks.
const ShelfMachine = machine(Shelf, ({ S, O }) => ({
  default: S.READY,
  on: {
    Publish: {
      updateMemory: ({ event }) => ({ held: foldersOf(event.depth) }),
      actions: [O.publish.commit(treeOf)],
    },
    Published: {},
    Limited: {},
    NotSent: {},
    Unsure: {},
  },
}));

const shelfSetup = runtimeSetup({
  app: app({ id: "shelves", machines: { shelf: ShelfMachine } }),
  services: GitLive("https://git.example"),
  scope: "shelves",
  persistence: { captureMs: 0 },
});

const ended = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

const reported = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Reported" ? [`${e.code} ${e.reason}`] : []));

describe("commit inputs and lane keys of any depth (Codec R1, R4; WriteLanes R12)", () => {
  for (const depth of [PAST_STACK, DEEP])
    it(`Codec R1, WriteLanes R12: a commit keyed on a tree ${depth.toLocaleString("en")} deep is saved with its lane and its actor's memory as deep, survives a reload while held and ends once`, async () => {
      const shelf = actorRef(ShelfMachine, { shelf: "main" });

      const run = checked(
        await Story.app(shelfSetup, { id: `deep/shelf-${depth}`, fixtures: [GitFake] })
          .ensure(shelf)
          .send(shelf, { _tag: "Publish", depth: 3 })
          .world(Git.sync.hold())
          .send(shelf, { _tag: "Publish", depth })
          .checkpoint("held")
          .reload()
          .advance("1 second")
          .checkpoint("after")
          .run(),
      );

      const stored = [...run.checkpoints.held.records.stored.keys()];

      expect(stored.some((k) => k.startsWith("lane/"))).toBe(true);
      expect(stored.some((k) => k.startsWith("actor/Deep/Shelf/"))).toBe(true);
      expect(run.checkpoints.after.read(shelf)).toBeDefined();
      expect(ended(run)).toEqual(["success Ok", "unknown Restored"]);
      expect(reported(run)).toEqual([]);
    });
});
