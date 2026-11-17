import { Layer } from "effect";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { AccountsLive } from "./adapters/accounts.ts";
import { BankLive } from "./adapters/bank.ts";
import { TransfersMachine } from "./machines/transfers.ts";
import { CustomerMachine } from "./machines/customer.ts";
import { TransferFormMachine } from "./machines/transfer-form.ts";

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
