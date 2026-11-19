import { Effect, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  actorRef,
  definition,
  Flow,
  machine,
  type Machine,
  resource,
  send,
  transaction,
} from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type (the
// `.not` of the narrow type, or the wide type itself) then fails too: make it the exact narrow
// type. A positive assertion that holds today stays as it is.

type Declined = { readonly _tag: "Declined"; readonly code: string };

type Busy = { readonly _tag: "Busy" };

type Gone = { readonly _tag: "Gone" };

type Receipt = { readonly receipt: number };

const pay = transaction({
  id: "types/endings/pay",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  // RETURN_TYPE: the success and the failures the endings below must take, stated once.
  commit: (): Effect.Effect<Receipt, Declined | Busy> => Effect.succeed({ receipt: 1 }),
});

const look = resource({
  id: "types/endings/look",
  input: { id: Schema.String },
  key: ["id"],
  services: [],
  staleTime: 0,
  gcTime: 0,
  // RETURN_TYPE: the value and the failure the endings below must take, stated once.
  lookup: (): Effect.Effect<{ readonly cents: number }, Gone> => Effect.succeed({ cents: 1 }),
});

const events = { Ad: {}, Go: { n: Schema.Number } };

const internalEvents = {
  Got: { cents: Schema.Number },
  Done: { receipt: Schema.Number },
  Dec: { code: Schema.String },
  Busy: {},
  Ok: {},
  Uncertain: Flow.uncertain({ why: Schema.String }),
  Unsure: Flow.uncertain({}),
  Need: { n: Schema.Number },
};

type PayEndings = Parameters<typeof pay.outcomes>[0];

describe("Compile R9, WriteLanes R3: a write's endings take the commit's values", () => {
  it("today success, unknown and each failure take one erased ending", () => {
    expectTypeOf<PayEndings["success"]>().toEqualTypeOf<PayEndings["unknown"]>();
    expectTypeOf<PayEndings["success"]>().toEqualTypeOf<PayEndings["failure"]["Declined"]>();
  });

  it("a success token whose payload no value fills", () => {
    definition({
      id: "types/endings/A",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        p: pay.outcomes({
          success: E.Got, // wrong: Got needs { cents }, and a bare token supplies nothing
          failure: { Declined: E.Dec.from((e: Declined) => ({ code: e.code })), Busy: E.Busy },
          unknown: E.Unsure,
        }),
      }),
    });
  });

  it("an unknown ending that is certain, or that has fields an unknown cannot fill", () => {
    definition({
      id: "types/endings/B",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        certain: pay.outcomes({
          success: E.Busy,
          failure: { Declined: E.Busy, Busy: E.Busy },
          unknown: E.Ok, // wrong: Ok is a certain event
        }),
        filled: pay.outcomes({
          success: E.Busy,
          failure: { Declined: E.Busy, Busy: E.Busy },
          unknown: E.Uncertain, // wrong: no value fills `why`
        }),
      }),
    });
  });

  it("a mapper whose parameter is not the commit's value", () => {
    definition({
      id: "types/endings/C",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        p: pay.outcomes({
          success: E.Done.from((v: { receiptt: number }) => ({ receipt: v.receiptt })), // wrong
          failure: {
            Declined: E.Dec.from((e: { readonly zzz: string }) => ({ code: e.zzz })), // wrong
            Busy: E.Busy,
          },
          unknown: E.Unsure,
        }),
      }),
    });
  });

  it("a mapper's returned payload is exact, as an ending and as a send's event", () => {
    const Target = definition({
      id: "types/endings/Target",
      states: ["A"],
      events: { Credit: { cents: Schema.Number } },
    });

    const TargetMachine = machine(Target, ({ S }) => ({ default: S.A }));

    definition({
      id: "types/endings/Extra",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        p: pay.outcomes({
          success: E.Done.from(() => ({ receipt: 1, reciept: 2 })), // wrong: `reciept`
          failure: { Declined: E.Busy, Busy: E.Busy },
          unknown: E.Unsure,
        }),
      }),
    });

    const Sender = definition({ id: "types/endings/Sender", states: ["A"], events: { Go: {} } });

    const right = machine(Sender, ({ S }) => ({
      default: S.A,
      on: {
        Go: {
          actions: [
            send(
              () => actorRef(TargetMachine, "t"),
              Target.E.Credit.from(() => ({ cents: 1, cnets: 2 })), // wrong: `cnets`
            ),
            send(
              () => actorRef(TargetMachine, "t"),
              Target.E.Credit.from(() => ({ cents: 1 })),
            ),
          ],
        },
      },
    }));

    expectTypeOf(right).toEqualTypeOf<Machine<typeof Sender>>();
  });

  it("an unannotated mapper reads the commit's success and failure values", () => {
    definition({
      id: "types/endings/D",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        p: pay.outcomes({
          success: E.Done.from((v) => {
            expectTypeOf(v).not.toEqualTypeOf<Receipt>();
            expectTypeOf(v).toBeNever();

            return { receipt: 1 };
          }),
          failure: {
            Declined: E.Dec.from((e) => {
              expectTypeOf(e).not.toEqualTypeOf<Declined>();

              return { code: "x" };
            }),
            Busy: E.Busy,
          },
          unknown: E.Unsure,
        }),
      }),
    });
  });

  it("a write's failures are exhaustive today", () => {
    definition({
      id: "types/endings/E",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        // @ts-expect-error Compile R9: the Busy failure is unmapped
        p: pay.outcomes({ success: E.Busy, failure: { Declined: E.Dec }, unknown: E.Unsure }),
      }),
    });
  });
});

describe("Compile R9, Reads R1: a read's failures are its lookup's tags, each mapped", () => {
  it("a misspelt failure tag, and the real tag left unmapped", () => {
    definition({
      id: "types/endings/F",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        typo: look.outcomes({ success: E.Busy, failure: { Gon: E.Busy } }), // wrong: no Gon
        none: look.outcomes({ success: E.Busy, failure: {} }), // wrong: Gone is unmapped
        right: look.outcomes({ success: E.Busy, failure: { Gone: E.Busy } }),
      }),
    });

    expectTypeOf<keyof Parameters<typeof look.outcomes>[0]["failure"]>().toEqualTypeOf<string>();
  });
});

describe("Turn R15, Compile R14: a schedule sends an event no value fills only if it has no fields", () => {
  it("a schedule sending an event with a required field", () => {
    const Timed = definition({ id: "types/endings/Timed", states: ["A"], events, internalEvents });

    machine(Timed, ({ S, E }) => ({
      default: S.A,
      states: {
        A: {
          schedules: {
            bad: { schedule: "1 second", send: E.Need }, // wrong: no value fills `n`
            ok: { schedule: "1 second", send: E.Busy },
          },
        },
      },
    }));
  });
});

const Events = definition({ id: "types/endings/Events", states: ["A"], events });

declare const event: (typeof Events)["Event"]["Type"];

describe("Compile R14: a definition's Event Schema decodes to its own events", () => {
  it("a misspelt tag on a decoded event", () => {
    expectTypeOf(event._tag).not.toEqualTypeOf<"Ad" | "Go">();
    expectTypeOf(event._tag).toEqualTypeOf<string>();

    void (event._tag === "Zzz"); // wrong: no such event
  });
});
