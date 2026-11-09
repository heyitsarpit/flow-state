import { Schema } from "effect";
import type { Fixture } from "./fixture.ts";
import { classifyWith, type OperationReference } from "./reference.ts";

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
  Leave: Schema.Struct({}),
  CheckAgain: Schema.Struct({}),
  Done: Schema.Struct({}),
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

const pay = {
  attempts: true,
  concurrency: "reject",
  success: "Confirmed",
  failure: {
    CardDeclined: "Declined",
    Busy: "Busy",
    IntentBusy: "PayRefused",
    NotSent: "PayNotSent",
  },
  unknown: "PayUnsure",
  classify: classifyWith(
    (tag, fields, mayHaveApplied) => tag === "IntentBusy" && mayHaveApplied && capturable(fields),
  ),
  keyFields: ["intentId"],
  cancels: {},
} satisfies OperationReference;

const operations = {
  pay: { key: ByIntent, reference: pay },
  place: {
    key: Schema.Struct({ cartId: Schema.String }),
    reference: {
      attempts: true,
      concurrency: "reject",
      success: "Placed",
      failure: { NotSent: "PlaceRefused" },
      unknown: "PlaceUnsure",
      classify: classifyWith((tag) => tag === "OrderExists"),
      keyFields: ["cartId"],
      cancels: {},
    },
  },
  void: {
    key: ByIntent,
    reference: {
      attempts: true,
      concurrency: "reject",
      success: "Voided",
      failure: { AlreadyCaptured: "VoidRefused", NotSent: "Voided" },
      unknown: "VoidUnsure",
      classify: classifyWith(() => false),
      keyFields: ["intentId"],
      cancels: {},
    },
  },
} satisfies Fixture["operations"];

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
  input: Schema.Struct({}),
  operations,
} satisfies Fixture;

/**
 * Pay with one more root event, `AbortPay`, which cancels `pay`
 * (`prototypes/conformance/typed/cells.ts`).
 */
export const Cells = {
  name: "cells",
  machine: "Checkout/Pay",
  events: { ...events, AbortPay: Schema.Struct({}) },
  memory,
  input: Schema.Struct({}),
  operations: {
    ...operations,
    pay: { key: ByIntent, reference: { ...pay, cancels: { AbortPay: "cancel" } } },
  },
} satisfies Fixture;
