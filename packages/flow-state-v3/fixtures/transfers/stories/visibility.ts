import { Duration } from "effect";
import { Fake, Story } from "../../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../../src/index.ts";
import { bankPlannedQuietSetup, mainCustomer, orderOf, rent } from "../app.ts";
import { Customer } from "../machines/customer.ts";
import { StandingOrder } from "../machines/standing-order.ts";
import { AccountsFake, BankFake } from "../server/layer.ts";
import { firstOf } from "./load.ts";
import { planRent, RENT_PAUSED_UNTIL } from "./usual.ts";

const INTERVAL_MS = Duration.toMillis(RuntimeDefaults.captureInterval);

/**
 * The bank app with standing orders at the default capture interval, over its port fakes, with
 * the customer's account chosen and the rent open: every Story of a hidden page starts here.
 */
export const quietStory = (id: string) =>
  Story.app(bankPlannedQuietSetup, { id, fixtures: [BankFake, AccountsFake] })
    .ensure(mainCustomer)
    .ensure(rent)
    .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
    .advance(RuntimeDefaults.captureInterval)
    .checkpoint("opened");

/**
 * The rent is planned and waits for the capture interval; the page hides and the plan is written
 * at once; shown again, a pause waits for the interval; a reload after the hide's batch restores
 * the plan.
 */
export const hideFlush = quietStory("transfers/hide-flush")
  .send(rent, planRent)
  .checkpoint("waiting")
  .hide()
  .checkpoint("hidden")
  .show()
  .send(rent, StandingOrder.E.Pause({ until: RENT_PAUSED_UNTIL }))
  .checkpoint("shown")
  .reload({ reattach: false })
  .checkpoint("reloaded");

/**
 * 32 standing orders under one customer are planned (S2 × 32), then the page hides: one batch
 * carries every order's record.
 */
export const hideManyOrders = Array.from({ length: 32 }, (_, n) => n)
  .reduce(
    (story, n) =>
      story
        .ensure(orderOf(n))
        .send(
          orderOf(n),
          StandingOrder.E.Plan({ first: firstOf(n), cents: n, memo: `order ${String(n)}` }),
        ),
    quietStory("transfers/hide-many-orders"),
  )
  .checkpoint("planned")
  .hide()
  .checkpoint("hidden");

/**
 * Edges of the page's visibility: a hide with nothing marked, a second hide, a show with no hide
 * before it.
 */
export const hideEdges = quietStory("transfers/hide-edges")
  .show()
  .checkpoint("shown unhidden")
  .hide()
  .checkpoint("hidden idle")
  .send(rent, planRent)
  .checkpoint("planned hidden")
  .hide()
  .checkpoint("hidden twice");

/**
 * A batch is held at the store; the rent is paused, the page hides, and nothing more is issued
 * until the held batch answers; then the pause goes at once.
 */
export const hideWhileHeld = quietStory("transfers/hide-while-held")
  .world(Fake.storage.hold())
  .send(rent, planRent)
  .advance(RuntimeDefaults.captureInterval)
  .checkpoint("held")
  .send(rent, StandingOrder.E.Pause({ until: RENT_PAUSED_UNTIL }))
  .hide()
  .checkpoint("hidden while held")
  .world(Fake.storage.release())
  .checkpoint("released");

/**
 * The page hides, and the store refuses the next batch: the customer's switch to savings is
 * refused at once, and tried again one capture interval later, not in a loop.
 */
export const hiddenRefusing = quietStory("transfers/hidden-refusing")
  .hide()
  .world(Fake.storage.refuse())
  .send(mainCustomer, Customer.E.Choose({ account: "acct-2" }))
  .checkpoint("refused once")
  .advance(Duration.millis(INTERVAL_MS - 1))
  .checkpoint("before the retry")
  .advance(Duration.millis(1))
  .checkpoint("retried");

/**
 * The hidden-page Stories, for the manifest.
 */
export const visibilityStories = {
  hideFlush,
  hideManyOrders,
  hideEdges,
  hideWhileHeld,
  hiddenRefusing,
};
