import { Fake, Story } from "../../src/host/testing/index.ts";
import { account, bankSetup, savings } from "./machine.ts";
import { Bank, BankFake } from "./server.ts";

/**
 * The bank app over its port fake, with no steps yet: every transfers Story starts here.
 */
export const bankStory = (id: string) => Story.app(bankSetup, { id, fixtures: [BankFake] });

/**
 * Two transfers that land at once.
 */
export const usual = bankStory("transfers/usual")
  .ensure(account)
  .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
  .send(account, { _tag: "Send", transferId: "t2", cents: 900 })
  .checkpoint("sent");

/**
 * A transfer over the limit: the bank declines it.
 */
export const declined = bankStory("transfers/declined")
  .ensure(account)
  .send(account, { _tag: "Send", transferId: "t1", cents: 5000 })
  .checkpoint("declined");

/**
 * A transfer reaches the bank, its answer is held and never released, and the tab reloads before
 * the commit's 30-second deadline.
 */
export const lostThenReload = bankStory("transfers/lost-then-reload")
  .ensure(account)
  .world(Bank.transfer.hold({ at: "response" }))
  .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
  .checkpoint("sending")
  .advance("5 seconds")
  .reload()
  .checkpoint("reloaded");

/**
 * A transfer that never answers: the nudge at 20 seconds, then the commit's own deadline at 30,
 * then a release that delivers nothing.
 */
export const deadline = bankStory("transfers/deadline")
  .ensure(account)
  .world(Bank.transfer.hold())
  .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
  .advance("19999 millis")
  .checkpoint("before nudge")
  .advance("1 millis")
  .checkpoint("nudged")
  .advance("9999 millis")
  .checkpoint("before deadline")
  .advance("1 millis")
  .checkpoint("late")
  .world(Bank.transfer.release())
  .checkpoint("released");

const round = (story: ReturnType<typeof bankStory>, n: number) => {
  const next = story
    .send(account, { _tag: "Send", transferId: `a${n}`, cents: 500 })
    .send(savings, { _tag: "Send", transferId: `b${n}`, cents: 2000 })
    .world(Bank.transfer.hold())
    .send(account, { _tag: "Send", transferId: `c${n}`, cents: 300 })
    .advance("1 second")
    .world(Bank.transfer.release())
    .world(Bank.transfer.drop({ at: "response" }))
    .send(savings, { _tag: "Send", transferId: `d${n}`, cents: 100 })
    .advance("31 seconds")
    .send(savings, { _tag: "Resend", transferId: `d${n}` });

  return n % 3 === 2 ? next.reload() : next;
};

/**
 * Two accounts over nine rounds of landed, declined, held, lost and resent transfers, with a
 * reload every third round: about a hundred steps, for the bench.
 */
export const long = Array.from({ length: 9 }, (_, n) => n)
  .reduce(round, bankStory("transfers/long").ensure(account).ensure(savings))
  .checkpoint("end");

/**
 * A transfer's answer is lost, so its lane is Held when the Runtime is disposed; the tab reloads
 * after the disposal ends.
 */
export const heldAtDisposal = bankStory("transfers/held-at-disposal")
  .ensure(account)
  .world(Bank.transfer.drop({ at: "response" }))
  .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
  .checkpoint("held")
  .disposeRuntime()
  .advance("6 seconds")
  .checkpoint("disposed")
  .reload()
  .checkpoint("reloaded");

/**
 * The store refuses a transfer's acknowledging write, so the transfer is never sent.
 */
export const refusedWrite = bankStory("transfers/refused-write")
  .ensure(account)
  .world(Fake.storage.refuse())
  .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
  .checkpoint("refused");

/**
 * Every Story of the fixture, by name.
 */
export const stories = {
  usual,
  declined,
  lostThenReload,
  deadline,
  long,
  heldAtDisposal,
  refusedWrite,
};
