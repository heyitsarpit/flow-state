import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { account, mainCustomer, rent, savings, sendForm } from "../app.ts";
import { Accounts } from "../server/accounts.ts";
import { Bank } from "../server/bank.ts";
import { EARLIEST, EPOCH, LATEST } from "./edges.ts";
import { forgedAccount } from "./findings.ts";
import {
  acct1Record,
  bankStory,
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

const planAtEpoch = { _tag: "Plan", first: EPOCH, cents: 0 } as const;
const planAtLatest = { _tag: "Plan", first: LATEST, cents: 9500, memo: undefined } as const;
const planAtEarliest = { _tag: "Plan", first: EARLIEST, cents: 9500, memo: "" } as const;
const pauseNoEnd = { _tag: "Pause", until: null } as const;
const pauseUntilLatest = { _tag: "Pause", until: LATEST } as const;
const pauseUntilSpring = { _tag: "Pause", until: RENT_PAUSED_UNTIL } as const;
const pauseUntilEpoch = { _tag: "Pause", until: EPOCH } as const;
const pauseUntilEarliest = { _tag: "Pause", until: EARLIEST } as const;
const planPastSafe = { _tag: "Plan", first: RENT_PAUSED_UNTIL, cents: 2 ** 53 } as const;

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
  failures: [Accounts.balance({ account: "acct-1", cents: 0 })],
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
  controls: [Accounts.balance({ account: "acct-1", cents: 10_000 })],
  steps: (story) =>
    story
      .send(mainCustomer, { _tag: "Choose", account: "acct-1" })
      .send(mainCustomer, { _tag: "Choose", account: "acct-2" })
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
      .send(rent, { _tag: "Resume" }),
});

const rentRecord = 'actor/Bank/StandingOrder/{"order":"rent"}';

// Owed records a damaged disk or a bad copy could leave, each holding one unknown ending: under
// names no ref gives (local names, an empty one, a broken escape, one that does not name itself
// back), and naming the account under a key of another identity or one that does not round-trip.
const oddOwed = [
  "owed/Bank/StandingOrder/~rent",
  "owed/Bank/StandingOrder/",
  'owed/Bank/StandingOrder/{"order":"\\u12"}',
  'owed/Bank/StandingOrder/{"order":"rent","x":1}',
  "owed/Bank/Transfers/~acct-1",
  "owed/Bank/Transfers/~acct-9",
  "owed/Bank/Transfers/acct-1 ",
].map((key) =>
  Fake.storage.put(
    key,
    '{"format":4,"rows":[{"attempt":null,"channel":"unknown","kept":false,"operation":"transfer","reason":"Restored","value":null}]}',
  ),
);

const sendT1 = { _tag: "Send", transferId: "t1", cents: 500 } as const;
const resendT1 = { _tag: "Resend", transferId: "t1" } as const;
const sendT2 = { _tag: "Send", transferId: "t2", cents: 900 } as const;
const abandonT2 = { _tag: "Abandon", transferId: "t2" } as const;
const saveT1 = { _tag: "Send", transferId: "t1", cents: 300 } as const;
const abandonSaved = { _tag: "Abandon", transferId: "t1" } as const;

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
          Accounts.balance({ account: "acct-1", cents: 0 }),
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
          Accounts.balance({ account: "acct-1", cents: 10_000 }),
        ]
      : [Bank.limit({ cents: 1000 }), Bank.receiptLength({ chars: 0 })],
    steps: (story) => {
      const usual = story
        .send(account, sendT1)
        .send(account, resendT1)
        .send(savings, saveT1)
        .send(mainCustomer, { _tag: "Choose", account: "acct-1" })
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
            .send(rent, { _tag: "Resume" })
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

/**
 * The account with records on disk no release wrote, for generated runs: its record in a state it
 * lacks or arming a schedule it never declared, and a Held transfer lane with an Attempt the
 * Runtime never mints, each of which a reload must set aside and report.
 */
export const recordSamples = samplesOf({
  id: "bank-records",
  story: bankStory("bank-records/samples"),
  names: { setup: "bankSetup", fixtures: ["BankFake"] },
  actors: { account },
  servers: { Bank },
  failures: [
    Fake.storage.put(forgedAccount.state.key, forgedAccount.state.text),
    Fake.storage.put(forgedAccount.schedule.key, forgedAccount.schedule.text),
    Fake.storage.put(forgedAccount.attempt.key, forgedAccount.attempt.text),
  ],
  landedFailures: [],
  values: { sendT1, resendT1 },
  controls: [],
  steps: (story) => story.send(account, sendT1).send(account, resendT1),
});
