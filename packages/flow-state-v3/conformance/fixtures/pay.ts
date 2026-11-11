import { Option, Schema } from "effect";
import { Empty, type Fixture, writeOf } from "./fixture.ts";
import { guarded, type Handlers, indexed, inStates, to } from "./handlers.ts";
import { claimed, classifyWith, type OperationReference, type Row, row } from "./reference.ts";

const Address = Schema.Struct({
  name: Schema.String,
  line1: Schema.String,
  postcode: Schema.String,
  email: Schema.String,
});

const Receipt = Schema.Struct({
  orderId: Schema.String,
  afterUnsure: Schema.Boolean,
  alreadyPlaced: Schema.Boolean,
});

const events = {
  CardChosen: Schema.Struct({ paymentMethodId: Schema.String }),
  PayRequested: Schema.Struct({ paymentMethodId: Schema.String }),
  Leave: Empty,
  CheckAgain: Empty,
  Done: Empty,
  Start: Schema.Struct({ cartId: Schema.String, intentId: Schema.String }),
};

const memory = Schema.Struct({
  cartId: Schema.String,
  intentId: Schema.String,
  totalCents: Schema.Number,
  address: Address,
  addressDraft: Address,
  paymentMethodId: Schema.NullOr(Schema.String),
  clientSecret: Schema.NullOr(Schema.String),
  busyTries: Schema.Number,
  retryInMs: Schema.Number,
  afterUnsure: Schema.Boolean,
  authorized: Schema.Boolean,
  receipt: Schema.NullOr(Receipt),
  notice: Schema.String,
});

const ByIntent = Schema.Struct({ intentId: Schema.String });

const capturable = (fields: Schema.JsonObject) =>
  fields["status"] === "requires_capture" || fields["status"] === "succeeded";

const states = [
  "IDLE",
  "CARD",
  "PAYING",
  "WAITING",
  "UNSURE",
  "PLACING",
  "PAID",
  "STUCK",
  "LEFT",
] as const;

const pay = {
  concurrency: "reject",
  releasesOnLeave: [],
  success: "Confirmed",
  failure: {
    CardDeclined: "Declined",
    Busy: "Busy",
    IntentBusy: "PayRefused",
    NotSent: "PayNotSent",
  },
  unknown: { event: "PayUnsure" },
  classify: classifyWith(
    (tag, fields, mayHaveApplied) => tag === "IntentBusy" && mayHaveApplied && capturable(fields),
  ),
} satisfies Omit<OperationReference, "keyFields">;

const operations = {
  pay: writeOf(ByIntent, pay),
  place: writeOf(Schema.Struct({ cartId: Schema.String }), {
    concurrency: "reject",
    releasesOnLeave: [],
    success: "Placed",
    failure: { NotSent: "PlaceRefused" },
    unknown: { event: "PlaceUnsure" },
    classify: classifyWith((tag) => tag === "OrderExists"),
  }),
  void: writeOf(ByIntent, {
    concurrency: "reject",
    releasesOnLeave: [],
    success: "Voided",
    failure: { AlreadyCaptured: "VoidRefused", NotSent: "Voided" },
    unknown: { event: "VoidUnsure" },
    classify: classifyWith(() => false),
  }),
} satisfies Fixture["operations"];

type State = (typeof states)[number];

type Write = keyof typeof operations;

const retryable = (operation: Write, passes: boolean) =>
  Option.some({ operation, times: 3, passes });

const payRow = row<string, State, Write>;

const payRows = [
  payRow("PayRequested", "PAYING", "same", [{ operation: "pay", kind: "commit" }]),
  payRow("PayRequested", "any", "PAYING", [{ operation: "pay", kind: "commit" }]),
  claimed(payRow("Leave", "any", "LEFT", [{ operation: "void", kind: "commit" }])),
  claimed(payRow("Confirmed", "LEFT", "same", [{ operation: "void", kind: "commit" }])),
  payRow("Confirmed", "IDLE", "PLACING", [{ operation: "place", kind: "commit" }]),
  payRow(
    "PlaceUnsure",
    "any",
    "same",
    [{ operation: "place", kind: "retry", keyed: false }],
    retryable("place", true),
  ),
  payRow(
    "VoidUnsure",
    "any",
    "same",
    [{ operation: "void", kind: "retry", keyed: false }],
    retryable("void", true),
  ),
  payRow(
    "VoidUnsure",
    "any",
    "same",
    [{ operation: "void", kind: "cancel", keyed: false }],
    retryable("void", false),
  ),
  payRow("Confirmed", "PAYING", "PLACING", [{ operation: "place", kind: "commit" }]),
  payRow("RetryNow", "WAITING", "PAYING", [{ operation: "pay", kind: "commit" }]),
  payRow("IntentRead", "UNSURE", "PLACING", [
    { operation: "pay", kind: "cancel", keyed: true },
    { operation: "place", kind: "commit" },
  ]),
  payRow(
    "IntentRead",
    "UNSURE",
    "PAYING",
    [{ operation: "pay", kind: "retry", keyed: true }],
    retryable("pay", true),
  ),
  payRow("OrderSeen", "UNSURE", "PAID", [{ operation: "pay", kind: "cancel", keyed: true }]),
] satisfies ReadonlyArray<Row<string, State, Write>>;

const stay = to<State>("stay");

/**
 * Pay's handler table (`prototypes/conformance/typed/pay.ts`), by hand from its source:
 * `capturable`, the busy count, `retryable`, `idle` and the payload checks are opaque guards.
 */
const payHandlers: Handlers<State> = {
  initial: "IDLE",
  root: {
    PayRequested: [inStates(["PAYING"], stay), to("PAYING")],
    CartLoaded: [stay],
    CardChosen: [stay],
    Leave: [guarded(to("LEFT")), to("LEFT")],
    Confirmed: [
      inStates(["LEFT"], guarded(stay)),
      inStates(["IDLE"], guarded(to("PLACING"))),
      stay,
    ],
    PayUnsure: [inStates(["LEFT"], stay), to("UNSURE")],
    Declined: [stay],
    Busy: [stay],
    PayRefused: [stay],
    PayNotSent: [stay],
    IntentRead: [stay],
    IntentReadFailed: [stay],
    OrderSeen: [stay],
    CheckTick: [stay],
    Placed: [to("PAID")],
    PlaceRefused: [stay],
    PlaceUnsure: [guarded(stay), to("STUCK")],
    Voided: [stay],
    VoidRefused: [stay],
    VoidUnsure: [guarded(stay), stay],
  },
  states: {
    IDLE: { Start: [to("CARD")] },
    PAYING: {
      CheckTick: [stay],
      Confirmed: [indexed(1, guarded(to("PLACING"))), indexed(2, to("CARD"))],
      Declined: [to("CARD")],
      Busy: [guarded(to("WAITING")), to("CARD")],
      PayRefused: [to("CARD")],
      PayNotSent: [guarded(stay), to("CARD")],
      PayUnsure: [to("UNSURE")],
    },
    WAITING: { RetryNow: [guarded(to("PAYING")), stay] },
    UNSURE: {
      CheckTick: [stay],
      IntentRead: [guarded(to("PLACING")), indexed(2, guarded(to("PAYING"))), indexed(3, stay)],
      OrderSeen: [guarded(to("PAID")), stay],
      PayUnsure: [stay],
    },
    PAID: { Start: [to("CARD")], Done: [to("IDLE")] },
    STUCK: { CheckAgain: [to("UNSURE")] },
    LEFT: { Start: [to("CARD")] },
  },
  scheduled: ["CheckTick", "RetryNow"],
};

/**
 * The typed Pay machine, `Checkout/Pay` (`prototypes/conformance/typed/pay.ts`).
 *
 * **Details**
 *
 * Only its writes (`pay`, `place`, `void`) are operations here; its reads (`intent`, `order`)
 * have no Attempts and no rows. It takes no input: `Start` carries the cart.
 */
export const Pay = {
  name: "pay",
  machine: "Checkout/Pay",
  events,
  memory,
  input: Empty,
  states,
  operations,
  rows: payRows,
  handlers: payHandlers,
} satisfies Fixture;

const cellsEvents = { ...events, AbortPay: Empty };

const cellsPay = {
  ...pay,
} satisfies Omit<OperationReference, "keyFields">;

/**
 * Pay with one more root event, `AbortPay`, which cancels `pay`
 * (`prototypes/conformance/typed/cells.ts`).
 */
export const Cells = {
  name: "cells",
  machine: "Checkout/Pay",
  events: cellsEvents,
  memory,
  input: Empty,
  states,
  operations: {
    ...operations,
    pay: writeOf(ByIntent, cellsPay),
  },
  rows: [
    ...payRows,
    payRow("AbortPay", "any", "same", [{ operation: "pay", kind: "cancel", keyed: true }]),
  ],
  handlers: { ...payHandlers, root: { ...payHandlers.root, AbortPay: [stay] } },
} satisfies Fixture;
