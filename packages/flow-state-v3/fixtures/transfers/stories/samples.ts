import { Schema } from "effect";
import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { account, mainCustomer, rent, savings, sendForm } from "../app.ts";
import { Customer } from "../machines/customer.ts";
import { StandingOrder } from "../machines/standing-order.ts";
import { TransferForm } from "../machines/transfer-form.ts";
import { Transfers } from "../machines/transfers.ts";
import { Accounts } from "../server/accounts.ts";
import { Bank } from "../server/bank.ts";
import { EARLIEST, EPOCH, LATEST } from "./edges.ts";
import {
  acct1Record,
  brokenRecord,
  grownStory,
  newerT1Lane,
  planRent,
  plannedStory,
  RENT_PAUSED_UNTIL,
  t1Lane,
} from "./usual.ts";

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
  failures: [Accounts.setBalance({ account: "acct-2", cents: 0 })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
      .send(mainCustomer, Customer.E.Choose({ account: "acct-2" }))
      .send(sendForm, TransferForm.E.Amount({ cents: 500 }))
      .send(sendForm, TransferForm.E.Amount({ cents: 0 }))
      .send(sendForm, TransferForm.E.Amount({ cents: 2 ** 53 + 2 }))
      .send(sendForm, TransferForm.E.Check()),
});

const planAtEpoch = StandingOrder.E.Plan({ first: EPOCH, cents: 0 });
const planAtLatest = StandingOrder.E.Plan({ first: LATEST, cents: 9500, memo: undefined });
const planAtEarliest = StandingOrder.E.Plan({ first: EARLIEST, cents: 9500, memo: "" });
const pauseNoEnd = StandingOrder.E.Pause({ until: null });
const pauseUntilLatest = StandingOrder.E.Pause({ until: LATEST });
const pauseUntilSpring = StandingOrder.E.Pause({ until: RENT_PAUSED_UNTIL });
const pauseUntilEpoch = StandingOrder.E.Pause({ until: EPOCH });
const pauseUntilEarliest = StandingOrder.E.Pause({ until: EARLIEST });
const planPastSafe = StandingOrder.E.Plan({ first: RENT_PAUSED_UNTIL, cents: 2 ** 53 });

/**
 * What a customer and the accounts service can do around a standing order, for generated runs:
 * choose an account, plan from the epoch, the earliest and the latest date a `Date` holds, with a
 * memo, none or `undefined`, or 2^53 cents; pause with no end or until a date, either end or the
 * epoch, and resume; the accounts service shows an empty balance.
 */
export const orderSamples = samplesOf({
  id: "bank-orders",
  story: plannedStory("bank-orders/samples"),
  names: { setup: "bankPlannedSetup", fixtures: ["BankFake", "AccountsFake"] },
  actors: { mainCustomer, rent },
  servers: { Accounts },
  failures: [Accounts.setBalance({ account: "acct-1", cents: 0 })],
  landedFailures: [],
  values: {
    planRent,
    planAtEpoch,
    planAtLatest,
    planAtEarliest,
    planPastSafe,
    pauseNoEnd,
    pauseUntilLatest,
    pauseUntilSpring,
    pauseUntilEpoch,
    pauseUntilEarliest,
  },
  controls: [Accounts.setBalance({ account: "acct-1", cents: 10_000 })],
  steps: (story) =>
    story
      .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
      .send(mainCustomer, Customer.E.Choose({ account: "acct-2" }))
      .send(rent, planRent)
      .send(rent, planAtEpoch)
      .send(rent, planAtLatest)
      .send(rent, planAtEarliest)
      .send(rent, pauseNoEnd)
      .send(rent, pauseUntilLatest)
      .send(rent, pauseUntilSpring)
      .send(rent, pauseUntilEpoch)
      .send(rent, pauseUntilEarliest)
      .send(rent, planPastSafe)
      .send(rent, StandingOrder.E.Resume()),
});

const rentRecord = 'actor/Bank/StandingOrder/{"order":"rent"}';

const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.String));

// Owed records a damaged disk or a bad copy could leave, each holding one unknown ending: under
// names no ref gives (local names, an empty one, a broken escape, one that does not name itself
// back), and naming the account under a key of another identity or one that does not round-trip.
const oddOwed = [
  { machine: "Bank/StandingOrder", name: "~rent", key: "owed/Bank/StandingOrder/~rent" },
  { machine: "Bank/StandingOrder", name: "", key: "owed/Bank/StandingOrder/" },
  {
    machine: "Bank/StandingOrder",
    name: '{"order":"\\u12"}',
    key: 'owed/Bank/StandingOrder/{"order":"\\u12"}',
  },
  {
    machine: "Bank/StandingOrder",
    name: '{"order":"rent","x":1}',
    key: 'owed/Bank/StandingOrder/{"order":"rent","x":1}',
  },
  { machine: "Bank/Transfers", name: "~acct-1", key: "owed/Bank/Transfers/~acct-1" },
  { machine: "Bank/Transfers", name: "acct-1", key: "owed/Bank/Transfers/~acct-9" },
  { machine: "Bank/Transfers", name: "acct-1", key: "owed/Bank/Transfers/acct-1 " },
].map(({ machine, name, key }) =>
  Fake.storage.put(
    key,
    `{"format":3,"machine":${jsonText(machine)},"name":${jsonText(name)},"rows":[{"attempt":null,"channel":"unknown","kept":false,"lane":null,"operation":"transfer","reason":"Restored","value":null}]}`,
  ),
);

const sendT1 = Transfers.E.Send({ transferId: "t1", cents: 500 });
const resendT1 = Transfers.E.Resend({ transferId: "t1" });
const sendT2 = Transfers.E.Send({ transferId: "t2", cents: 900 });
const abandonT2 = Transfers.E.Abandon({ transferId: "t2" });
const saveT1 = Transfers.E.Send({ transferId: "t1", cents: 300 });
const abandonSaved = Transfers.E.Abandon({ transferId: "t1" });

const plannedSamplesOf = (edges: boolean) =>
  samplesOf({
    id: edges ? "bank-planned-edges" : "bank-planned",
    story: plannedStory(edges ? "bank-planned-edges/samples" : "bank-planned/samples"),
    names: { setup: "bankPlannedSetup", fixtures: ["BankFake", "AccountsFake"] },
    actors: { account, savings, mainCustomer, rent },
    servers: { Bank, Accounts },
    failures: edges
      ? [
          Bank.limit({ cents: 100 }),
          Bank.receiptLength({ chars: 262_145 }),
          Fake.storage.put(t1Lane, newerT1Lane),
          Fake.storage.put(acct1Record, brokenRecord),
          Fake.storage.put(rentRecord, brokenRecord),
          ...oddOwed,
          Accounts.setBalance({ account: "acct-1", cents: 0 }),
        ]
      : [
          Bank.limit({ cents: 100 }),
          Fake.storage.put(t1Lane, newerT1Lane),
          Fake.storage.put(acct1Record, brokenRecord),
          Fake.storage.put(rentRecord, brokenRecord),
        ],
    landedFailures: [],
    values: {
      sendT1,
      resendT1,
      sendT2,
      abandonT2,
      saveT1,
      abandonSaved,
      planRent,
      planAtEpoch,
      planAtLatest,
      planAtEarliest,
      pauseNoEnd,
      pauseUntilLatest,
    },
    controls: edges
      ? [
          Bank.limit({ cents: 1000 }),
          Bank.receiptLength({ chars: 0 }),
          Bank.receiptLength({ chars: 200_000 }),
          Bank.receiptLength({ chars: 262_144 }),
          Accounts.setBalance({ account: "acct-1", cents: 10_000 }),
        ]
      : [Bank.limit({ cents: 1000 }), Bank.receiptLength({ chars: 0 })],
    steps: (story) => {
      const usual = story
        .send(account, sendT1)
        .send(account, resendT1)
        .send(savings, saveT1)
        .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
        .send(rent, planAtEpoch)
        .send(rent, pauseNoEnd);

      return edges
        ? usual
            .send(account, sendT2)
            .send(account, abandonT2)
            .send(savings, abandonSaved)
            .send(rent, planRent)
            .send(rent, planAtLatest)
            .send(rent, planAtEarliest)
            .send(rent, pauseUntilLatest)
            .send(rent, StandingOrder.E.Resume())
        : usual;
    },
  });

/**
 * The bank as one app for the app mix: two accounts send, resend and save transfers while the
 * customer plans their rent from the epoch and pauses it with no end; the bank lowers its limit or
 * sends empty receipts, and a record on disk is in a newer format or does not decode.
 */
export const plannedSamples = plannedSamplesOf(false);

/**
 * The mix's bank with its edges, for the stress mix: a second transfer abandoned and a saved one
 * abandoned, receipts of 200,000, 262,144 and 262,145 characters, and the rent planned from the earliest and the latest date a `Date` holds, with a
 * memo, none or `undefined`, paused until the latest date and resumed; the accounts service also
 * shows an empty balance.
 */
export const plannedStressSamples = plannedSamplesOf(true);
