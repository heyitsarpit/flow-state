// The checkout's checks (machine-design 2.10.6). The one property every test here circles: the card is charged at
// most once, and never reported "not charged" after a send that may have charged it. Each test runs its Story once,
// destructures the checkpoints, and reads them with the runner's own `expect`.
import { check } from "flow-state";
import { expect, test } from "vite-plus/test";
import { Stripe } from "../../testing/stripe.fake.js";
import { AddressStep } from "./address.subroutine.js";
import { OrderSummary } from "./order-summary.trait.js";
import { Pay } from "./pay.definition.js";
import {
  addressAlone,
  bothTabsPay,
  busyThenPaid,
  buyAgain,
  cardDeclined,
  challengeAlone,
  challenged,
  doubleClicked,
  guestAddress,
  guestOverLimit,
  helpKeepsDeadline,
  lateChallenge,
  lateWhilePaying,
  leaveMidCharge,
  lostConfirm,
  neverArrived,
  paidFirstTime,
  proxyRetried,
  rebindAcrossVersions,
  reloadDuringCharge,
  reloadWhileConfirming,
  resumeAddress,
  VISA,
  voidLostRace,
  webhookWins,
} from "./pay.story.js";
import { payRef } from "./pay.ref.js";

const { S, E, O } = Pay;

const pi = { intentId: "pi_1" };

const charges = (cut: {
  read: (x: typeof Stripe) => { shop: { charges: ReadonlyArray<{ status: string }> } };
}) => cut.read(Stripe).shop.charges;

test("a signed-in customer pays once, straight from the card", async () => {
  const { card, paid } = (await paidFirstTime.run()).checkpoints;
  expect(card.state).toBe(S.CARD); // signed in: no address step (F22)
  expect(paid.state).toBe(S.PAID);
  expect(paid.memory.receipt).toMatchObject({ afterUnsure: false, alreadyPlaced: false });
  expect(charges(paid)).toMatchObject([{ status: "captured" }]);
  const key = paid.read(Stripe.confirm)[0]?.input.key;
  expect(key).toBeDefined(); // both sides reading `undefined` would otherwise agree
  expect(key).toBe(paid.attempt(O.pay)); // the Attempt's id is what went on the wire
});

test("a guest's address: one quote survives, help and back return to the field", async () => {
  const { address, quoteReplaced, postcodeHelp, backAtPostcode, card } = (await guestAddress.run())
    .checkpoints;
  expect(address.state).toBe(S.ADDRESS);
  // One quote on the wire: the "N1" one was interrupted by "N1 9GU" (`cancel`, O8).
  expect(quoteReplaced.records("ending", { operation: OrderSummary.O.shipping })).toContainEqual(
    expect.objectContaining({
      channel: "unknown",
      reason: expect.objectContaining({ _tag: "Cancelled" }),
    }),
  );
  expect(postcodeHelp.memory.ADDRESS).toBeDefined();
  expect(AddressStep.S.FORM.history.child(postcodeHelp.memory.ADDRESS)).toBe(
    AddressStep.S.FORM.POSTCODE,
  );
  expect(AddressStep.S.FORM.child(backAtPostcode.memory.ADDRESS)).toBe(AddressStep.S.FORM.POSTCODE); // F9
  expect(card.state).toBe(S.CARD);
  expect(card.memory.summary.shipping?.postcode).toBe("N1 9GU");
});

test("leaving mid-address hands the draft back, and starting again resumes it", async () => {
  const { leftMidAddress, addressResumed } = (await resumeAddress.run()).checkpoints;
  expect(leftMidAddress.memory.addressDraft.name).toBe("Ada Lovelace"); // whenAbandoned, same turn
  expect(addressResumed.memory.ADDRESS?.address.name).toBe("Ada Lovelace");
});

test("a guest over the limit is told why", async () => {
  const { overGuestLimit } = (await guestOverLimit.run()).checkpoints;
  const verdict = check(overGuestLimit.read(), E.summary.PayPressed({ paymentMethodId: VISA }));
  expect(verdict).toMatchObject({
    _tag: "Denied",
    reasons: [
      { code: "GuestLimit", description: "Guests can pay up to $500. Sign in to pay more." },
    ],
  });
});

test("a double click sends one confirm", async () => {
  const { doubleClick, paidOnce } = (await doubleClicked.run()).checkpoints;
  expect(doubleClick.read(Stripe.confirm)).toHaveLength(1);
  expect(doubleClick.records("ending", { operation: O.pay })).toContainEqual(
    expect.objectContaining({
      channel: "failure",
      reason: expect.objectContaining({ _tag: "NotSent", why: "Rejected" }),
    }),
  );
  expect(doubleClick.state).toBe(S.PAYING); // nothing visible
  expect(paidOnce.state).toBe(S.PAID);
});

test("a proxy that re-sends the confirm charges once", async () => {
  const { paid } = (await proxyRetried.run()).checkpoints;
  expect(paid.read(Stripe.confirm)).toHaveLength(2); // the wire sent it twice
  expect(charges(paid)).toHaveLength(1); // Stripe charged once
});

test("busy is definite: wait as asked, then a new write", async () => {
  const { waitingBusy, paidAfterBusy } = (await busyThenPaid.run()).checkpoints;
  expect(waitingBusy.state).toBe(S.WAITING);
  expect(waitingBusy.schedules.retry?.dueAt).toBeDefined();
  const keys = paidAfterBusy.read(Stripe.confirm).map((r) => r.input.key);
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]); // Busy is definite: a new write, a new id (rule 19)
  expect(paidAfterBusy.state).toBe(S.PAID);
});

test("a declined card says so and stays on the card", async () => {
  const { declined } = (await cardDeclined.run()).checkpoints;
  expect(declined.state).toBe(S.CARD);
  expect(declined.memory.notice).toBe("Your card was declined (insufficient_funds).");
});

test("the countdown starts when the bank's frame is shown, and the challenge passes", async () => {
  const { challengeLoading, challenge, challengePassed } = (await challenged.run()).checkpoints;
  expect(challengeLoading.state).toBe(S.CHALLENGE.OPEN.BANK);
  expect(challengeLoading.schedules.CHALLENGE?.countdown?.expire).toBeUndefined(); // not armed on entry (S3)
  expect(challenge.schedules.CHALLENGE?.countdown?.expire?.dueAt).toBeGreaterThan(0); // armed by BankShown
  expect(challengePassed.records("exit", { instance: ["CHALLENGE"] })).toMatchObject([
    { name: "Passed", payload: { authId: "pi_1" } },
  ]);
  expect(challengePassed.state).toBe(S.PAID);
});

test("help freezes the countdown but keeps its deadline", async () => {
  const { helpFrozen, challengeTimingOut, timedOut } = (await helpKeepsDeadline.run()).checkpoints;
  expect(helpFrozen.state).toBe(S.CHALLENGE.HELP);
  // Frozen, deadline kept: nothing fired while help was open, though the deadline passed.
  expect(helpFrozen.records("life", { instance: ["CHALLENGE", "countdown"] })).toContainEqual(
    expect.objectContaining({ change: "frozen" }),
  );
  expect(challengeTimingOut.state).toBe(S.CHALLENGE.OPEN.EXPIRED); // fired once on return (rule 1)
  expect(timedOut.state).toBe(S.CARD);
});

test("a challenge finished after the checkout stopped waiting still places the order", async () => {
  const { challengeTimingOut, timedOut, paidAfterTimeout } = (await lateChallenge.run())
    .checkpoints;
  expect(challengeTimingOut.state).toBe(S.CHALLENGE.OPEN.EXPIRED);
  expect(timedOut.memory.notice).toBe("The bank's check timed out. You can pay again.");
  expect(paidAfterTimeout.records("ending", { operation: O.authenticate })).toContainEqual(
    expect.objectContaining({
      channel: "success",
      route: expect.objectContaining({ kind: "late" }),
    }), // F11, O10
  );
  expect(paidAfterTimeout.state).toBe(S.PAID);
});

test("a late challenge answer does not leave PAYING", async () => {
  const { lateStaysPaying } = (await lateWhilePaying.run()).checkpoints;
  expect(lateStaysPaying.state).toBe(S.PAYING); // the late answer did not leave PAYING
  expect(lateStaysPaying.memory.authorized).toBe(true);
});

test("a lost confirm answer is reconciled by reading the intent, never re-sent", async () => {
  const { payUnsure, reconciled } = (await lostConfirm.run()).checkpoints;
  expect(payUnsure.state).toBe(S.UNSURE);
  // Still unsure: the lane exists and is uncertain. A wrong key would read `undefined` and fail here.
  expect(payUnsure.lane(O.pay, pi)).toMatchObject({ uncertain: true });
  expect(reconciled.read(Stripe.confirm)).toHaveLength(1); // never re-sent: the read decided (O1)
  expect(reconciled.read(Stripe.intent)).toHaveLength(1);
  // Released: the lane is gone, and the design's own read says nothing is pending or unsure (idle row).
  expect(reconciled.lane(O.pay, pi)).toBeUndefined();
  expect(O.pay.get(reconciled.read()!, pi)).toMatchObject({ pending: false, uncertain: false });
  expect(reconciled.memory.receipt).toMatchObject({ afterUnsure: true });
  expect(charges(reconciled)).toHaveLength(1);
});

test("a confirm lost on the way out is sent again as the same Attempt", async () => {
  const { resentSameAttempt } = (await neverArrived.run()).checkpoints;
  const keys = resentSameAttempt.read(Stripe.confirm).map((r) => r.input.key);
  expect(keys).toHaveLength(1); // the first never arrived
  expect(resentSameAttempt.records("lane", { operation: O.pay })).toContainEqual(
    expect.objectContaining({
      attempt: expect.objectContaining({ id: keys[0], retryCount: 1, mayHaveApplied: true }),
    }),
  );
  expect(resentSameAttempt.state).toBe(S.PAID);
});

test("the webhook is a second witness: delivered twice, the order is placed once", async () => {
  const { webhookConfirmed } = (await webhookWins.run()).checkpoints;
  expect(webhookConfirmed.state).toBe(S.PAID);
  expect(
    webhookConfirmed.read(Stripe).shop.orders.filter((o) => o.cartId === "cart-1"),
  ).toHaveLength(1); // twice delivered, once
  expect(webhookConfirmed.records("ending", { operation: O.intent })).toContainEqual(
    expect.objectContaining({
      channel: "unknown",
      reason: expect.objectContaining({ _tag: "Cancelled" }),
    }), // the key-less cancel (R3)
  );
});

test("leaving while the confirm is on the wire voids the authorization", async () => {
  const { voidedOnLeave } = (await leaveMidCharge.run()).checkpoints;
  expect(voidedOnLeave.state).toBe(S.LEFT);
  expect(charges(voidedOnLeave)).toMatchObject([{ status: "voided" }]);
  expect(voidedOnLeave.memory.notice).toBe("The hold on your card was released.");
});

test("a void that lost the race stays unknown, and nobody says the hold is gone", async () => {
  const { voidStillUnknown } = (await voidLostRace.run()).checkpoints;
  expect(voidStillUnknown.records("ending", { operation: O.void })).toContainEqual(
    expect.objectContaining({
      channel: "unknown",
      reason: expect.objectContaining({
        _tag: "StillUnknown",
        failure: expect.objectContaining({ _tag: "AlreadyCaptured" }),
      }),
    }),
  );
  expect(voidStillUnknown.memory.notice).toContain("couldn't confirm");
});

test("buy again waits for the old quote, then the summary is fresh", async () => {
  const { resetWaits, summaryReset } = (await buyAgain.run()).checkpoints;
  expect(resetWaits.memory.cartId).toBe("cart-1"); // refused: the quote is on the wire (F13)
  expect(resetWaits.records("verdict", { event: E.Start })).toContainEqual(
    expect.objectContaining({
      result: expect.objectContaining({
        _tag: "Denied",
        reasons: [expect.objectContaining({ code: "InFlight" })],
      }),
    }),
  );
  expect(summaryReset.memory.cartId).toBe("cart-2");
  expect(summaryReset.memory.summary.cartId).toBe("cart-2"); // a fresh summary
});

test("a reload before the confirm left says you were not charged", async () => {
  const { reloadMidCharge } = (await reloadDuringCharge.run()).checkpoints;
  const checkout = reloadMidCharge.read(payRef);
  expect(checkout).toBeDefined(); // `?.` below would pass on a missing actor
  expect(checkout?.state).toBe(S.CARD);
  expect(checkout?.memory.notice).toBe("Your payment wasn't sent. You haven't been charged.");
  expect(reloadMidCharge.read(Stripe.confirm)).toHaveLength(0); // P3
});

test("a reload with the confirm on the wire restores it unsure and shows the receipt", async () => {
  const { restoredUnsure, receiptAfterReload } = (await reloadWhileConfirming.run()).checkpoints;
  expect(restoredUnsure.read(payRef)?.state).toBe(S.UNSURE); // unknown { Restored }
  const reopened = receiptAfterReload.read(payRef);
  expect(reopened).toBeDefined(); // `?.` below would pass on a missing actor
  expect(reopened?.memory.receipt).toBeDefined(); // `not.toBeNull` alone passes on `undefined`
  expect(reopened?.memory.receipt).not.toBeNull(); // O14
  expect(charges(receiptAfterReload)).toHaveLength(1);
});

test("two tabs pressing Pay charge once", async () => {
  const { twoTabs } = (await bothTabsPay.run()).checkpoints;
  expect(twoTabs.read(Stripe.confirm)).toHaveLength(2);
  expect(charges(twoTabs)).toHaveLength(1);
  const notices = ["main", "b"].map((tab) => twoTabs.read({ actor: payRef, tab })?.memory.notice);
  expect(notices).toContain("This payment changed elsewhere. Refresh to continue.");
});

test("a lane stored by an older build is re-sent as the same Attempt", async () => {
  const { orphanedResent } = (await rebindAcrossVersions.run()).checkpoints;
  expect(orphanedResent.read(Stripe.confirm).map((r) => r.input.key)).toEqual(["attempt-v1"]); // same Attempt
});

test("the challenge alone exits Passed with the host's authId", async () => {
  const { bankShown, exited } = (await challengeAlone.run()).checkpoints;
  expect(exited.records("exit", { instance: [] })).toMatchObject([
    { name: "Passed", payload: { authId: "pi_1" } },
  ]);
  // Memory is read before the exit: after it the subroutine is `Ended` and `memory` throws `SubjectAbsent`.
  // design gap: a Story reads a fragment's private fields (2.2.2), so F19's "private stays out of every host's
  // reach" has no Story read; the nearest is to say the Story sees the counter.
  expect(bankShown.memory).toMatchObject({ intentId: "pi_1", helpOpened: 0 });
});

test("the address step denies a bad postcode", async () => {
  const { badPostcode } = (await addressAlone.run()).checkpoints;
  expect(check(badPostcode.read(), AddressStep.E.Confirm())).toMatchObject({
    _tag: "Denied",
    reasons: [{ code: "BadPostcode" }],
  });
});
