import { Effect, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  actorRef,
  definition,
  type Ending,
  Flow,
  machine,
  type Machine,
  type ReadEndings,
  resource,
  send,
  transaction,
  type UnknownEnding,
  type WriteEndings,
} from "../../src/index.ts";

// Each wrong line is refused under `@ts-expect-error`; beside it the correct use of the same
// parameter compiles and is asserted exactly, so no line fails because a type became `never`.

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
  it("success takes the commit's value, each failure its error, unknown an uncertain event", () => {
    expectTypeOf<PayEndings>().toEqualTypeOf<WriteEndings<Declined | Busy, Receipt>>();
    expectTypeOf<PayEndings["success"]>().toEqualTypeOf<Ending<Receipt>>();
    expectTypeOf<PayEndings["failure"]["Declined"]>().toEqualTypeOf<Ending<Declined>>();
    expectTypeOf<PayEndings["unknown"]>().toEqualTypeOf<UnknownEnding>();
  });

  it("a success token whose payload no value fills", () => {
    expectTypeOf<PayEndings["success"]>().toEqualTypeOf<Ending<Receipt>>();

    definition({
      id: "types/endings/A",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        p: pay.outcomes({
          // @ts-expect-error Compile R9: Got needs { cents }, and a bare token supplies nothing
          success: E.Got,
          failure: { Declined: E.Dec.from((e) => ({ code: e.code })), Busy: E.Busy },
          unknown: E.Unsure,
        }),
        right: pay.outcomes({
          success: E.Got.from((v) => ({ cents: v.receipt })),
          failure: { Declined: E.Busy, Busy: E.Busy },
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
          // @ts-expect-error Compile R9: Ok is a certain event
          unknown: E.Ok,
        }),
        filled: pay.outcomes({
          success: E.Busy,
          failure: { Declined: E.Busy, Busy: E.Busy },
          // @ts-expect-error Compile R9: no value fills `why`
          unknown: E.Uncertain,
        }),
      }),
    });

    expectTypeOf<PayEndings["unknown"]>().toEqualTypeOf<UnknownEnding>();
  });

  it("a mapper whose parameter is not the commit's value", () => {
    expectTypeOf<PayEndings["success"]>().toEqualTypeOf<Ending<Receipt>>();
    expectTypeOf<PayEndings["failure"]["Declined"]>().toEqualTypeOf<Ending<Declined>>();

    definition({
      id: "types/endings/C",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        p: pay.outcomes({
          // @ts-expect-error Compile R9: a Receipt has no receiptt
          success: E.Done.from((v: { receiptt: number }) => ({ receipt: v.receiptt })),
          failure: {
            // @ts-expect-error Compile R9: a Declined has no zzz
            Declined: E.Dec.from((e: { readonly zzz: string }) => ({ code: e.zzz })),
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

    expectTypeOf<PayEndings["success"]>().toEqualTypeOf<Ending<Receipt>>();

    definition({
      id: "types/endings/Extra",
      states: ["A"],
      events,
      internalEvents,
      operations: ({ E }) => ({
        p: pay.outcomes({
          // @ts-expect-error Compile R14: reciept is no field of Done
          success: E.Done.from(() => ({ receipt: 1, reciept: 2 })),
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
              // @ts-expect-error Compile R14: cnets is no field of Credit
              Target.E.Credit.from(() => ({ cents: 1, cnets: 2 })),
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
            expectTypeOf(v).toEqualTypeOf<Receipt>();

            return { receipt: v.receipt };
          }),
          failure: {
            Declined: E.Dec.from((e) => {
              expectTypeOf(e).toEqualTypeOf<Declined>();

              return { code: e.code };
            }),
            Busy: E.Busy,
          },
          unknown: E.Unsure,
        }),
      }),
    });
  });

  it("a write's failures are exhaustive", () => {
    expectTypeOf<Parameters<typeof pay.outcomes>[0]>().toEqualTypeOf<
      WriteEndings<Declined | Busy, Receipt>
    >();

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
        // @ts-expect-error Reads R1: Gon is no failure tag of the lookup
        typo: look.outcomes({ success: E.Busy, failure: { Gon: E.Busy } }),
        // @ts-expect-error Reads R1: Gone is unmapped
        none: look.outcomes({ success: E.Busy, failure: {} }),
        right: look.outcomes({ success: E.Busy, failure: { Gone: E.Busy } }),
      }),
    });

    expectTypeOf<Parameters<typeof look.outcomes>[0]>().toEqualTypeOf<
      ReadEndings<Gone, { readonly cents: number }>
    >();
  });
});

describe("Turn R15, Compile R14: a schedule sends an event no value fills only if it has no fields", () => {
  it("a schedule sending an event with a required field", () => {
    const Timed = definition({
      id: "types/endings/Timed",
      states: ["A"],
      events,
      internalEvents,
      schedules: { ok: {}, bad: {} },
    });

    expectTypeOf(
      machine(Timed, ({ S, E }) => ({
        default: S.A,
        states: { A: { schedules: { ok: { schedule: "1 second", send: E.Busy } } } },
      })),
    ).toEqualTypeOf<Machine<typeof Timed>>();

    machine(Timed, ({ S, E }) => ({
      default: S.A,
      states: {
        A: {
          schedules: {
            // @ts-expect-error Turn R15: no value fills `n`
            bad: { schedule: "1 second", send: E.Need },
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
    expectTypeOf(event._tag).toEqualTypeOf<"Ad" | "Go">();

    // @ts-expect-error Compile R14: Zzz is no event of the definition
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- the wrong line the tag union refuses
    void (event._tag === "Zzz");
  });
});
