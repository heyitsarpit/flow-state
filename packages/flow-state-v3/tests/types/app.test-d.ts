import { Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  evidenceOf,
  publishedOf,
  type PublishedOf,
  samplesOf,
  Step,
  Story,
  type StoryRun,
  turnsOf,
} from "../../src/host/testing/index.ts";
import {
  type Actor,
  actorRef,
  app,
  definition,
  Flow,
  machine,
  runtimeSetup,
} from "../../src/index.ts";

// Each wrong line is refused under `@ts-expect-error`; beside it the correct use of the same
// parameter compiles and is asserted exactly, so no line fails because a type became `never`.

const Plain = definition({
  id: "types/app/Plain",
  states: ["A", "B"],
  events: { Go: {} },
  memory: { n: Flow.initial(Schema.Number, 0) },
});

const Rent = definition({
  id: "types/app/Rent",
  states: ["DRAFT", "PAID"],
  events: { Pay: {} },
  memory: { amount: Flow.initial(Schema.Number, 0) },
});

const PlainMachine = machine(Plain, ({ S }) => ({ default: S.A, on: { Go: S.B } }));
const RentMachine = machine(Rent, ({ S }) => ({ default: S.DRAFT, on: { Pay: S.PAID } }));

const shopSetup = runtimeSetup({
  app: app({ id: "types/app/shop", machines: { plain: PlainMachine } }),
});

// Not in the shop app.
const rent = actorRef(RentMachine, "r1");
const plain = actorRef(PlainMachine, "p1");

const shopStory = Story.app(shopSetup, { id: "types/app/shop", fixtures: [] });
declare const shopRun: Awaited<ReturnType<ReturnType<typeof shopStory.checkpoint<"a">>["run"]>>;
declare const named: StoryRun<"a" | "b">;

const sampled = {
  names: { setup: "s", fixtures: [] },
  servers: {},
  failures: [],
  landedFailures: [],
  controls: [],
  values: {},
} as const;

describe("Actors R24, Stories T2: a Runtime and a Story take only their app's refs", () => {
  it("a Runtime's words with a ref of a machine the app does not run", () => {
    const runtime = shopSetup.construct();

    // @ts-expect-error Actors R24: Rent is no machine of the shop app
    runtime.ensureActor(rent);
    // @ts-expect-error Actors R24: Rent is no machine of the shop app
    runtime.createActor(RentMachine, { input: {} });
    // @ts-expect-error Actors R24: Rent is no machine of the shop app
    runtime.disposeActor(rent);

    expectTypeOf(runtime.ensureActor(plain)).toEqualTypeOf<Actor<typeof Plain>>();
    expectTypeOf(runtime.createActor(PlainMachine, { input: {} })).toEqualTypeOf<
      Actor<typeof Plain>
    >();
    expectTypeOf(runtime.disposeActor(plain)).toEqualTypeOf<void>();
  });

  it("a Story's words with a ref of a machine the app does not run", () => {
    // @ts-expect-error Stories T2: Rent is no machine of the shop app
    shopStory.send(rent, Rent.E.Pay());
    // @ts-expect-error Stories T2: Rent is no machine of the shop app
    shopStory.ensure(rent);
    // @ts-expect-error Stories T2: Rent is no machine of the shop app
    shopStory.detach(rent);
    // @ts-expect-error Stories T2: Rent is no machine of the shop app
    shopStory.dispose(rent);

    expectTypeOf(shopStory.send(plain, Plain.E.Go())).toEqualTypeOf(shopStory);
    expectTypeOf(shopStory.ensure(plain)).toEqualTypeOf(shopStory);
    expectTypeOf(shopStory.detach(plain)).toEqualTypeOf(shopStory);
    expectTypeOf(shopStory.dispose(plain)).toEqualTypeOf(shopStory);

    // @ts-expect-error Stories T2: Pay is no event of Plain
    shopStory.send(plain, Rent.E.Pay());
  });

  it("a cut reads only its app's refs", () => {
    expectTypeOf(shopRun.end.read(plain)?.memory).toEqualTypeOf<
      { readonly n: number } | undefined
    >();

    // @ts-expect-error Stories T2: Rent is no machine of the shop app, so the read is always undefined
    shopRun.end.read(rent);
  });

  it("a selector or a sample takes only its app's refs and tokens", () => {
    // @ts-expect-error Stories T2: Rent is no machine of the shop app
    publishedOf(shopRun, rent);
    // @ts-expect-error Stories T2: Pay is no event of the shop app
    turnsOf(shopRun, Rent.E.Pay);
    // @ts-expect-error Stories T2: Rent is no machine of the shop app
    evidenceOf(shopRun, Rent.E.Pay, { actor: rent });
    // @ts-expect-error Stories T2: Pay is no event of Plain's actor
    turnsOf(shopRun, Rent.E.Pay, { actor: plain });

    samplesOf({
      ...sampled,
      id: "types/app/samples",
      story: shopStory,
      // @ts-expect-error Stories T2: Rent is no machine of the shop app
      actors: { rent },
      steps: (s) => s,
    });

    expectTypeOf(publishedOf(shopRun, plain)).toEqualTypeOf<Array<PublishedOf<typeof Plain>>>();
    expectTypeOf(turnsOf(shopRun, Plain.E.Go)[0]?.to).toEqualTypeOf<"A" | "B" | undefined>();
    expectTypeOf(turnsOf(shopRun, Plain.E.Go, { actor: plain })[0]?.event).toEqualTypeOf<
      "Go" | undefined
    >();
    expectTypeOf(evidenceOf(shopRun, Plain.E.Go, { actor: plain })[0]?.event).toEqualTypeOf<
      "Go" | undefined
    >();
    expectTypeOf(
      samplesOf({
        ...sampled,
        id: "types/app/right",
        story: shopStory,
        actors: { plain },
        steps: (s) => s,
      }).id,
    ).toEqualTypeOf<string>();
  });
});

describe("Stories R12, T2: a run keeps its checkpoint names", () => {
  it("a run from steps keeps the story's names", async () => {
    const story = shopStory.checkpoint("a");
    const run = await story.run({ steps: story.steps });

    expectTypeOf(run.checkpoints).toEqualTypeOf<{ readonly a: (typeof run)["end"] }>();

    // @ts-expect-error Stories R12: nonsense is no checkpoint of this run
    void run.checkpoints.nonsense;
  });

  it("a helper over an unnamed run cannot index a checkpoint by name", () => {
    // @ts-expect-error Stories R12: an unnamed run has no checkpoint names
    const helper = (run: StoryRun) => run.checkpoints.zzz;
    const named_ = <N extends string>(run: StoryRun<N>, name: N) => run.checkpoints[name];

    void helper;
    expectTypeOf<
      keyof ReturnType<(run: StoryRun) => typeof run.checkpoints>
    >().toEqualTypeOf<never>();
    expectTypeOf(named_(named, "a").now).toEqualTypeOf<number>();
  });

  it("a named run refuses an unknown name", () => {
    expectTypeOf(named.checkpoints.a.now).toEqualTypeOf<number>();
    // @ts-expect-error Stories R12: c is no checkpoint of this run
    void named.checkpoints.c;
  });

  it("a checkpoint step's name is free text", () => {
    expectTypeOf(Step.checkpoint({ name: "a" }).name).toEqualTypeOf<string>();
  });
});
