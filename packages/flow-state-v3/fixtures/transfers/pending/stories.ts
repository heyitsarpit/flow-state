import { Story } from "../../../src/host/testing/index.ts";
import { Customer } from "../machines/customer.ts";
import { Accounts } from "../server/accounts.ts";
import { AvailableFake, BalanceCard, balanceSetup, card, me } from "./balance.ts";

const cardStory = (id: string) =>
  Story.app(balanceSetup, { id, fixtures: [AvailableFake] })
    .ensure(me)
    .send(me, Customer.E.Choose({ account: "acct-1" }))
    .ensure(card);

/**
 * A card payment lands while the balance's refresh, asked before it, is on the wire: the older
 * answer loses, and the read that follows shows the balance after the payment.
 */
export const readAfterWrite = cardStory("transfers/read-after-write")
  .checkpoint("shown")
  .world(Accounts.balance.hold({ at: "response" }))
  .advance("11 seconds")
  .send(card, BalanceCard.E.Pay({ paymentId: "p-1", account: "acct-1", cents: 2500 }))
  .world(Accounts.balance.release())
  .checkpoint("settled");

/**
 * The customer switches to an account whose balance is on the wire: the card shows the last
 * account's balance, marked as a placeholder, until the new one lands.
 */
export const switchAccount = cardStory("transfers/switch-account")
  .world(Accounts.balance.hold())
  .send(me, Customer.E.Choose({ account: "acct-2" }))
  .checkpoint("switching")
  .world(Accounts.balance.release())
  .checkpoint("switched");
