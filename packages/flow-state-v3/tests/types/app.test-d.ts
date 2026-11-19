import { Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  evidenceOf,
  publishedOf,
  samplesOf,
  Step,
  Story,
  type StoryRun,
  turnsOf,
} from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type (the
// `.not` of the narrow type, or the wide type itself) then fails too: make it the exact narrow
// type. A positive assertion that holds today stays as it is.

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

describe("Actors R24, Stories T2: a Runtime and a Story take only their app's refs", () => {
  it("a Runtime's words with a ref of a machine the app does not run", () => {
    const runtime = shopSetup.construct();

    runtime.ensureActor(rent); // wrong: faults late with ForeignActorRef
    runtime.createActor(RentMachine, { input: {} }); // wrong
    runtime.disposeActor(rent); // wrong
    runtime.ensureActor(plain);
  });

  it("a Story's words with a ref of a machine the app does not run", () => {
    shopStory.send(rent, Rent.E.Pay()); // wrong
    shopStory.ensure(rent); // wrong
    shopStory.detach(rent); // wrong
    shopStory.dispose(rent); // wrong
    shopStory.send(plain, Plain.E.Go());

    // @ts-expect-error Stories T2: Pay is no event of Plain
    shopStory.send(plain, Rent.E.Pay());
  });

  it("a cut read of a ref the app does not run reads nothing, silently", () => {
    expectTypeOf(shopRun.end.read(plain)?.memory).toEqualTypeOf<
      { readonly n: number } | undefined
    >();

    shopRun.end.read(rent); // wrong: always undefined
  });

  it("a selector or a sample over a ref or token the app does not run", () => {
    publishedOf(shopRun, rent); // wrong: always []
    turnsOf(shopRun, Rent.E.Pay); // wrong: always []
    evidenceOf(shopRun, Rent.E.Pay, { actor: rent }); // wrong: always []

    samplesOf({
      id: "types/app/samples",
      story: shopStory,
      names: { setup: "s", fixtures: [] },
      actors: { rent }, // wrong: rent is not in the shop app
      servers: {},
      failures: [],
      landedFailures: [],
      controls: [],
      values: {},
      steps: (s) => s,
    });

    // @ts-expect-error Stories T2: Pay is no event of Plain's actor
    turnsOf(shopRun, Rent.E.Pay, { actor: plain });
  });
});

describe("Stories R12, T2: a run keeps its checkpoint names", () => {
  it("a run from steps keeps the story's names", async () => {
    const story = shopStory.checkpoint("a");
    const run = await story.run({ steps: story.steps });

    expectTypeOf(run).not.toEqualTypeOf<StoryRun<"a">>();
    expectTypeOf(run).toEqualTypeOf<StoryRun>();

    void run.checkpoints["nonsense"]; // wrong: no such checkpoint
  });

  it("a helper over an unnamed run cannot index a checkpoint by name", () => {
    const helper = (run: StoryRun) => run.checkpoints["zzz"]; // wrong: names are lost

    void helper;
  });

  it("a named run refuses an unknown name today", () => {
    void named.checkpoints.a;
    // @ts-expect-error Stories R12: c is no checkpoint of this run
    void named.checkpoints.c;
  });

  it("a checkpoint step's name is free text", () => {
    expectTypeOf(Step.checkpoint({ name: "a" }).name).toEqualTypeOf<string>();
  });
});
