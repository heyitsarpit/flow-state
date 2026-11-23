import { Duration, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AuthSession } from "../../fixtures/sign-in/machines/session.ts";
import { TrustedDevice } from "../../fixtures/sign-in/machines/trusted-device.ts";
import { setUsername } from "../../fixtures/sign-in/operations/writes.ts";
import { Customer } from "../../fixtures/transfers/machines/customer.ts";
import { fromAccount, StandingOrder } from "../../fixtures/transfers/machines/standing-order.ts";
import { balance } from "../../fixtures/transfers/operations/reads.ts";
import { definition, Diagnostic, Flow, FlowError, machine } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";

// FLOW_STATE_ALLOW_UNKNOWN: a valid construction value, taken apart one field at a time.
type Sample = unknown;

// One corruption of a shape: what it did, and whether the result may still be valid (a dropped key
// may have been optional).
type Corrupt = { readonly how: string; readonly value: Sample; readonly mayPass: boolean };

// RETURN_TYPE: a type guard states the type it narrows to.
const isRecordLike = (x: Sample): x is Record<string, Sample> =>
  Predicate.isObject(x) || Predicate.isFunction(x);

const wrongFor = (value: Sample) => (Predicate.isString(value) ? 7 : "x");

// A shape as plain fields: a callable token's own fields copied into a record.
const fieldsOf = (value: Record<string, Sample>) => ({ ...value });

// RETURN_TYPE: a type guard narrows a sample to a list, whose items stay samples.
const isItems = (value: Sample): value is ReadonlyArray<Sample> => Array.isArray(value);

// Every corruption of one field of `value`, and of one field of its `ending`, plus the whole value
// as null and as a number.
// RETURN_TYPE: recursive through a shape's `ending`.
const corruptionsOf = (value: Sample): ReadonlyArray<Corrupt> => {
  const whole: Array<Corrupt> = [
    { how: "null", value: null, mayPass: false },
    { how: "a number", value: 5, mayPass: false },
  ];

  if (isItems(value))
    return [
      ...whole,
      ...value.flatMap((_, i) => [
        { how: `[${i}] wrong`, value: value.map((x, j) => (i === j ? "x" : x)), mayPass: false },
        { how: `[${i}] null`, value: value.map((x, j) => (i === j ? null : x)), mayPass: false },
      ]),
    ];

  if (!isRecordLike(value)) return whole;

  const fields = fieldsOf(value);

  return [
    ...whole,
    ...Object.keys(fields).flatMap((key) => {
      const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== key));
      const inner = fields[key];

      return [
        { how: `${key} dropped`, value: rest, mayPass: true },
        { how: `${key} wrong`, value: { ...fields, [key]: wrongFor(inner) }, mayPass: false },
        // A field already null is left as it was, so its null is no corruption.
        { how: `${key} null`, value: { ...fields, [key]: null }, mayPass: inner === null },
        ...(key === "ending" && isRecordLike(inner)
          ? corruptionsOf(inner).map((c) => ({
              how: `ending.${c.how}`,
              value: { ...fields, ending: c.value },
              mayPass: c.mayPass,
            }))
          : []),
      ];
    }),
  ];
};

// How one construction of a corrupt shape went: refused with a listed code, accepted, or thrown raw.
const outcomeOf = (construct: () => unknown) => {
  try {
    construct();

    return "accepted";
  } catch (error) {
    return error instanceof FlowError && error.diagnostics.every((d) => Schema.is(Diagnostic)(d))
      ? "refused"
      : `raw: ${String(error)}`;
  }
};

// One slot of a construction, with the valid shapes the fixtures put there.
type Slot = {
  readonly name: string;
  // Whether a number is itself valid here (a delay in ms).
  readonly numbersValid: boolean;
  readonly samples: ReadonlyArray<Sample>;
  readonly construct: (value: Sample) => unknown;
};

const order = (body: (tokens: typeof StandingOrder) => Sample) =>
  machine(StandingOrder, () => loose(body(StandingOrder)));

// The standing order with one schedule t declared, for the schedule shapes.
const Scheduled = definition({
  id: "Corrupt/Scheduled",
  states: ["DRAFT", "CHECKING", "SCHEDULED", "PAUSED"],
  events: {
    Plan: {
      first: Schema.DateFromString,
      cents: Schema.Number,
      memo: Schema.optional(Schema.String),
    },
    Pause: { until: Schema.NullOr(Schema.DateFromString) },
    Resume: {},
  },
  schedules: { t: {} },
});

// A write and a read bound the way the fixtures' operations bind them.
const sessionSave = setUsername.outcomes({
  success: AuthSession.E.Saved.from((v) => ({ handle: v.handle })),
  failure: { Taken: AuthSession.E.Refused.from((e) => ({ handle: e.handle })) },
  notSent: AuthSession.E.NotSaved.from((e) => ({ why: e.why })),
  unknown: AuthSession.E.SaveUnsure,
});

const orderBalance = balance.outcomes({
  success: StandingOrder.E.BalanceRead.from((v) => ({ cents: v.cents })),
  failure: {
    NoAnswer: StandingOrder.E.BalanceFailed,
    Defect: StandingOrder.E.BalanceFailed,
    Interrupted: StandingOrder.E.BalanceFailed,
  },
});

const scheduled = (body: (tokens: typeof Scheduled) => Sample) =>
  machine(Scheduled, () => loose(body(Scheduled)));

const SLOTS: ReadonlyArray<Slot> = [
  {
    numbersValid: false,
    name: "a bound",
    samples: [sessionSave, orderBalance],
    construct: (value) =>
      definition(
        loose({
          id: "Corrupt/Bound",
          states: ["A"],
          events: {},
          internalEvents: {
            Saved: { handle: Schema.String },
            Refused: { handle: Schema.String },
            NotSaved: { why: Schema.String },
            SaveUnsure: Flow.uncertain({}),
            BalanceRead: { cents: Schema.Number },
            BalanceFailed: {},
          },
          operations: () => ({ op: value }),
        }),
      ),
  },
  {
    numbersValid: false,
    name: "a reaction's ending",
    samples: [
      StandingOrder.E.AccountChanged,
      StandingOrder.E.AccountChanged.from((account: typeof StandingOrder.M.account.Type) => ({
        account,
      })),
    ],
    construct: (value) =>
      machine(StandingOrder, ({ S, C }) =>
        loose({
          default: S.DRAFT,
          onContext: [C.customer.change(loose({ event: value }))],
          on: { AccountChanged: {} },
        }),
      ),
  },
  {
    numbersValid: false,
    name: "a schedule's send",
    samples: [Scheduled.E.Resume],
    construct: (value) =>
      scheduled(({ S }) => ({
        default: S.DRAFT,
        states: { SCHEDULED: { schedules: { t: { schedule: "1 day", send: value } } } },
      })),
  },
  {
    name: "a schedule's delay",
    numbersValid: true,
    samples: ["7 days", { days: 7 }, [1, 0], 5, Duration.seconds(5)],
    construct: (value) =>
      scheduled(({ S, E }) => ({
        default: S.DRAFT,
        states: { SCHEDULED: { schedules: { t: { schedule: value, send: E.Resume } } } },
      })),
  },
  {
    numbersValid: false,
    name: "a schedule's armOn element",
    samples: [Flow.entry],
    construct: (value) =>
      scheduled(({ S, E }) => ({
        default: S.DRAFT,
        states: {
          SCHEDULED: { schedules: { t: { schedule: "1 day", send: E.Resume, armOn: [value] } } },
        },
      })),
  },
  {
    numbersValid: false,
    name: "a handler",
    samples: [
      StandingOrder.S.SCHEDULED,
      {
        target: StandingOrder.S.CHECKING,
        guard: [() => true],
        updateMemory: () => ({}),
        actions: [StandingOrder.O.balance.lookup(fromAccount)],
      },
    ],
    construct: (value) => order(({ S }) => ({ default: S.DRAFT, on: { Plan: value } })),
  },
  {
    numbersValid: false,
    name: "a history target",
    samples: [TrustedDevice.S.TRUSTED.history],
    construct: (value) =>
      machine(TrustedDevice, ({ S }) =>
        loose({
          default: S.UNTRUSTED,
          on: { Trust: value },
          states: { TRUSTED: { default: S.TRUSTED.FRESH } },
        }),
      ),
  },
  {
    numbersValid: false,
    name: "a guard",
    samples: [AuthSession.O.save.idle(() => ({ email: "" }))],
    construct: (value) =>
      machine(AuthSession, ({ S }) =>
        loose({ default: S.SIGNED_OUT, on: { Retry: { guard: [value] } } }),
      ),
  },
  {
    numbersValid: false,
    name: "an action",
    samples: [StandingOrder.O.balance.lookup(fromAccount)],
    construct: (value) =>
      order(({ S }) => ({ default: S.DRAFT, on: { Plan: { actions: [value] } } })),
  },
  {
    numbersValid: false,
    name: "a context slot",
    samples: [Flow.context(Customer.M.account)],
    construct: (value) =>
      definition(
        loose({ id: "Corrupt/Context", states: ["A"], events: {}, context: { c: value } }),
      ),
  },
  {
    numbersValid: false,
    name: "a memory field",
    samples: [
      Flow.input(Schema.String),
      Flow.initial(Schema.String, ""),
      Flow.initial(Schema.NullOr(Schema.DateFromString), null),
      Flow.initial(Schema.Number, 0),
      Schema.optional(Schema.String),
    ],
    construct: (value) =>
      definition(loose({ id: "Corrupt/Memory", states: ["A"], events: {}, memory: { f: value } })),
  },
  {
    numbersValid: false,
    name: "an event's fields",
    samples: [
      { first: Schema.DateFromString, cents: Schema.Number, memo: Schema.optional(Schema.String) },
      Flow.uncertain({ at: Schema.String }),
    ],
    construct: (value) =>
      definition(loose({ id: "Corrupt/Event", states: ["A"], events: { X: value } })),
  },
  {
    numbersValid: false,
    name: "a payload",
    samples: [
      { first: Schema.decodeSync(Schema.DateFromString)("2026-12-01T00:00:00.000Z"), cents: 1 },
    ],
    construct: (value) => StandingOrder.E.Plan(loose(value)),
  },
];

describe("every construction shape the fixtures use, corrupted one field at a time (Compile R2, R4; Diagnostics R1)", () => {
  for (const slot of SLOTS)
    it(`Compile R2, R4: ${slot.name}, corrupted, is refused with a FlowError of a listed code, never thrown raw`, () => {
      const outcomes = slot.samples.flatMap((sample) => {
        expect(outcomeOf(() => slot.construct(sample))).toBe("accepted");

        return corruptionsOf(sample)
          .filter((c) => !(slot.numbersValid && c.how === "a number"))
          .map((c) => ({
            how: c.how,
            mayPass: c.mayPass,
            outcome: outcomeOf(() => slot.construct(c.value)),
          }));
      });

      expect(
        outcomes
          .filter((o) => o.outcome.startsWith("raw") || (!o.mayPass && o.outcome === "accepted"))
          .map((o) => `${o.how}: ${o.outcome}`),
      ).toEqual([]);
    });

  it("Compile R14: E.X of a field-less event refuses 5, a string, true, an array and undefined", () => {
    for (const payload of [5, "x", true, [], undefined])
      expect(outcomeOf(() => StandingOrder.E.Resume(loose(payload)))).toBe("refused");

    expect(outcomeOf(() => StandingOrder.E.Resume())).toBe("accepted");
  });
});
