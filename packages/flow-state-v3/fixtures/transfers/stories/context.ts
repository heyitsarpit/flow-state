import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { bankSwitchingSetup, mainCustomer, switcher } from "../app.ts";
import { RECENT } from "../machines/account-switcher.ts";
import { Customer } from "../machines/customer.ts";
import { Bank } from "../server/bank.ts";
import { AccountsFake, BankFake } from "../server/layer.ts";

/**
 * The bank with the header's account switcher over its port fakes, with no steps yet.
 */
export const switcherStory = (id: string) =>
  Story.app(bankSwitchingSetup, { id, fixtures: [BankFake, AccountsFake] });

const choose = (account: string) => Customer.E.Choose({ account });

/**
 * The customer chooses their current account, savings, current again and a joint account: the
 * switcher lists each once, newest first.
 */
export const switcherRecent = switcherStory("transfers/switcher-recent")
  .ensure(mainCustomer)
  .ensure(switcher)
  .checkpoint("none")
  .send(mainCustomer, choose("acct-1"))
  .send(mainCustomer, choose("acct-2"))
  .send(mainCustomer, choose("acct-1"))
  .send(mainCustomer, choose("joint-1"))
  .checkpoint("chosen");

/**
 * No account (E1) is never listed; an account id of 10,000 characters (E3) is; RECENT + 2
 * distinct accounts (E4, at and past the count) leave the newest RECENT.
 */
export const switcherEdges = Array.from({ length: RECENT + 2 }, (_, n) => `acct-${String(n)}`)
  .reduce(
    (story, account) => story.send(mainCustomer, choose(account)),
    switcherStory("transfers/switcher-edges")
      .ensure(mainCustomer)
      .ensure(switcher)
      .send(mainCustomer, choose("acct-x"))
      .send(mainCustomer, choose(""))
      .checkpoint("blank")
      .send(mainCustomer, choose("a".repeat(10_000)))
      .checkpoint("long"),
  )
  .checkpoint("full");

/**
 * Two accounts are chosen, the tab reloads and only the switcher is ensured: its list is restored
 * and the account read again with nothing listed twice; choosing the same account again changes
 * nothing, and a new one is listed.
 */
export const switcherReloaded = switcherStory("transfers/switcher-reloaded")
  .ensure(mainCustomer)
  .ensure(switcher)
  .send(mainCustomer, choose("acct-1"))
  .send(mainCustomer, choose("acct-2"))
  .reload({ reattach: false })
  .ensure(switcher)
  .checkpoint("reloaded")
  .send(mainCustomer, choose("acct-2"))
  .send(mainCustomer, choose("acct-3"))
  .checkpoint("chosen");

/**
 * What the customer can do under the switcher, for generated runs: choose accounts, none among
 * them (E1), a long id (E3), and the same account twice.
 */
export const switcherSamples = samplesOf({
  id: "transfers-switcher",
  story: switcherStory("transfers/switcher-samples"),
  names: { setup: "bankSwitchingSetup", fixtures: ["BankFake", "AccountsFake"] },
  actors: { mainCustomer, switcher },
  servers: { Bank },
  failures: [],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(mainCustomer, choose("acct-1"))
      .send(mainCustomer, choose("acct-2"))
      .send(mainCustomer, choose("acct-2"))
      .send(mainCustomer, choose(""))
      .send(mainCustomer, choose("a".repeat(10_000))),
});
