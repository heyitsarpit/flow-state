// What the stand-ins refuse: each line must be a compile error, or tsc fails on the unused @ts-expect-error. This proves the stand-ins
// match the design's words where they claim to be strict. It says nothing about Flow, which does not exist.
import { Duration, Effect, Schema, Stream } from "effect";
import { definition, Feed, machine, stream } from "flow-state";
import { Fake, Story } from "flow-state/testing";

class Dropped extends Schema.TaggedClass<Dropped>()("Dropped", {}) {}
const Item = Schema.Struct({ id: Schema.String, at: Schema.Number });
const source = Stream.fromEffect(Effect.fail(new Dropped())) as Stream.Stream<
  typeof Item.Type | Feed.Signal<number>,
  Dropped
>;
const common = { id: "c", input: {}, output: Item, key: [] as const };

// `Story.make`, `Story.property`, `Story.inspection` are gone.
// @ts-expect-error
Story.make;
// @ts-expect-error
Story.property;
// @ts-expect-error
Story.inspection;

// W14: a handler returns an object, not a tuple.
// @ts-expect-error
Fake.call({ request: {}, handle: (truth: number) => [truth, { status: 200 }] });

const server = Fake.server("S", {
  truth: { n: Schema.Number },
  initial: { n: 0 },
  endpoints: {
    save: Fake.call({
      request: { id: Schema.String },
      handle: () => ({ response: { status: 200 } }),
    }),
  },
});
// @ts-expect-error `at` on a server handle
server.hold({ at: "response" });
// @ts-expect-error `.expect` left the Story (SC1)
Story.app({}, { id: "a" }).expect;
// @ts-expect-error `process()` is gone (W2)
Story.app({}, { id: "a" }).process;
// @ts-expect-error `.do` is gone (W37)
Story.app({}, { id: "a" }).do;
const machineStory = Story.machine(
  machine(definition({ id: "d", states: ["A"] }), () => ({})),
  { id: "m" },
);
// @ts-expect-error `reload` is app-only
machineStory.reload;
export const unknownCheckpoint = async () => {
  const { checkpoints } = await Story.app({}, { id: "a" }).checkpoint("one").run();
  // @ts-expect-error an unknown checkpoint name
  return checkpoints.two;
};

// `reconnect` and `idleTime` come together.
// @ts-expect-error
stream({ ...common, delivers: "every", subscribe: () => source, reconnect: {} });
// @ts-expect-error `position` is a field of output
stream({ ...common, delivers: "every", position: "nope", subscribe: () => source });
// @ts-expect-error `Feed.reconnect` is gone
Feed.reconnect;

const every = stream({
  ...common,
  delivers: "every",
  position: "at",
  subscribe: () => source,
  reconnect: {},
  idleTime: "1 minute",
});
export const wrongFills = definition({
  id: "f",
  states: ["A"],
  internalEvents: { V: {}, M: {}, F: {} },
  memory: { title: Schema.String, items: Schema.Array(Item) },
  // @ts-expect-error `fills` must name an array, Record or number: `title` is a string
  operations: ({ E }) => ({
    feed: every.outcomes({
      value: E.V,
      missed: E.M,
      fills: "title",
      failure: { Dropped: E.F, Feed: E.F },
    }),
  }),
});
export const rightFills = definition({
  id: "g",
  states: ["A"],
  internalEvents: { V: {}, M: {}, F: {} },
  memory: { items: Schema.Array(Item) },
  operations: ({ E }) => ({
    feed: every.outcomes({
      value: E.V,
      missed: E.M,
      fills: "items",
      failure: { Dropped: E.F, Feed: E.F },
    }),
  }),
});
// @ts-expect-error an operation the definition does not declare
rightFills.O.nope;
// @ts-expect-error an event the definition does not declare
rightFills.E.Nope;
export const unused = Duration.seconds(1);
// @ts-expect-error no such endpoint or control
export const noEndpoint = server.nope;
