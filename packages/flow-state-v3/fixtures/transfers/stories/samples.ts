import { samplesOf } from "../../../src/host/testing/index.ts";
import { mainCustomer, sendForm } from "../app.ts";
import { Accounts } from "../server/accounts.ts";
import { grownStory } from "./usual.ts";

/**
 * What a customer and the accounts service can do around the transfer form, for
 * generated runs: choose an account, type amounts (0 and past 2^53 among them) and check them; the
 * accounts service shows an empty balance.
 */
export const samples = samplesOf({
  id: "bank-form",
  story: grownStory("bank-form/samples"),
  names: { setup: "bankGrownSetup", fixtures: ["BankFake", "AccountsFake"] },
  actors: { mainCustomer, sendForm },
  servers: { Accounts },
  failures: [Accounts.balance({ account: "acct-2", cents: 0 })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(mainCustomer, { _tag: "Choose", account: "acct-1" })
      .send(mainCustomer, { _tag: "Choose", account: "acct-2" })
      .send(sendForm, { _tag: "Amount", cents: 500 })
      .send(sendForm, { _tag: "Amount", cents: 0 })
      .send(sendForm, { _tag: "Amount", cents: 2 ** 53 + 2 })
      .send(sendForm, { _tag: "Check" }),
});
