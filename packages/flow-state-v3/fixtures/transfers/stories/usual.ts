import { Story } from "../../../src/host/testing/index.ts";
import { bankGrownSetup, mainCustomer, sendForm } from "../app.ts";
import { account } from "../machine.ts";
import { BankFake } from "../server.ts";
import { AccountsFake } from "../server/layer.ts";

/**
 * The grown bank app over its port fakes, with no steps yet: every Story of the customer and the
 * transfer form starts here.
 */
export const grownStory = (id: string) =>
  Story.app(bankGrownSetup, { id, fixtures: [BankFake, AccountsFake] });

/**
 * The customer chooses their account; the form checks 500 cents against its balance, the account
 * sends it, and a second amount over the balance is refused by the form.
 */
export const checkAndSend = grownStory("transfers/check-and-send")
  .ensure(mainCustomer)
  .ensure(sendForm)
  .ensure(account)
  .send(mainCustomer, { _tag: "Choose", account: "acct-1" })
  .send(sendForm, { _tag: "Amount", cents: 500 })
  .send(sendForm, { _tag: "Check" })
  .checkpoint("ready")
  .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
  .checkpoint("sent")
  .send(sendForm, { _tag: "Amount", cents: 20_000 })
  .send(sendForm, { _tag: "Check" })
  .checkpoint("over");
