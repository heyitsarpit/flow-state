import { Schema } from "effect";
import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../../src/index.ts";
import {
  account,
  bankGrownSetup,
  bankPlannedSetup,
  bankSetup,
  mainCustomer,
  rent,
  savings,
  sendForm,
} from "../app.ts";
import { Customer } from "../machines/customer.ts";
import { StandingOrder } from "../machines/standing-order.ts";
import { TransferForm } from "../machines/transfer-form.ts";
import { Transfers } from "../machines/transfers.ts";
import { Bank } from "../server/bank.ts";
import { AccountsFake, BankFake, BankFakeCleanupThrows } from "../server/layer.ts";

const isoDate = Schema.decodeSync(Schema.DateFromString);

/**
 * The grown bank app over its port fakes, with no steps yet: every Story of the customer and the
 * transfer form starts here.
 */
export const grownStory = (id: string) =>
  Story.app(bankGrownSetup, { id, fixtures: [BankFake, AccountsFake] });

/**
 * The bank app with standing orders over its port fakes, with no steps yet: every Story of a
 * standing order starts here.
 */
export const plannedStory = (id: string) =>
  Story.app(bankPlannedSetup, { id, fixtures: [BankFake, AccountsFake] });

/**
 * The rent's first payment date, as the date picker gives it.
 */
export const RENT_FIRST = isoDate("2026-12-01T00:00:00.000Z");

/**
 * The date the rent is paused until.
 */
export const RENT_PAUSED_UNTIL = isoDate("2027-03-01T00:00:00.000Z");

/**
 * The rent planned: 9,500 cents from its first date, with a memo.
 */
export const planRent = StandingOrder.E.Plan({ first: RENT_FIRST, cents: 9500, memo: "rent" });

/**
 * The customer chooses their account and plans the rent, which fits the balance and is scheduled;
 * it is paused until spring, the tab reloads, and it resumes. A second plan over the balance goes
 * back to the draft.
 */
export const standingOrder = plannedStory("transfers/standing-order")
  .ensure(mainCustomer)
  .ensure(rent)
  .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
  .send(rent, planRent)
  .checkpoint("scheduled")
  .send(rent, StandingOrder.E.Pause({ until: RENT_PAUSED_UNTIL }))
  .checkpoint("paused")
  .reload()
  .checkpoint("reloaded")
  .send(rent, StandingOrder.E.Resume())
  .checkpoint("resumed")
  .send(rent, StandingOrder.E.Plan({ first: RENT_FIRST, cents: 20_000, memo: "rent" }))
  .checkpoint("over");

/**
 * The customer chooses their account; the form checks 500 cents against its balance, the account
 * sends it, and a second amount over the balance is refused by the form.
 */
export const checkAndSend = grownStory("transfers/check-and-send")
  .ensure(mainCustomer)
  .ensure(sendForm)
  .ensure(account)
  .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
  .send(sendForm, TransferForm.E.Amount({ cents: 500 }))
  .send(sendForm, TransferForm.E.Check())
  .checkpoint("ready")
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
  .checkpoint("sent")
  .send(sendForm, TransferForm.E.Amount({ cents: 20_000 }))
  .send(sendForm, TransferForm.E.Check())
  .checkpoint("over");

/**
 * The bank app over its port fake, with no steps yet: every transfers Story starts here.
 */
export const bankStory = (id: string) => Story.app(bankSetup, { id, fixtures: [BankFake] });

/**
 * Two transfers that land at once.
 */
export const usual = bankStory("transfers/usual")
  .ensure(account)
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
  .send(account, Transfers.E.Send({ transferId: "t2", cents: 900 }))
  .checkpoint("sent");

/**
 * A transfer over the limit: the bank declines it.
 */
export const declined = bankStory("transfers/declined")
  .ensure(account)
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 5000 }))
  .checkpoint("declined");

/**
 * A transfer reaches the bank, its answer is held and never released, and the tab reloads before
 * the commit's 30-second deadline.
 */
export const lostThenReload = bankStory("transfers/lost-then-reload")
  .ensure(account)
  .world(Bank.transfer.hold({ at: "response" }))
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
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
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
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
    .send(account, Transfers.E.Send({ transferId: `a${n}`, cents: 500 }))
    .send(savings, Transfers.E.Send({ transferId: `b${n}`, cents: 2000 }))
    .world(Bank.transfer.hold())
    .send(account, Transfers.E.Send({ transferId: `c${n}`, cents: 300 }))
    .advance("1 second")
    .world(Bank.transfer.release())
    .world(Bank.transfer.drop({ at: "response" }))
    .send(savings, Transfers.E.Send({ transferId: `d${n}`, cents: 100 }))
    .advance("31 seconds")
    .send(savings, Transfers.E.Resend({ transferId: `d${n}` }));

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
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
  .checkpoint("held")
  .disposeRuntime()
  .advance("6 seconds")
  .checkpoint("disposed")
  .reload()
  .checkpoint("reloaded");

/**
 * The customer sends a transfer and goes to close the tab before the bank has taken it, so the
 * page warns that a transfer is still sending; once the bank answers nothing is left to warn about.
 */
export const leaveWhileSending = bankStory("transfers/leave-while-sending")
  .ensure(account)
  .world(Bank.transfer.hold())
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
  .checkpoint("sending")
  .world(Bank.transfer.release())
  .checkpoint("settled");

/**
 * A transfer's answer is lost, so it is held; the customer removes the account from this device,
 * leaving the hold with no actor; the tab reloads twice with nothing open, and adding the account
 * back takes the hold again.
 */
export const unsureAccountRemoved = bankStory("transfers/unsure-account-removed")
  .ensure(account)
  .world(Bank.transfer.drop({ at: "response" }))
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
  .checkpoint("unsure")
  .dispose(account)
  .checkpoint("removed")
  .reload({ reattach: false })
  .checkpoint("reloaded")
  .reload({ reattach: false })
  .checkpoint("reloaded again")
  .ensure(account)
  .checkpoint("adopted");

/**
 * The customer signs out, so the app disposes its Runtime, while a transfer hangs at the bank,
 * over a bank client whose cleanup on an interrupted request throws: the transfer ends unknown at
 * the disposal's bound, and its cleanup fails.
 */
export const interruptCleanupFails = Story.app(bankSetup, {
  id: "transfers/interrupt-cleanup-fails",
  fixtures: [BankFakeCleanupThrows],
})
  .ensure(account)
  .world(Bank.transfer.hold())
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
  .disposeRuntime()
  .advance(RuntimeDefaults.disposalBound)
  .checkpoint("signed out");

/**
 * The store refuses a transfer's acknowledging write, so the transfer is never sent.
 */
export const refusedWrite = bankStory("transfers/refused-write")
  .ensure(account)
  .world(Fake.storage.refuse())
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
  .checkpoint("refused");

const sendT1 = Transfers.E.Send({ transferId: "t1", cents: 500 });
const sendT2 = Transfers.E.Send({ transferId: "t2", cents: 900 });
const resendT1 = Transfers.E.Resend({ transferId: "t1" });
const abandonT2 = Transfers.E.Abandon({ transferId: "t2" });
const saveT1 = Transfers.E.Send({ transferId: "t1", cents: 300 });
const abandonSaved = Transfers.E.Abandon({ transferId: "t1" });

/**
 * The store takes a transfer's acknowledging write and then refuses it, so the transfer is never
 * sent.
 */
export const refusedHeldWrite = bankStory("transfers/refused-held-write")
  .ensure(account)
  .world(Fake.storage.hold())
  .send(account, sendT1)
  .checkpoint("acknowledging")
  .world(Fake.storage.refuseHeld())
  .checkpoint("refused");

/**
 * A transfer's answer is lost while the disk is full: the write that saves it Held is refused, and
 * so is the capture of the customer's re-send, which goes back to Held. A second later the disk
 * has room again and the Held lane is saved.
 */
export const refusedResendCapture = bankStory("transfers/refused-resend-capture")
  .ensure(account)
  .world(Bank.transfer.drop({ at: "response" }), Fake.storage.hold())
  .send(account, sendT1)
  .world(Fake.storage.refuse(), Fake.storage.release())
  .checkpoint("held unsaved")
  .world(Fake.storage.refuse())
  .send(account, resendT1)
  .checkpoint("capture refused")
  .advance("1 second")
  .checkpoint("saved");

const ids = (count: number) => Array.from({ length: count }, (_, n) => `t${n + 1}`);

// `count` transfers sent while the bank holds each one, then the account is closed, so every
// answer is owed to the account's identity and saved with its owed record.
const owedToClosed = (id: string, count: number) =>
  ids(count)
    .reduce(
      (s, transferId) => s.send(account, Transfers.E.Send({ transferId, cents: 1 })),
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
 * Two receipts owed to an account closed while its transfers were out: the bank garbles the first
 * with a broken character (a lone surrogate, which no record can hold), then sends a plain one; the
 * tab reloads and the account hears both.
 */
export const garbledReceipt = owedToClosed("transfers/garbled-receipt", 2)
  .world(Bank.receiptPad({ pad: "\uD800" }), Bank.receiptLength({ chars: 4 }), ...released(1))
  .world(Bank.receiptPad({ pad: "0" }), Bank.receiptLength({ chars: 0 }), ...released(1))
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

/**
 * `t1`'s lane record Held, in a newer format than this release reads.
 */
export const newerT1Lane =
  '{"attempt":"att-000000000000000000006d61696e3a31-1","displaced":[],"format":4,"inFlight":false,"input":{"cents":500,"transferId":"t1"},"machine":"Bank/Transfers","name":"acct-1","operation":"transfer","queue":[],"retryCount":0}';

/**
 * The key `acct-1`'s actor record is saved under, and a record there that does not decode.
 */
export const acct1Record = "actor/Bank/Transfers/acct-1";

/**
 * A record in no format Flow writes.
 */
export const brokenRecord = '{"format":1}';

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
export const seededStress = bankStory("transfers/stress-45")
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
  .world(Fake.storage.refuseLoad())
  .reload({ reattach: false })
  .send(account, sendT1)
  .send(account, sendT2)
  .send(account, abandonT2)
  .send(savings, saveT1)
  .send(savings, saveT1)
  .send(account, resendT1)
  .send(account, sendT1)
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
  refusedHeldWrite,
  refusedResendCapture,
  seededStress,
  largeReceipts,
  garbledReceipt,
  quarantined,
  refusedLoad,
  forgotten,
  forgetRefused,
};
