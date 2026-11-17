import { Fake } from "../../../src/host/testing/index.ts";
import { accountOf, mainCustomer, orderOf, rent } from "../app.ts";
import { Bank } from "../server/bank.ts";
import { dateAt } from "./edges.ts";
import { grownStory, planRent, plannedStory } from "./usual.ts";

const ACCOUNTS = Array.from({ length: 64 }, (_, n) => n);

const send = (n: number) => ({ _tag: "Send", transferId: `t${String(n)}`, cents: 1 }) as const;

/**
 * 64 accounts each send a transfer; the sixth is forgotten; the tab reloads twice.
 */
export const manyAccounts = ACCOUNTS.reduce(
  (story, n) => story.ensure(accountOf(n)).send(accountOf(n), send(n)),
  grownStory("transfers/stress-many-accounts"),
)
  .dispose(accountOf(5), { how: "forget" })
  .reload()
  .reload()
  .checkpoint("end");

/**
 * 64 accounts each send a transfer whose answer is held when the tab reloads; it reloads again.
 */
export const owedAtBoot = ACCOUNTS.reduce(
  (story, n) =>
    story
      .ensure(accountOf(n))
      .world(Bank.transfer.hold({ at: "response" }))
      .send(accountOf(n), send(n)),
  grownStory("transfers/stress-owed-at-boot"),
)
  .reload()
  .checkpoint("first boot")
  .reload()
  .checkpoint("end");

const ORDERS = Array.from({ length: 32 }, (_, n) => n);

const DAY_MS = 86_400_000;

/**
 * The `n`th order's first payment: `n` days after the epoch.
 */
export const firstOf = (n: number) => dateAt(n * DAY_MS);

/**
 * One customer and 32 standing orders bound to them (S2 × 32, a first guess until the bench
 * re-measures it); the customer chooses an account, each order is planned for its own date, and
 * the tab reloads twice (L4).
 */
export const manyOrders = ORDERS.reduce(
  (story, n) =>
    story.send(orderOf(n), {
      _tag: "Plan",
      first: firstOf(n),
      cents: n,
      memo: `order ${String(n)}`,
    }),
  ORDERS.reduce(
    (story, n) => story.ensure(orderOf(n)),
    plannedStory("transfers/stress-many-orders").ensure(mainCustomer),
  ).send(mainCustomer, { _tag: "Choose", account: "acct-1" }),
)
  .reload()
  .reload()
  .checkpoint("end");

/**
 * The network drops while the rent is planned, so its balance check is lost and the plan goes
 * back to the draft (L3); online again, the same plan is scheduled.
 */
export const orderOffline = plannedStory("transfers/order-offline")
  .ensure(mainCustomer)
  .ensure(rent)
  .send(mainCustomer, { _tag: "Choose", account: "acct-1" })
  .world(Fake.network.offline())
  .send(rent, planRent)
  .checkpoint("unavailable")
  .world(Fake.network.online())
  .send(rent, planRent)
  .checkpoint("scheduled");
