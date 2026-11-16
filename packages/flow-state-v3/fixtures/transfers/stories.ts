import { Fake, samplesOf, Story } from "../../src/host/testing/index.ts";
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

const sendT1 = { _tag: "Send", transferId: "t1", cents: 500 } as const;
const sendT2 = { _tag: "Send", transferId: "t2", cents: 900 } as const;
const resendT1 = { _tag: "Resend", transferId: "t1" } as const;
const abandonT2 = { _tag: "Abandon", transferId: "t2" } as const;
const saveT1 = { _tag: "Send", transferId: "t1", cents: 300 } as const;
const abandonSaved = { _tag: "Abandon", transferId: "t1" } as const;

/**
 * A stress run from seed 45, printed by the generator and pasted here. The reload sweep and the
 * bench run it as any Story.
 */
export const seededStress = Story.app(bankSetup, {
  id: "transfers/stress-45",
  fixtures: [BankFake],
})
  .world(Bank.limit({ cents: 100 }))
  .world(Fake.storage.refuse())
  .ensure(account)
  .world(Fake.storage.refuse())
  .ensure(savings)
  .send(account, resendT1)
  .advance("7 millis")
  .send(account, sendT2)
  .world(Fake.storage.hold())
  .send(account, sendT2)
  .world(Fake.storage.refuse())
  .advance("16 millis")
  .advance("10 millis")
  .advance("8 millis")
  .advance("2 millis")
  .send(account, resendT1)
  .advance("1 millis")
  .send(savings, abandonSaved)
  .advance("8 millis")
  .send(savings, abandonSaved)
  .send(account, sendT1)
  .send(savings, saveT1)
  .send(account, resendT1)
  .send(account, abandonT2)
  .send(savings, abandonSaved)
  .send(account, resendT1)
  .send(savings, abandonSaved)
  .send(savings, saveT1)
  .advance("10 millis")
  .advance("9 millis")
  .send(account, sendT1)
  .world(Bank.limit({ cents: 1000 }))
  .send(account, resendT1)
  .send(account, abandonT2)
  .advance("7 millis")
  .dispose(savings, { how: "forget" })
  .send(account, abandonT2)
  .send(account, abandonT2)
  .dispose(account, { how: "forget" })
  .send(account, sendT2)
  .send(savings, abandonSaved)
  .advance("18 millis")
  .send(account, sendT1)
  .send(account, abandonT2)
  .send(account, sendT1)
  .send(account, resendT1)
  .send(account, resendT1)
  .send(savings, abandonSaved)
  .send(account, sendT2)
  .send(account, abandonT2)
  .send(savings, abandonSaved)
  .advance("15 millis")
  .world(Fake.network.offline())
  .send(account, abandonT2)
  .advance("1 millis")
  .send(account, resendT1)
  .send(account, sendT2)
  .advance("4 millis")
  .advance("17 millis")
  .send(savings, abandonSaved)
  .advance("5 millis")
  .send(savings, saveT1)
  .advance("14 millis")
  .advance("14 millis")
  .send(account, sendT2)
  .send(savings, abandonSaved)
  .send(savings, saveT1)
  .send(account, resendT1)
  .advance("18 millis")
  .advance("13 millis")
  .send(savings, saveT1)
  .send(savings, saveT1)
  .send(account, sendT2)
  .advance("5 millis")
  .send(account, abandonT2)
  .advance("4 millis")
  .send(account, sendT2)
  .advance("16 millis")
  .send(savings, abandonSaved)
  .send(savings, saveT1)
  .send(account, sendT2)
  .send(account, sendT2)
  .reload({ heldWrites: "land" })
  .send(savings, saveT1)
  .send(account, sendT1)
  .world(Fake.storage.hold())
  .send(account, resendT1)
  .send(account, sendT1)
  .advance("13 millis")
  .send(account, resendT1)
  .send(savings, abandonSaved)
  .send(savings, abandonSaved)
  .reload({ reattach: false })
  .send(account, sendT1)
  .world(Fake.storage.refuse())
  .send(account, sendT2)
  .world(Fake.storage.refuse())
  .send(account, abandonT2)
  .send(savings, saveT1)
  .send(savings, saveT1)
  .send(account, resendT1)
  .send(account, sendT1)
  .world(Fake.storage.hold())
  .send(account, sendT1)
  .send(account, resendT1)
  .send(account, resendT1)
  .send(account, sendT2)
  .send(account, resendT1)
  .send(account, abandonT2)
  .advance("8 millis")
  .send(account, resendT1)
  .advance("7008 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .world(Fake.storage.release())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * What an account holder and the bank can do, for generated runs: send two transfers from two
 * accounts, send one again and abandon one; the bank lowers its limit.
 */
export const samples = samplesOf({
  id: "transfers",
  story: bankStory("transfers/samples"),
  names: { setup: "bankSetup", fixtures: ["BankFake"] },
  actors: { account, savings },
  servers: { Bank },
  failures: [Bank.limit({ cents: 100 })],
  landedFailures: [],
  values: { sendT1, sendT2, resendT1, abandonT2, saveT1, abandonSaved },
  controls: [Bank.limit({ cents: 1000 })],
  steps: (story) =>
    story
      .send(account, sendT1)
      .send(account, sendT2)
      .send(account, resendT1)
      .send(account, abandonT2)
      .send(savings, saveT1)
      .send(savings, abandonSaved),
});

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
  seededStress,
};
