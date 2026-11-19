import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { Customer } from "../machines/customer.ts";
import { fromAccount, StandingOrder } from "../machines/standing-order.ts";
import { TransferForm } from "../machines/transfer-form.ts";
import { balance } from "../operations/reads.ts";
import { mainCustomer, rent, sendForm } from "../app.ts";
import { grownStory, planRent, plannedStory } from "./usual.ts";

const bound = (id: string) =>
  grownStory(id)
    .ensure(mainCustomer)
    .ensure(sendForm)
    .send(mainCustomer, Customer.E.Choose({ account: "acct-2" }));

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

/**
 * The customer chooses an account before the form is bound; the form checks an amount.
 */
export const formBoundLate = grownStory("transfers/form-bound-late")
  .ensure(mainCustomer)
  .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
  .ensure(sendForm)
  .send(sendForm, TransferForm.E.Amount({ cents: 500 }))
  .send(sendForm, TransferForm.E.Check())
  .checkpoint("checked");

/**
 * The rent is planned, then let go and ends after its grace; the customer is forgotten; the rent
 * ensured again reads a fresh customer, so a new plan is denied for want of an account.
 */
export const orderCustomerForgotten = plannedStory("transfers/order-customer-forgotten")
  .ensure(mainCustomer)
  .ensure(rent)
  .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
  .send(rent, planRent)
  .detach(rent)
  .advance("1 second")
  .dispose(mainCustomer, { how: "forget" })
  .ensure(rent)
  .send(rent, planRent)
  .checkpoint("fresh");

const planned = (id: string) =>
  plannedStory(id)
    .ensure(mainCustomer)
    .ensure(rent)
    .send(mainCustomer, Customer.E.Choose({ account: "acct-1" }))
    .send(rent, planRent);

/**
 * The planned rent is disposed first, then its customer.
 */
export const orderFirst = planned("transfers/order-first")
  .dispose(rent)
  .dispose(mainCustomer)
  .checkpoint("disposed");

/**
 * The customer is disposed while the planned rent is bound to them.
 */
export const customerFirstUnderOrder = () =>
  planned("transfers/customer-first-under-order").dispose(mainCustomer);

/**
 * Customer and rent, two layers; the tab reloads and only the rent, the deepest node, is ensured.
 */
export const orderChain = planned("transfers/order-chain")
  .reload({ reattach: false })
  .ensure(rent)
  .checkpoint("reloaded");

// FLOW_STATE_ALLOW_UNKNOWN: each builder hands construction a form its types refuse.
const untyped = (value: unknown) =>
  // SAFETY: every refused form here is one the types reject; construction must refuse it at run time too.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-escape-hatch-assertion -- the untyped caller construction guards against
  value as never;

const order = { id: "Bank/StandingOrder", states: ["DRAFT"], events: { Resume: {} } };

/**
 * An order whose configuration was read before its module set it: `undefined`.
 */
export const orderFromUnsetConfig = () => definition(untyped(undefined));

/**
 * An order whose customer slot names its provider's id instead of `Provider.select`.
 */
export const orderWithBareContext = () =>
  definition(untyped({ ...order, context: { customer: "Bank/Customer" } }));

/**
 * An order whose operations callback has braces and no `return`, so it returns nothing.
 */
export const orderWithoutReturn = () =>
  definition(
    untyped({
      ...order,
      internalEvents: { BalanceRead: { cents: Schema.Number }, BalanceFailed: {} },
      operations: ({ E }: { readonly E: typeof StandingOrder.E }) => {
        void balance.outcomes({
          success: E.BalanceRead.from((v: { readonly cents: number }) => ({ cents: v.cents })),
          failure: {
            NoAnswer: E.BalanceFailed,
            Defect: E.BalanceFailed,
            Interrupted: E.BalanceFailed,
          },
        });
      },
    }),
  );

/**
 * An order whose amount starts at the text "0", as a form field gives it, where its Schema is a
 * number.
 */
export const orderStartingAtText = () =>
  definition(untyped({ ...order, memory: { cents: Flow.initial(Schema.Number, untyped("0")) } }));

/**
 * An order whose first date starts at the ISO text the date picker sends, where its Schema's type
 * is a `Date`.
 */
export const orderFirstFromText = () =>
  definition(
    untyped({
      ...order,
      memory: {
        first: Flow.initial(Schema.NullOr(Schema.DateFromString), untyped("2026-12-01")),
      },
    }),
  );

/**
 * An order whose plan looks up the transfer form's balance operation, which has its own's name.
 */
export const orderLookingUpFormsBalance = () =>
  machine(StandingOrder, ({ S }) =>
    untyped({
      default: S.DRAFT,
      on: { Plan: { target: S.CHECKING, actions: [TransferForm.O.balance.lookup(fromAccount)] } },
    }),
  );

/**
 * An order whose context reaction sends the transfer form's `AccountChanged`, which has its own's
 * name.
 */
export const orderHearingFormsEvent = () =>
  machine(StandingOrder, ({ S }) =>
    untyped({
      default: S.DRAFT,
      onContext: [
        {
          select: ({ context }: { readonly context: { readonly customer: string } }) =>
            context.customer,
          event: TransferForm.E.AccountChanged.from((account: string) => ({ account })),
        },
      ],
    }),
  );

/**
 * An order whose resume handler was left `null` while it was being written.
 */
export const orderWithNullHandler = () =>
  machine(StandingOrder, ({ S }) => untyped({ default: S.DRAFT, on: { Resume: null } }));

/**
 * An order whose balance read is written out by hand, half built: a kind, a call and a success
 * ending, but no input, key or failure endings.
 */
export const orderWithHandBuiltRead = () =>
  definition(
    untyped({
      ...order,
      internalEvents: { BalanceRead: { cents: Schema.Number } },
      operations: ({ E }: { readonly E: typeof StandingOrder.E }) => ({
        balance: { kind: "read", call: () => undefined, success: E.BalanceRead },
      }),
    }),
  );

/**
 * An order whose context reaction names its event by a hand-written ending with no mapper.
 */
export const orderWithHandWrittenEnding = () =>
  machine(StandingOrder, ({ S }) =>
    untyped({
      default: S.DRAFT,
      onContext: [
        {
          select: ({ context }: { readonly context: { readonly customer: string } }) =>
            context.customer,
          event: { ending: { event: "AccountChanged" } },
        },
      ],
    }),
  );
