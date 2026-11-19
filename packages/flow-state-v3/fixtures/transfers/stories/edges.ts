import { Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { cafeComposed, cafeDecomposed, account, mainCustomer, orderOf } from "../app.ts";
import { Customer } from "../machines/customer.ts";
import { StandingOrder } from "../machines/standing-order.ts";
import { Transfers } from "../machines/transfers.ts";
import { bankStory, grownStory, plannedStory } from "./usual.ts";

/**
 * The key of a wire held on the main account, an operation an earlier release of the app had.
 */
export const RETIRED_WIRE = 'lane/Bank/Transfers/acct-1|wire|{"wireId":"w1"}';

const retiredWire =
  '{"attempt":"att-0-1","displaced":[],"format":3,"inFlight":false,' +
  '"input":{"cents":500,"wireId":"w1"},"machine":"Bank/Transfers","name":"acct-1",' +
  '"operation":"wire","queue":[],"retryCount":0}';

/**
 * An earlier release sent wires, an operation and contract this one no longer has, and left one
 * held on the main account; the customer closes the account, so the app forgets it, and the tab
 * reloads.
 */
export const forgottenRetiredWire = bankStory("transfers/forgotten-retired-wire")
  .world(Fake.storage.put(RETIRED_WIRE, retiredWire))
  .reload()
  .checkpoint("booted")
  .ensure(account)
  .dispose(account, { how: "forget" })
  .checkpoint("forgotten")
  .reload()
  .checkpoint("reloaded");

/**
 * A date at milliseconds from the epoch, decoded by its Schema.
 */
export const dateAt = Schema.decodeSync(Schema.DateFromMillis);

// A transfer id well past any a real bank issues.
const LONG_ID = 100_000;

/**
 * Transfers of 0, -5 and 2^53 cents.
 */
export const centsEdges = grownStory("transfers/cents-edges")
  .ensure(account)
  .send(account, Transfers.E.Send({ transferId: "t-zero", cents: 0 }))
  .send(account, Transfers.E.Send({ transferId: "t-negative", cents: -5 }))
  .send(account, Transfers.E.Send({ transferId: "t-max", cents: 2 ** 53 }))
  .checkpoint("sent");

/**
 * A transfer id of 100,000 characters, the transfer's key.
 */
export const longId = grownStory("transfers/long-id")
  .ensure(account)
  .send(account, Transfers.E.Send({ transferId: "t".repeat(LONG_ID), cents: 1 }))
  .checkpoint("sent");

/**
 * Two accounts named "café", one composed and one decomposed, each send a transfer.
 */
export const twoSpellings = grownStory("transfers/two-spellings")
  .ensure(cafeComposed)
  .ensure(cafeDecomposed)
  .send(cafeComposed, Transfers.E.Send({ transferId: "t1", cents: 1 }))
  .send(cafeDecomposed, Transfers.E.Send({ transferId: "t1", cents: 1 }))
  .checkpoint("both");

/**
 * The earliest date a `Date` holds, 8.64e15 ms before the epoch.
 */
export const EARLIEST = dateAt(-8.64e15);

/**
 * The latest date a `Date` holds, 8.64e15 ms after the epoch.
 */
export const LATEST = dateAt(8.64e15);

/**
 * The epoch.
 */
export const EPOCH = dateAt(0);

/**
 * Three standing orders planned at the epoch with no memo, at the latest date with a memo of
 * `undefined`, and at the earliest date with an empty memo; one is paused with no end and one until
 * the latest date; the tab reloads.
 */
export const orderDateEdges = plannedStory("transfers/order-date-edges")
  .ensure(mainCustomer)
  .ensure(orderOf(0))
  .ensure(orderOf(1))
  .ensure(orderOf(2))
  .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
  .send(orderOf(0), StandingOrder.E.Plan({ first: EPOCH, cents: 0 }))
  .send(orderOf(1), StandingOrder.E.Plan({ first: LATEST, cents: 1, memo: undefined }))
  .send(orderOf(2), StandingOrder.E.Plan({ first: EARLIEST, cents: 10_000, memo: "" }))
  .send(orderOf(0), StandingOrder.E.Pause({ until: null }))
  .send(orderOf(1), StandingOrder.E.Pause({ until: LATEST }))
  .checkpoint("planned")
  .reload()
  .checkpoint("reloaded");
