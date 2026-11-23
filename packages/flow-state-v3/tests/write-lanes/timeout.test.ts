import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { ChatLive } from "../../fixtures/chat/adapters/chat.ts";
import { Chat } from "../../fixtures/chat/server/chat.ts";
import { MessagesFake } from "../../fixtures/chat/server/layer.ts";
import { MessagesApi } from "../../fixtures/chat/services.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Story } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  type Machine,
  machine,
  runtimeSetup,
  transaction,
} from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";

// Operations R2 and the rule TimeoutIsUnknown: a write whose Effect fails with
// `Cause.TimeoutError` ends unknown, never as a failure. Its type will exclude `TimeoutError` from
// a transaction's `E` (Operations Q5), so the write and the poster that maps it are built as plain
// JavaScript builds them, mapping a `TimeoutError` failure too, so today's ending shows.

type Tokens = {
  readonly S: Readonly<Record<string, unknown>>;
  readonly E: Readonly<Record<string, unknown>>;
  readonly O: Readonly<Record<string, { readonly commit: (select: unknown) => unknown }>>;
};

const declare: (config: unknown) => { readonly outcomes: (endings: unknown) => unknown } =
  loose(transaction);

const define: (config: unknown) => unknown = loose(definition);
const build: (d: unknown, body: (tokens: Tokens) => unknown) => Machine = loose(machine);

const timed = declare({
  id: "Test/post",
  input: { thread: Schema.String, clientId: Schema.String, text: Schema.String },
  key: ["thread"],
  concurrency: "reject",
  services: [MessagesApi],
  commit: (input: { readonly thread: string; readonly clientId: string; readonly text: string }) =>
    MessagesApi.use((api) => api.send(input, { idempotencyKey: input.clientId })).pipe(
      Effect.timeout("5 seconds"),
    ),
});

const Poster = define({
  id: "Test/Poster",
  states: ["READY"],
  events: { Post: {} },
  internalEvents: { Posted: {}, Failed: {}, Unsure: Flow.uncertain({}) },
  memory: { heard: Flow.initial(Schema.String, "") },
  operations: ({ E }: Tokens) => ({
    post: timed.outcomes({
      success: E["Posted"],
      failure: { TimeoutError: E["Failed"], NoResponse: E["Failed"] },
      unknown: E["Unsure"],
    }),
  }),
});

const PosterMachine = build(Poster, ({ S, O }) => ({
  default: S["READY"],
  on: {
    Post: {
      actions: [O["post"]?.commit(() => ({ thread: "general", clientId: "c-1", text: "hi" }))],
    },
    Posted: { updateMemory: () => ({ heard: "posted" }) },
    Failed: { updateMemory: () => ({ heard: "failed" }) },
    Unsure: { updateMemory: () => ({ heard: "unsure" }) },
  },
}));

const poster = actorRef(PosterMachine, "poster");

const setup = runtimeSetup({
  app: app({ id: "poster", machines: { poster: PosterMachine } }),
  services: loose(Layer.merge(ChatLive("https://chat.example"), layerIndexedDb())),
  scope: "poster",
  persistence: { captureMs: 0 },
});

const storyOf: (s: unknown, options: unknown) => Story = loose(Story.app);

describe("a write's timeout (Operations R2, TimeoutIsUnknown)", () => {
  it.fails("Operations R2, TimeoutIsUnknown: a post whose answer does not come within its 5-second timeout ends unknown, not as a failure", async () => {
    const run = await storyOf(setup, { id: "test/post-timeout", fixtures: [MessagesFake] })
      .ensure(poster)
      .world(Chat.send.hold())
      // oxlint-disable-next-line flow-state/no-raw-event -- the poster is built as plain JavaScript builds it, so no typed token exists to build its event
      .send(poster, { _tag: "Post" })
      .advance("4999 millis")
      .checkpoint("waiting")
      .advance("1 milli")
      .checkpoint("timed out")
      .run();

    expect(run.checkpoints.waiting.read(poster)?.memory).toEqual({ heard: "" });
    expect(run.checkpoints["timed out"].read(poster)?.memory).toEqual({ heard: "unsure" });
  });
});
