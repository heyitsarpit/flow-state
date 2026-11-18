import { Fake } from "../../../src/host/testing/index.ts";
import { account } from "../app.ts";
import { Bank } from "../server/bank.ts";
import { bankStory } from "./usual.ts";

const accountRecord = "actor/Bank/Transfers/acct-1";

// The account's record in state `state` with `schedules` (JSON).
const accountText = (state: string, schedules: string) =>
  `{"context":{},"format":4,"graph":{},"memories":[],"memory":{"notice":""},"reactions":[],"schedules":${schedules},"seen":{},"state":"${state}"}`;

/**
 * Records of the account as a damaged disk or a bad copy could leave them: its record in a state
 * the account machine lacks, its record arming a schedule the machine never declared, and a Held
 * transfer lane whose Attempt is not one the Runtime mints.
 */
export const forgedAccount = {
  state: { key: accountRecord, text: accountText("NOPE", "[]") },
  schedule: {
    key: accountRecord,
    text: accountText("READY", '[{"dueAt":20000,"name":"gone","send":"Nudge"}]'),
  },
  attempt: {
    key: 'lane/Bank/Transfers/acct-1|Bank/transfer|{"transferId":"t1"}',
    text: '{"attempt":"x","digest":"67fe5a62","displaced":[],"format":4,"inFlight":false,"input":{"cents":500,"transferId":"t1"},"queue":[],"retryCount":0}',
  },
} as const;

// The account sends a transfer; then `record` replaces what the store holds under its key, and
// the tab reloads and ensures the account.
const forgedReload = (id: string, record: { readonly key: string; readonly text: string }) =>
  bankStory(id)
    .ensure(account)
    .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
    .world(Fake.storage.put(record.key, record.text))
    .reload({ reattach: false })
    .checkpoint("booted")
    .ensure(account)
    .advance("30 seconds")
    .checkpoint("restored");

/**
 * The account's record in a state its machine lacks: set aside and reported, and the account
 * starts fresh.
 */
export const stateUndeclared = forgedReload("transfers/state-undeclared", forgedAccount.state);

/**
 * The account's record arming a schedule its machine never declared: set aside and reported, and
 * no timer of that name arms.
 */
export const scheduleUndeclared = forgedReload(
  "transfers/schedule-undeclared",
  forgedAccount.schedule,
);

/**
 * A Held transfer lane whose Attempt is not one the Runtime mints: set aside and reported, and no
 * ending for it is heard.
 */
export const attemptForged = forgedReload("transfers/attempt-forged", forgedAccount.attempt);

/**
 * A Held transfer lane whose Attempt is not one the Runtime mints, reloaded three times without an
 * ensure: the record stays set aside, is reported at each boot, and no boot fails.
 */
export const attemptReloaded = bankStory("transfers/attempt-reloaded")
  .ensure(account)
  .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
  .world(Fake.storage.put(forgedAccount.attempt.key, forgedAccount.attempt.text))
  .reload({ reattach: false })
  .reload({ reattach: false })
  .reload({ reattach: false })
  .checkpoint("booted");

/**
 * A Held transfer lane whose Attempt was nulled, so it reads as a lane with no head that still
 * holds an input, as a damaged disk could leave it: a lane with no head holds no input, so it is
 * set aside and reported rather than read as headless and its head lost with no ending.
 */
export const heldNulled = {
  key: 'lane/Bank/Transfers/acct-1|Bank/transfer|{"transferId":"t1"}',
  text: '{"attempt":null,"digest":"67fe5a62","displaced":[],"format":4,"inFlight":false,"input":{"cents":500,"transferId":"t1"},"queue":[],"retryCount":0}',
} as const;

/**
 * The account sends a transfer whose answer is lost, so its lane is Held; then the lane's record
 * loses its Attempt, and the tab reloads and ensures the account.
 */
export const heldAttemptNulled = bankStory("transfers/held-attempt-nulled")
  .ensure(account)
  .world(Bank.transfer.drop({ at: "response" }))
  .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
  .world(Fake.storage.put(heldNulled.key, heldNulled.text))
  .reload({ reattach: false })
  .checkpoint("booted")
  .ensure(account)
  .checkpoint("restored");
