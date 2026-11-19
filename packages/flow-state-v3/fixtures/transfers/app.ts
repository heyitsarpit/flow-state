import { Layer } from "effect";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { AccountsLive } from "./adapters/accounts.ts";
import { BankLive } from "./adapters/bank.ts";
import { TransfersMachine } from "./machines/transfers.ts";
import { CustomerMachine } from "./machines/customer.ts";
import { AccountSwitcherMachine } from "./machines/account-switcher.ts";
import { TransferFormMachine } from "./machines/transfer-form.ts";
import { StandingOrderMachine } from "./machines/standing-order.ts";

/**
 * The bank app: one machine.
 */
export const bank = app({ id: "bank", machines: { transfers: TransfersMachine } });

/**
 * The bank app's real setup: the bank over HTTP, persisted, each capture written at once. A Story
 * never builds its services.
 */
export const bankSetup = runtimeSetup({
  app: bank,
  services: BankLive("https://bank.example"),
  scope: "bank",
  persistence: { captureMs: 0 },
});

/**
 * The account most stories use.
 */
export const account = actorRef(TransfersMachine, "acct-1");

/**
 * A second account of the same machine.
 */
export const savings = actorRef(TransfersMachine, "acct-2");

/**
 * The signed-in customer.
 */
export const mainCustomer = actorRef(CustomerMachine, "me");

/**
 * The send-money form, bound to the main customer.
 */
export const sendForm = actorRef(TransferFormMachine, { form: "send-1" });

/**
 * An account named "café" in its composed (NFC) spelling.
 */
export const cafeComposed = actorRef(TransfersMachine, "caf\u00e9");

/**
 * An account named "café" in its decomposed spelling.
 */
export const cafeDecomposed = actorRef(TransfersMachine, "cafe\u0301");

/**
 * The `n`th of many accounts.
 */
export const accountOf = (n: number) => actorRef(TransfersMachine, `acct-${String(n)}`);

/**
 * The bank app grown with the customer and their transfer form around the account.
 */
export const bankGrown = app({
  id: "bank",
  machines: {
    transfers: TransfersMachine,
    customer: CustomerMachine,
    form: { machine: TransferFormMachine, context: { customer: mainCustomer } },
  },
});

/**
 * The grown bank app's real setup: the bank and accounts services over HTTP, persisted, each
 * capture written at once.
 */
export const bankGrownSetup = runtimeSetup({
  app: bankGrown,
  services: Layer.mergeAll(
    BankLive("https://bank.example"),
    AccountsLive("https://accounts.example"),
  ),
  scope: "bank",
  persistence: { captureMs: 0 },
});

/**
 * The customer's rent: a standing order bound to the main customer.
 */
export const rent = actorRef(StandingOrderMachine, { order: "rent" });

/**
 * The `n`th of many standing orders.
 */
export const orderOf = (n: number) =>
  actorRef(StandingOrderMachine, { order: `order-${String(n)}` });

/**
 * The grown bank app with the customer's standing orders beside the form.
 */
export const bankPlanned = app({
  id: "bank",
  machines: {
    transfers: TransfersMachine,
    customer: CustomerMachine,
    form: { machine: TransferFormMachine, context: { customer: mainCustomer } },
    orders: { machine: StandingOrderMachine, context: { customer: mainCustomer } },
  },
});

/**
 * The planned bank app's real setup, as the grown app's: both services over HTTP, persisted, each
 * capture written at once.
 */
export const bankPlannedSetup = runtimeSetup({
  app: bankPlanned,
  services: Layer.mergeAll(
    BankLive("https://bank.example"),
    AccountsLive("https://accounts.example"),
  ),
  scope: "bank",
  persistence: { captureMs: 0 },
});

/**
 * The header's account switcher, bound to the main customer.
 */
export const switcher = actorRef(AccountSwitcherMachine, "switcher");

/**
 * The planned bank app grown with the header's account switcher.
 */
export const bankSwitching = app({
  id: "bank",
  machines: {
    ...bankPlanned.machines,
    switcher: { machine: AccountSwitcherMachine, context: { account: mainCustomer } },
  },
});

/**
 * The switching bank app's real setup, as the planned app's.
 */
export const bankSwitchingSetup = runtimeSetup({
  app: bankSwitching,
  services: Layer.mergeAll(
    BankLive("https://bank.example"),
    AccountsLive("https://accounts.example"),
  ),
  scope: "bank",
  persistence: { captureMs: 0 },
});
