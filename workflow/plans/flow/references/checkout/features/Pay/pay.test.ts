// The checkout's checks (`@flow-state/vitest`, proposed; cart.test.ts says what `at` is). The one property every
// test here circles: the card is charged at most once, and never reported "not charged" after a send that may
// have charged it.
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { check } from "flow-state";
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Stripe } from "../../testing/stripe.fake.js";
import { AddressStep } from "./address.subroutine.js";
import { OrderSummary } from "./order-summary.trait.js";
import { Pay } from "./pay.definition.js";
import {
  addressAlone,
  addressResumed,
  busyThenPaid,
  buyAgain,
  challengeAlone,
  challenged,
  declined,
  doubleClick,
  guestAddress,
  helpFrozen,
  lateChallenge,
  lateWhilePaying,
  neverArrived,
  overGuestLimit,
  paid,
  proxyRetried,
  rebindAcrossVersions,
  receiptAfterReload,
  reconciled,
  reloadMidCharge,
  twoTabs,
  VISA,
  voidedOnLeave,
  voidLostRace,
  webhookWins,
} from "./pay.story.js";
import { payRef } from "./pay.ref.js";

const { S, E, O } = Pay;

const pi = { intentId: "pi_1" };

const charges = (cut: {
  read: (x: typeof Stripe) => { shop: { charges: ReadonlyArray<{ status: string }> } };
}) => cut.read(Stripe).shop.charges;

storyTest(paid, ({ at }) => {
  expect(at.card.state).toBe(S.CARD); // signed in: no address step (F22)
  expect(at.paid.state).toBe(S.PAID);
  expect(at.paid.memory.receipt).toMatchObject({ afterUnsure: false, alreadyPlaced: false });
  expect(charges(at.paid)).toMatchObject([{ status: "captured" }]);
  const key = at.paid.read(Stripe.confirm)[0]?.input.key;
  expect(key).toBe(at.paid.read(Story.records("lane", { operation: O.pay }))[0]?.attempt.id); // attempt.id on the wire
});

storyTest(guestAddress, ({ at }) => {
  expect(at.address.state).toBe(S.ADDRESS);
  // One quote on the wire: the "N1" one was interrupted by "N1 9GU" (`cancel`, O8).
  expect(
    at["quote-replaced"].read(Story.records("ending", { operation: OrderSummary.O.shipping })),
  ).toContainEqual(expect.objectContaining({ channel: "unknown", reason: "Cancelled" }));
  expect(at["postcode-help"].memory.ADDRESS).toBeDefined();
  expect(AddressStep.S.FORM.history.child(at["postcode-help"].memory.ADDRESS)).toBe(
    AddressStep.S.FORM.POSTCODE,
  );
  expect(AddressStep.S.FORM.child(at["back-at-postcode"].memory.ADDRESS)).toBe(
    AddressStep.S.FORM.POSTCODE,
  ); // F9
  expect(at.card.state).toBe(S.CARD);
  expect(at.card.memory.summary.shipping?.postcode).toBe("N1 9GU");
});

storyTest(addressResumed, ({ at }) => {
  expect(at["left-mid-address"].memory.addressDraft.name).toBe("Ada Lovelace"); // whenAbandoned, same turn
  expect(at["address-resumed"].memory.ADDRESS?.address.name).toBe("Ada Lovelace");
});

storyTest(overGuestLimit, ({ at }) => {
  const verdict = check(at["over-guest-limit"], E.summary.PayPressed({ paymentMethodId: VISA }));
  expect(verdict).toMatchObject({
    _tag: "Denied",
    reasons: [
      { code: "GuestLimit", description: "Guests can pay up to $500. Sign in to pay more." },
    ],
  });
});

storyTest(doubleClick, ({ at }) => {
  expect(at["double-click"].read(Stripe.confirm)).toHaveLength(1);
  expect(at["double-click"].read(Story.records("ending", { operation: O.pay }))).toContainEqual(
    expect.objectContaining({ channel: "failure", reason: "NotSent", why: "Rejected" }),
  );
  expect(at["double-click"].state).toBe(S.PAYING); // nothing visible
  expect(at["paid-once"].state).toBe(S.PAID);
});

storyTest(proxyRetried, ({ at }) => {
  expect(at.paid.read(Stripe.confirm)).toHaveLength(2); // the wire sent it twice
  expect(charges(at.paid)).toHaveLength(1); // Stripe charged once
});

storyTest(busyThenPaid, ({ at }) => {
  expect(at["waiting-busy"].state).toBe(S.WAITING);
  expect(at["waiting-busy"].schedules.retry?.dueAt).toBeDefined();
  const keys = at["paid-after-busy"].read(Stripe.confirm).map((r) => r.input.key);
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]); // Busy is definite: a new write, a new id (rule 19)
  expect(at["paid-after-busy"].state).toBe(S.PAID);
});

storyTest(declined, ({ at }) => {
  expect(at.declined.state).toBe(S.CARD);
  expect(at.declined.memory.notice).toBe("Your card was declined (insufficient_funds).");
});

storyTest(challenged, ({ at }) => {
  expect(at["challenge-loading"].state).toBe(S.CHALLENGE.OPEN.BANK);
  expect(at["challenge-loading"].schedules.CHALLENGE?.countdown?.expire).toBeUndefined(); // not armed on entry (S3)
  expect(at.challenge.schedules.CHALLENGE?.countdown?.expire?.dueAt).toBeGreaterThan(0); // armed by BankShown
  expect(
    at["challenge-passed"].read(Story.records("exit", { instance: ["CHALLENGE"] })),
  ).toMatchObject([{ exit: "Passed", payload: { authId: "pi_1" } }]);
  expect(at["challenge-passed"].state).toBe(S.PAID);
});

storyTest(helpFrozen, ({ at }) => {
  expect(at["help-frozen"].state).toBe(S.CHALLENGE.HELP);
  // Frozen, deadline kept: nothing fired while help was open, though the deadline passed.
  expect(
    at["help-frozen"].read(Story.records("life", { instance: ["CHALLENGE", "countdown"] })),
  ).toContainEqual(expect.objectContaining({ life: "frozen" }));
  expect(at["challenge-timing-out"].state).toBe(S.CHALLENGE.OPEN.EXPIRED); // fired once on return (rule 1)
  expect(at["timed-out"].state).toBe(S.CARD);
});

storyTest(lateChallenge, ({ at }) => {
  expect(at["challenge-timing-out"].state).toBe(S.CHALLENGE.OPEN.EXPIRED);
  expect(at["timed-out"].memory.notice).toBe("The bank's check timed out. You can pay again.");
  expect(
    at["paid-after-timeout"].read(Story.records("ending", { operation: O.authenticate })),
  ).toContainEqual(
    expect.objectContaining({ channel: "success", routing: "late" }), // F11, O10
  );
  expect(at["paid-after-timeout"].state).toBe(S.PAID);
});

storyTest(lateWhilePaying, ({ at }) => {
  expect(at["late-stays-paying"].state).toBe(S.PAYING); // the late answer did not leave PAYING
  expect(at["late-stays-paying"].memory.authorized).toBe(true);
});

storyTest(reconciled, ({ at }) => {
  expect(at["pay-unsure"].state).toBe(S.UNSURE);
  expect(O.pay.get(at["pay-unsure"], pi)).toMatchObject({ uncertain: true });
  expect(at.reconciled.read(Stripe.confirm)).toHaveLength(1); // never re-sent: the read decided (O1)
  expect(at.reconciled.read(Stripe.intent)).toHaveLength(1);
  expect(O.pay.get(at.reconciled, pi)).toMatchObject({ pending: false, uncertain: false }); // released
  expect(at.reconciled.memory.receipt).toMatchObject({ afterUnsure: true });
  expect(charges(at.reconciled)).toHaveLength(1);
});

storyTest(neverArrived, ({ at }) => {
  const keys = at["resent-same-attempt"].read(Stripe.confirm).map((r) => r.input.key);
  expect(keys).toHaveLength(1); // the first never arrived
  expect(
    at["resent-same-attempt"].read(Story.records("lane", { operation: O.pay })),
  ).toContainEqual(
    expect.objectContaining({
      attempt: expect.objectContaining({ id: keys[0], retryCount: 1, mayHaveApplied: true }),
    }),
  );
  expect(at["resent-same-attempt"].state).toBe(S.PAID);
});

storyTest(webhookWins, ({ at }) => {
  const cut = at["webhook-confirmed"];
  expect(cut.state).toBe(S.PAID);
  expect(cut.read(Stripe).shop.orders.filter((o) => o.cartId === "cart-1")).toHaveLength(1); // twice delivered, once
  expect(cut.read(Story.records("ending", { operation: O.intent }))).toContainEqual(
    expect.objectContaining({ channel: "unknown", reason: "Cancelled" }), // the key-less cancel (R3)
  );
});

storyTest(voidedOnLeave, ({ at }) => {
  expect(at["voided-on-leave"].state).toBe(S.LEFT);
  expect(charges(at["voided-on-leave"])).toMatchObject([{ status: "voided" }]);
  expect(at["voided-on-leave"].memory.notice).toBe("The hold on your card was released.");
});

storyTest(voidLostRace, ({ at }) => {
  expect(
    at["void-still-unknown"].read(Story.records("ending", { operation: O.void })),
  ).toContainEqual(
    expect.objectContaining({
      channel: "unknown",
      reason: "StillUnknown",
      failure: expect.objectContaining({ _tag: "AlreadyCaptured" }),
    }),
  );
  expect(at["void-still-unknown"].memory.notice).toContain("couldn't confirm");
});

storyTest(buyAgain, ({ at }) => {
  expect(at["reset-waits"].memory.cartId).toBe("cart-1"); // refused: the quote is on the wire (F13)
  expect(at["reset-waits"].read(Story.records("verdict", { event: E.Start }))).toContainEqual(
    expect.objectContaining({
      denied: expect.arrayContaining([expect.objectContaining({ code: "InFlight" })]),
    }),
  );
  expect(at["summary-reset"].memory.cartId).toBe("cart-2");
  expect(at["summary-reset"].memory.summary.cartId).toBe("cart-2"); // a fresh summary
});

storyTest(reloadMidCharge, ({ at }) => {
  const cut = at["reload-mid-charge"].read(payRef);
  expect(cut?.state).toBe(S.CARD);
  expect(cut?.memory.notice).toBe("Your payment wasn't sent. You haven't been charged.");
  expect(at["reload-mid-charge"].read(Stripe.confirm)).toHaveLength(0); // P3
});

storyTest(receiptAfterReload, ({ at }) => {
  expect(at["restored-unsure"].read(payRef)?.state).toBe(S.UNSURE); // unknown { Restored }
  expect(at["receipt-after-reload"].read(payRef)?.memory.receipt).not.toBeNull(); // O14
  expect(charges(at["receipt-after-reload"])).toHaveLength(1);
});

storyTest(twoTabs, ({ at }) => {
  expect(at["two-tabs"].read(Stripe.confirm)).toHaveLength(2);
  expect(charges(at["two-tabs"])).toHaveLength(1);
  const notices = ["main", "b"].map(
    (tab) => at["two-tabs"].read({ actor: payRef, tab })?.memory.notice,
  );
  expect(notices).toContain("This payment changed elsewhere. Refresh to continue.");
});

storyTest(rebindAcrossVersions, ({ at }) => {
  expect(at["orphaned-resent"].read(Stripe.confirm).map((r) => r.input.key)).toEqual([
    "attempt-v1",
  ]); // same Attempt
});

storyTest(challengeAlone, ({ at }) => {
  expect(at.exited.read(Story.records("exit", { instance: [] }))).toMatchObject([
    { exit: "Passed", payload: { authId: "pi_1" } },
  ]);
  expect(Object.keys(at.exited.memory)).not.toContain("helpOpened"); // private (F19)
});

storyTest(addressAlone, ({ at }) => {
  expect(check(at["bad-postcode"], AddressStep.E.Confirm())).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "BadPostcode" }],
  });
});
