import { Option, Schema } from "effect";
import { Empty, type Fixture, writeOf } from "./fixture.ts";
import { classifyWith, type OperationReference, type Row, row } from "./reference.ts";

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
  cancels: {},
  mayCancel: [
    { event: "IntentRead", from: "UNSURE", to: "PLACING" },
    { event: "OrderSeen", from: "UNSURE", to: "PAID" },
  ],
} satisfies Omit<OperationReference<keyof typeof events>, "keyFields">;

const operations = {
  pay: writeOf(ByIntent, pay),
  place: writeOf(Schema.Struct({ cartId: Schema.String }), {
    concurrency: "reject",
    releasesOnLeave: [],
    success: "Placed",
    failure: { NotSent: "PlaceRefused" },
    unknown: { event: "PlaceUnsure" },
    classify: classifyWith((tag) => tag === "OrderExists"),
    cancels: {},
    mayCancel: [],
  }),
  void: writeOf(ByIntent, {
    concurrency: "reject",
    releasesOnLeave: [],
    success: "Voided",
    failure: { AlreadyCaptured: "VoidRefused", NotSent: "Voided" },
    unknown: { event: "VoidUnsure" },
    classify: classifyWith(() => false),
    cancels: {},
    mayCancel: [],
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
  payRow("Leave", "any", "LEFT", [{ operation: "void", kind: "commit" }]),
  payRow("Confirmed", "LEFT", "same", [{ operation: "void", kind: "commit" }]),
  payRow("Confirmed", "IDLE", "PLACING", [{ operation: "place", kind: "commit" }]),
  payRow(
    "PlaceUnsure",
    "any",
    "same",
    [{ operation: "place", kind: "retry" }],
    retryable("place", true),
  ),
  payRow(
    "VoidUnsure",
    "any",
    "same",
    [{ operation: "void", kind: "retry" }],
    retryable("void", true),
  ),
  payRow(
    "VoidUnsure",
    "any",
    "same",
    [{ operation: "void", kind: "cancel" }],
    retryable("void", false),
  ),
  payRow("Confirmed", "PAYING", "PLACING", [{ operation: "place", kind: "commit" }]),
  payRow("RetryNow", "WAITING", "PAYING", [{ operation: "pay", kind: "commit" }]),
  payRow("IntentRead", "UNSURE", "PLACING", [
    { operation: "pay", kind: "cancel" },
    { operation: "place", kind: "commit" },
  ]),
  payRow(
    "IntentRead",
    "UNSURE",
    "PAYING",
    [{ operation: "pay", kind: "retry" }],
    retryable("pay", true),
  ),
  payRow("OrderSeen", "UNSURE", "PAID", [{ operation: "pay", kind: "cancel" }]),
] satisfies ReadonlyArray<Row<string, State, Write>>;

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
} satisfies Fixture;

const cellsEvents = { ...events, AbortPay: Empty };

const cellsPay = {
  ...pay,
  cancels: { AbortPay: "cancel" },
} satisfies Omit<OperationReference<keyof typeof cellsEvents>, "keyFields">;

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
  rows: [...payRows, payRow("AbortPay", "any", "same", [{ operation: "pay", kind: "cancel" }])],
} satisfies Fixture;
