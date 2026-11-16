import { mainCustomer, sendForm } from "../app.ts";
import { grownStory } from "./usual.ts";

const bound = (id: string) =>
  grownStory(id)
    .ensure(mainCustomer)
    .ensure(sendForm)
    .send(mainCustomer, { _tag: "Choose", account: "acct-2" });

/**
 * Customer and form, two layers; the tab reloads and only the form, the deepest node, is ensured.
 */
export const chain = bound("transfers/chain")
  .reload({ reattach: false })
  .ensure(sendForm)
  .checkpoint("reloaded");

/**
 * The form is disposed first, then the customer.
 */
export const formFirst = bound("transfers/form-first")
  .dispose(sendForm)
  .dispose(mainCustomer)
  .checkpoint("disposed");

/**
 * The form is let go and ends after its grace, then the customer is forgotten; a form ensured
 * again reads a fresh customer.
 */
export const customerForgotten = bound("transfers/customer-forgotten")
  .detach(sendForm)
  .advance("1 second")
  .dispose(mainCustomer, { how: "forget" })
  .ensure(sendForm)
  .checkpoint("fresh");

/**
 * The customer is disposed while the form is bound to them.
 */
export const customerFirst = () => bound("transfers/customer-first").dispose(mainCustomer);
