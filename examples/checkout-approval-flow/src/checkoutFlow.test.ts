import { describe, expect, it } from "vite-plus/test";

import { flowTest } from "@flow-state/core";

import {
  approvalReasonInvariant,
  approvePermission,
  checkoutMachine,
  checkoutPaths,
  checkoutPersistence,
  checkoutStateIds,
  checkoutWorkflowDescriptor,
  defaultCheckoutContext,
  evaluateCheckoutInvariants,
  evaluatePermission,
  managerApprover,
  rejectPermission,
  selectCheckoutSummary,
  viewerApprover,
} from "./checkoutFlow";

function createCheckoutHarness() {
  return flowTest(checkoutMachine);
}

type CheckoutHarness = ReturnType<typeof createCheckoutHarness>;

function submitForReview(harness: CheckoutHarness): CheckoutHarness {
  return harness.send({ type: "SUBMIT_FOR_REVIEW" });
}

function assignManager(harness: CheckoutHarness): CheckoutHarness {
  return harness.send({ type: "SET_APPROVER", approver: managerApprover });
}

function addReason(
  harness: CheckoutHarness,
  reason = "Budget owner approved the workspace refresh.",
) {
  return harness.send({ type: "UPDATE_APPROVAL_REASON", reason });
}

describe("Example 4 Checkout Approval Flow", () => {
  it("describes the nested workflow API shape while keeping runtime states flat", () => {
    const reviewState = checkoutMachine.config.states[checkoutStateIds.review];
    const permissions = Array.isArray(reviewState.permissions)
      ? reviewState.permissions
      : [reviewState.permissions];
    const invariants = Array.isArray(reviewState.invariants)
      ? reviewState.invariants
      : [reviewState.invariants];

    expect(checkoutPaths.reviewPending).toMatchObject({
      kind: "statePath",
      id: "checkout.review.pending",
      segments: ["checkout", "review", "pending"],
    });
    expect(checkoutWorkflowDescriptor.schema.context.kind).toBe("schema");
    expect(checkoutWorkflowDescriptor.schema.commands.config.commands).toContain(
      "APPROVE_CHECKOUT",
    );
    expect(checkoutMachine.config.persist).toBe(checkoutPersistence);
    expect(reviewState).toMatchObject({
      type: "compound",
      initial: "checkout.review.pending",
      history: {
        kind: "history",
      },
    });
    expect(reviewState.states?.[checkoutPaths.reviewHistory.id]).toMatchObject({
      type: "history",
      history: checkoutWorkflowDescriptor.history,
    });
    expect(permissions.map((permission) => permission?.id)).toEqual([
      approvePermission.id,
      rejectPermission.id,
    ]);
    expect(approvePermission).toMatchObject({
      path: checkoutPaths.review,
      event: "APPROVE_CHECKOUT",
      description: "Approver can approve checkout only after a review reason is present.",
      meta: {
        commandLabel: "Approve",
        denialSurface: "review-panel",
      },
    });
    expect(invariants.map((invariant) => invariant?.id)).toEqual([approvalReasonInvariant.id]);
    expect(approvalReasonInvariant).toMatchObject({
      path: checkoutPaths.review,
      description: "Review states require an auditable approval or rejection reason.",
      meta: {
        owner: "approval",
      },
    });
  });

  it("runs the happy path from draft to review to approved", () => {
    const harness = createCheckoutHarness().clock(() => 1_717_171_717);

    expect(harness.state()).toBe(checkoutStateIds.draft);
    expect(harness.can({ type: "SUBMIT_FOR_REVIEW" })).toBe(true);
    expect(selectCheckoutSummary(harness.context())).toMatchObject({
      itemCount: 3,
      totalCents: 135_000,
      needsApproval: true,
    });

    submitForReview(harness);
    expect(harness.state()).toBe(checkoutStateIds.review);
    expect(harness.context()).toMatchObject({
      submittedAt: 1_717_171_717,
      lastReviewState: checkoutPaths.reviewPending.id,
    });
    expect(harness.can({ type: "APPROVE_CHECKOUT" })).toBe(false);

    assignManager(harness);
    addReason(harness, "  Finance   approved the cart. ");

    expect(harness.can({ type: "APPROVE_CHECKOUT" })).toBe(true);
    harness.send({ type: "APPROVE_CHECKOUT" });

    expect(harness.state()).toBe(checkoutStateIds.approved);
    expect(harness.context().decision).toEqual({
      kind: "approved",
      reason: "Finance approved the cart.",
      approverId: managerApprover.id,
      decidedAt: 1_717_171_717,
    });
  });

  it("runs the rejection path with the same approval surface", () => {
    const harness = createCheckoutHarness().clock(() => 404);

    submitForReview(harness);
    assignManager(harness);
    addReason(harness, "Total exceeds the quarterly equipment limit.");
    harness.send({ type: "REJECT_CHECKOUT" });

    expect(harness.state()).toBe(checkoutStateIds.rejected);
    expect(harness.context().decision).toMatchObject({
      kind: "rejected",
      reason: "Total exceeds the quarterly equipment limit.",
      approverId: managerApprover.id,
      decidedAt: 404,
    });
  });

  it("supports draft back navigation and a restore-ish return to review", () => {
    const harness = submitForReview(createCheckoutHarness());

    expect(harness.state()).toBe(checkoutStateIds.review);
    harness.send({ type: "RETURN_TO_DRAFT" });

    expect(harness.state()).toBe(checkoutStateIds.draft);
    expect(harness.context().lastReviewState).toBe(checkoutPaths.reviewPending.id);
    expect(harness.can({ type: "RESTORE_REVIEW" })).toBe(true);

    harness.send({ type: "RESTORE_REVIEW" });
    expect(harness.state()).toBe(checkoutStateIds.review);
  });

  it("denies approval when the assigned actor lacks approval permission", () => {
    const harness = submitForReview(createCheckoutHarness())
      .send({ type: "SET_APPROVER", approver: viewerApprover })
      .send({
        type: "UPDATE_APPROVAL_REASON",
        reason: "Requester added a clear justification.",
      });
    const beforeApproval = harness.snapshot();
    const decision = evaluatePermission(approvePermission, harness.snapshot(), {
      type: "APPROVE_CHECKOUT",
    });

    expect(decision).toEqual({
      allowed: false,
      reason: "Assign an approver with checkout:approve before approving.",
    });
    expect(harness.can({ type: "APPROVE_CHECKOUT" })).toBe(false);

    harness.send({ type: "APPROVE_CHECKOUT" });
    expect(harness.snapshot()).toBe(beforeApproval);
    expect(harness.state()).toBe(checkoutStateIds.review);
    expect(harness.context().decision).toBeNull();
  });

  it("evaluates invariant helpers for invalid totals and missing review reasons", () => {
    const invalidTotalHarness = createCheckoutHarness().start({
      context: {
        items: [
          {
            id: "desk",
            name: "Standing desk",
            unitPriceCents: 72_000,
            quantity: -2,
          },
        ],
      },
    });

    expect(evaluateCheckoutInvariants(invalidTotalHarness.snapshot())).toContainEqual({
      id: "checkout.invariant.non-negative-total",
      ok: false,
      message: "Checkout total cannot be negative.",
      severity: "error",
    });

    const reviewHarness = submitForReview(createCheckoutHarness());
    expect(evaluateCheckoutInvariants(reviewHarness.snapshot())).toContainEqual({
      id: "checkout.invariant.approval-reason",
      ok: false,
      message: "Approval or rejection requires a review reason.",
      severity: "error",
    });

    addReason(reviewHarness, "Approver reviewed spend.");
    expect(evaluateCheckoutInvariants(reviewHarness.snapshot()).every((result) => result.ok)).toBe(
      true,
    );
  });

  it("sketches the persistence contract with versioned select, redact, and migrate hooks", () => {
    const harness = submitForReview(createCheckoutHarness());
    const selected = checkoutPersistence.config.select(harness.snapshot());
    const redacted = checkoutPersistence.config.redact(selected);
    const migrated = checkoutPersistence.config.migrate(
      {
        value: checkoutStateIds.review,
        context: {
          customer: defaultCheckoutContext.customer,
        },
      },
      1,
    );

    expect(selected).toMatchObject({
      value: checkoutStateIds.review,
      context: {
        customer: {
          email: "ops@northwind.example",
        },
      },
    });
    expect(redacted).toMatchObject({
      context: {
        customer: {
          email: "[redacted]",
        },
      },
    });
    expect(migrated).toMatchObject({
      context: {
        lastReviewState: null,
      },
    });
  });
});
