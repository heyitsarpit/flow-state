import { Data, Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { attachInspector, type Evidence } from "../../src/host/inspect.ts";
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
import { Story } from "../../src/host/testing/index.ts";

// A save that never answers: the test reads what the step decided, not what the server said.
const save = transaction({
  id: "Edges/save",
  input: { text: Schema.String },
  key: [],
  concurrency: "serialize",
  services: [],
  commit: () => Effect.never,
});

const Draft = definition({
  id: "Edges/Draft",
  persist: true,
  states: ["OPEN"],
  events: { Save: { text: Schema.String } },
  internalEvents: { Saved: {}, NotSent: { why: Schema.String }, Unsure: Flow.uncertain({}) },
  memory: { text: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    save: save.outcomes({
      success: E.Saved,
      failure: {},
      notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const byText = ({ event }: { readonly event: { readonly text: string } }) => ({
  text: event.text,
});

const DraftMachine = machine(Draft, ({ S, O }) => ({
  default: S.OPEN,
  on: {
    Save: { actions: [O.save.commit(byText)] },
    Saved: {},
    NotSent: {},
    Unsure: {},
  },
}));

const Stamp = definition({
  id: "Edges/Stamp",
  states: ["SHOWN"],
  events: {},
  memory: { at: Flow.input(Schema.DateFromString) },
});

const StampMachine = machine(Stamp, ({ S }) => ({ default: S.SHOWN }));

// A Runtime with no persistence configured: nothing it runs is saved.
const unsaved = runtimeSetup({
  app: app({ id: "edges", machines: { draft: DraftMachine, stamp: StampMachine } }),
});

const ready = () => {
  const runtime = unsaved.construct();
  Effect.runSync(runtime.ready());

  return runtime;
};

const endings = (seen: ReadonlyArray<Evidence>) =>
  seen.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

describe("edges of persistence and names", () => {
  it("Actors R6, WriteAhead R16: a local actor never persists, so its commit is sent even in a Runtime without persistence", () => {
    const runtime = ready();
    const seen: Array<Evidence> = [];
    attachInspector(runtime, (e) => void seen.push(e));
    const local = runtime.createActor(DraftMachine, { input: {} });

    local.send({ _tag: "Save", text: "a" });

    expect(endings(seen)).toEqual([]);
  });

  it("WriteAhead R16: a shared actor of a persisted machine in a Runtime without persistence ends its commit NotSent { NoPersistence }", () => {
    const runtime = ready();
    const seen: Array<Evidence> = [];
    attachInspector(runtime, (e) => void seen.push(e));
    const shared = runtime.ensureActor(actorRef(DraftMachine, "d"));

    shared.send({ _tag: "Save", text: "a" });

    expect(endings(seen)).toEqual(["notSent NoPersistence"]);
  });

  it("Actors R5: a value-named actor whose input field is not JSON is named and read back with its input", () => {
    const runtime = ready();
    const at = Schema.decodeSync(Schema.DateFromString)("1970-01-01T00:00:00.000Z");
    const stamp = runtime.ensureActor(actorRef(StampMachine, { at }));

    expect(Option.map(stamp.getSnapshot(), (s) => s.memory)).toEqual(Option.some({ at }));
  });
});

// An app's own error whose tag is also the name of one of Flow's declines.
class Rejected extends Data.TaggedError("Rejected")<{ readonly by: string }> {}

class Lost extends Data.TaggedError("Lost")<{ readonly by: string }> {}

// A send whose first answer is lost; its re-send is refused by the server with the app's Rejected.
const sends = { count: 0 };

const post = transaction({
  id: "Edges/post",
  input: { text: Schema.String },
  key: [],
  concurrency: "serialize",
  services: [],
  commit: () =>
    Effect.gen(function* () {
      sends.count += 1;

      if (sends.count === 1) return yield* Outcome.unknown(new Lost({ by: "network" }));

      return yield* Effect.fail(new Rejected({ by: "server" }));
    }),
});

const Post = definition({
  id: "Edges/Post",
  states: ["OPEN"],
  events: { Post: { text: Schema.String }, Retry: {} },
  internalEvents: {
    Posted: {},
    Refused: {},
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: {},
  operations: ({ E }) => ({
    post: post.outcomes({
      success: E.Posted,
      failure: { Rejected: E.Refused },
      notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const PostMachine = machine(Post, ({ S, O }) => ({
  default: S.OPEN,
  on: {
    Post: { actions: [O.post.commit(byText)] },
    Retry: { actions: [O.post.retry(() => ({}))] },
    Posted: {},
    Refused: {},
    NotSent: {},
    Unsure: {},
  },
}));

const posting = runtimeSetup({ app: app({ id: "posting", machines: { post: PostMachine } }) });

describe("an app error named like a decline (WriteLanes R2)", () => {
  it("WriteLanes R2: a definite failure after an unknown send of the same Attempt is unknown StillUnknown, whatever the app's error is named", async () => {
    sends.count = 0;
    const poster = actorRef(PostMachine, "p");

    const run = await Story.app(posting, { id: "edges/still-unknown", fixtures: [] })
      .ensure(poster)
      .send(poster, { _tag: "Post", text: "a" })
      .send(poster, { _tag: "Retry" })
      .checkpoint("answered")
      .run();

    expect(endings(run.evidence)).toEqual(["unknown Lost", "unknown StillUnknown"]);
  });
});
