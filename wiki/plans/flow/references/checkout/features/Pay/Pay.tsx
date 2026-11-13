// The checkout screen. Every step reads the checkout's memory; the challenge's own memory sits at its state's name
// (`s.memory.CHALLENGE`) and its timer's deadline at `s.schedules` (the nested Countdown's `expire`, S4), drawn with
// `useNow`. The Pay button asks `check()` why it is disabled (F21); the reason's text comes from the guard port's
// annotation (F19). The page warns before leaving only while a payment or an order is on the wire (O16), and drops
// the checkout's stored record once the receipt has been seen (`forget`, P2).
import { check } from "flow-state";
import { useActorByRef, useNow, useRuntime, useView } from "flow-state/react";
import { useEffect } from "react";
import { AddressStep } from "./address.subroutine.js";
import { OrderSummary } from "./order-summary.trait.js";
import { Pay } from "./pay.definition.js";
import { payRef } from "./pay.ref.js";
import { pay, placeOrder } from "./pay.contracts.js";

const { S, E } = Pay;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function CheckoutScreen({ paymentMethodId }: { paymentMethodId: string }) {
  const checkout = useActorByRef(payRef, {});
  const runtime = useRuntime();
  const memory = useView(checkout, (s) => s.memory);
  const canPay = useView(checkout, (s) => check(s, E.summary.PayPressed({ paymentMethodId })));
  const quote = useView(checkout, (s) =>
    OrderSummary.O.shipping.get(s, { cartId: s.memory.cartId }),
  );
  const dueAt = useView(checkout, (s) => s.schedules.CHALLENGE?.countdown?.expire?.dueAt ?? null);
  const challenge = useView(checkout, (s) =>
    S.CHALLENGE.is(s) ? S.CHALLENGE.child(s) : undefined,
  );
  const field = useView(
    checkout,
    (s) =>
      AddressStep.S.FORM.child(s.memory.ADDRESS) ??
      AddressStep.S.FORM.history.child(s.memory.ADDRESS),
  );
  const now = useNow("1 second");
  const inAddress = useView(checkout, (s) => S.ADDRESS.is(s));
  const unsure = useView(checkout, (s) => S.UNSURE.is(s));
  const stuck = useView(checkout, (s) => S.STUCK.is(s));

  // Only a payment or an order on the wire is worth a "Leave site?" prompt; a shipping quote is not (O16).
  // design gap: an `unsettledWrites()` entry's shape is not in the design; `contract` is assumed, as in the desk host.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const moneyMoving = runtime
        .unsettledWrites()
        .some((w) => w.contract === pay.id || w.contract === placeOrder.id);

      if (moneyMoving) event.preventDefault();
    };

    addEventListener("beforeunload", warn);

    return () => removeEventListener("beforeunload", warn);
  }, [runtime]);

  const done = () => {
    checkout.send(E.Done());
    void runtime.disposeActor(payRef, { forget: true }); // the receipt was seen: nothing left to adopt
  };

  return (
    <section aria-label="Checkout">
      {memory.notice !== "" && <p role="status">{memory.notice}</p>}

      {inAddress && (
        <form aria-label="Delivery address" data-focus={field}>
          <input
            aria-label="Postcode"
            value={memory.ADDRESS?.address.postcode ?? ""}
            onChange={(e) =>
              checkout.send(
                E.ADDRESS.Changed({
                  address: {
                    ...(memory.ADDRESS?.address ?? memory.addressDraft),
                    postcode: e.target.value,
                  },
                }),
              )
            }
          />
          <button type="button" onClick={() => checkout.send(E.ADDRESS.Help())}>
            Where's my postcode?
          </button>
          <button type="button" onClick={() => checkout.send(E.ADDRESS.Confirm())}>
            Continue
          </button>
        </form>
      )}

      {challenge !== undefined && (
        <dialog open aria-label="Confirm with your bank">
          {dueAt !== null && (
            <p>This check expires in {Math.max(0, Math.ceil((dueAt - now) / 1_000))} s</p>
          )}
          {challenge === S.CHALLENGE.OPEN.EXPIRED && <p role="alert">Time's up.</p>}
          <button onClick={() => checkout.send(E.CHALLENGE.Help())}>Help</button>
        </dialog>
      )}

      <aside aria-label="Summary">
        <p>Total {money(memory.totalCents)}</p>
        {quote?.pending && <p>Finding delivery slots…</p>}
        {memory.summary.shipping !== null && (
          <p>Delivery {money(memory.summary.shipping.feeCents)}</p>
        )}
        {memory.summary.problem !== null && <p role="alert">{memory.summary.problem}</p>}
        <button
          disabled={canPay._tag !== "Allowed"}
          title={canPay._tag === "Denied" ? canPay.reasons[0]?.description : undefined}
          onClick={() => checkout.send(E.summary.PayPressed({ paymentMethodId }))}
        >
          Pay
        </button>
      </aside>

      {(unsure || stuck) && (
        <p role="status">
          We're confirming your payment with your bank. Don't pay again: you won't be charged twice.
          {stuck && <button onClick={() => checkout.send(E.CheckAgain())}>Check again</button>}
        </p>
      )}

      {memory.receipt !== null && (
        <section aria-label="Receipt">
          <h2>
            {memory.receipt.afterUnsure
              ? "Your bank confirmed the payment we were checking"
              : "Paid"}
          </h2>
          <p>Order {memory.receipt.orderId}</p>
          <button onClick={done}>Done</button>
        </section>
      )}

      <button onClick={() => checkout.send(E.Leave())}>Back to shop</button>
    </section>
  );
}
