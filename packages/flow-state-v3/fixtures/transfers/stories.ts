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

const pennies = (transferId: string) => ({ _tag: "Send", transferId, cents: 1 }) as const;

const ids = (count: number) => Array.from({ length: count }, (_, n) => `t${n + 1}`);

// `count` transfers sent while the bank holds each one, then the account is closed, so every
// answer is owed to the account's identity and saved with its owed record.
const owedToClosed = (id: string, count: number) =>
  ids(count)
    .reduce(
      (s, transferId) => s.send(account, pennies(transferId)),
      bankStory(id)
        .ensure(account)
        .world(...ids(count).map(() => Bank.transfer.hold())),
    )
    .dispose(account);

const released = (count: number) => ids(count).map(() => Bank.transfer.release());

/**
 * Large receipts owed to an account closed while its transfers were out: one of 262,144
 * characters, five of 200,000, one of 262,145, six more of 200,000 (2.9 MB together) and one short;
 * then the tab reloads and the account hears every one, in the order they were owed. A stress
 * Story: its records weigh 2.9 MB.
 */
export const largeReceipts = owedToClosed("transfers/stress-large-receipts", 14)
  .world(Bank.receiptLength({ chars: 262_144 }), ...released(1))
  .world(Bank.receiptLength({ chars: 200_000 }), ...released(5))
  .world(Bank.receiptLength({ chars: 262_145 }), ...released(1))
  .world(Bank.receiptLength({ chars: 200_000 }), ...released(6))
  .world(Bank.receiptLength({ chars: 0 }), ...released(1))
  .advance("1 second")
  .checkpoint("owed")
  .reload()
  .ensure(account)
  .advance("1 second")
  .checkpoint("heard");

/**
 * 1,300 short receipts owed to a closed account, in one record. The tab reloads and the account
 * hears every one. A stress Story, built on call and kept out of
 * `stories`: a reload at each of its 1,300 steps is too long for the sweep.
 */
export const stressManyReceipts = () =>
  owedToClosed("transfers/stress-many-receipts", 1300)
    .world(...released(1300))
    .advance("1 second")
    .checkpoint("owed")
    .reload()
    .ensure(account)
    .advance("1 second")
    .checkpoint("heard");

/**
 * The key a transfer `t1` of the account `acct-1` holds its lane under, and that lane's record
 * Held, as another release of the app would have saved it with a newer format.
 */
export const t1Lane = 'lane/Bank/Transfers/acct-1|transfer|{"transferId":"t1"}';

const newerT1Lane =
  '{"attempt":"att-000000000000000000006d61696e3a31-1","displaced":[],"format":4,"inFlight":false,"input":{"cents":500,"transferId":"t1"},"machine":"Bank/Transfers","name":"acct-1","operation":"transfer","queue":[],"retryCount":0}';

/**
 * The key `acct-1`'s actor record is saved under, and a record there that does not decode.
 */
export const acct1Record = "actor/Bank/Transfers/acct-1";

const brokenRecord = '{"format":1}';

/**
 * A transfer's answer is lost, so its lane is Held; then a damaged disk leaves its lane record in
 * a newer format and the account's record unreadable. After a reload the account reads
 * quarantined; an ensure starts it fresh; sending `t1` again is declined while the unread lane
 * holds its key, and abandoning `t1` lets the key go.
 */
export const quarantined = bankStory("transfers/quarantined")
  .ensure(account)
  .world(Bank.transfer.drop({ at: "response" }))
  .send(account, sendT1)
  .world(Fake.storage.put(t1Lane, newerT1Lane), Fake.storage.put(acct1Record, brokenRecord))
  .reload({ reattach: false })
  .checkpoint("quarantined")
  .ensure(account)
  .checkpoint("fresh")
  .send(account, sendT1)
  .checkpoint("declined")
  .send(account, abandonSaved)
  .checkpoint("cleared")
  .reload()
  .checkpoint("again");

/**
 * A transfer's answer is lost, then the store fails to load at the reload: the tab runs on with no
 * persistence, and the next transfer is declined, saved nowhere. A healthy reload after it
 * restores the lost transfer's Held lane.
 */
export const refusedLoad = bankStory("transfers/refused-load")
  .ensure(account)
  .world(Bank.transfer.drop({ at: "response" }))
  .send(account, sendT1)
  .checkpoint("held")
  .world(Fake.storage.refuseLoad())
  .reload()
  .checkpoint("unloaded")
  .send(account, sendT2)
  .advance("1 second")
  .checkpoint("sent")
  .reload()
  .checkpoint("healed");

/**
 * The account holder signs out on a shared computer: one transfer landed and one lost, the Runtime
 * is disposed with `forget`, and the tab reloads to nothing.
 */
export const forgotten = bankStory("transfers/forgotten")
  .ensure(account)
  .send(account, sendT1)
  .world(Bank.transfer.drop({ at: "response" }))
  .send(account, sendT2)
  .checkpoint("held")
  .disposeRuntime({ forget: true })
  .advance("6 seconds")
  .checkpoint("forgotten")
  .reload()
  .checkpoint("fresh");

/**
 * As `forgotten`, but the store refuses the deletion: the records stay, to be forgotten again.
 */
export const forgetRefused = bankStory("transfers/forget-refused")
  .ensure(account)
  .send(account, sendT1)
  .checkpoint("sent")
  .world(Fake.storage.refuse())
  .disposeRuntime({ forget: true })
  .advance("6 seconds")
  .checkpoint("kept");

/**
 * A stress run from seed 45, printed by the generator and pasted here. The reload sweep and the
 * bench run it as any Story.
 */
export const seededStress = Story.app(bankSetup, {
  id: "transfers/stress-45",
  fixtures: [BankFake],
})
  .world(Bank.receiptLength({ chars: 262145 }))
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
  .world(Bank.receiptLength({ chars: 262144 }))
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

const transfersSamples = (receipts: {
  readonly past: ReadonlyArray<ReturnType<typeof Bank.receiptLength>>;
  readonly under: ReadonlyArray<ReturnType<typeof Bank.receiptLength>>;
}) =>
  samplesOf({
    id: "transfers",
    story: bankStory("transfers/samples"),
    names: { setup: "bankSetup", fixtures: ["BankFake"] },
    actors: { account, savings },
    servers: { Bank },
    failures: [
      Bank.limit({ cents: 100 }),
      ...receipts.past,
      Fake.storage.put(t1Lane, newerT1Lane),
      Fake.storage.put(acct1Record, brokenRecord),
    ],
    landedFailures: [],
    values: { sendT1, sendT2, resendT1, abandonT2, saveT1, abandonSaved },
    controls: [Bank.limit({ cents: 1000 }), ...receipts.under, Bank.receiptLength({ chars: 0 })],
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
 * What an account holder and the bank can do, for generated runs: send two transfers from two
 * accounts, send one again and abandon one; the bank lowers its limit or sends empty receipts, and
 * a record on disk is in a newer format or does not decode.
 */
export const samples = transfersSamples({ past: [], under: [] });

/**
 * The samples with the receipts' edge values, for the stress runs: receipts of 200,000, 262,144 and
 * 262,145 characters.
 */
export const stressSamples = transfersSamples({
  past: [Bank.receiptLength({ chars: 262_145 })],
  under: [Bank.receiptLength({ chars: 200_000 }), Bank.receiptLength({ chars: 262_144 })],
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
  largeReceipts,
  quarantined,
  refusedLoad,
  forgotten,
  forgetRefused,
};
