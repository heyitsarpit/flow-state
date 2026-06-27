import {
  createStatePath,
  flow,
  type FlowEvent,
  type FlowInvariantDefinition,
  type FlowPermissionDecision,
  type FlowPermissionDefinition,
  type FlowRuntimeEnvironment,
  type FlowSnapshot,
  type FlowTransitionArgs,
} from "@flow-state/core";

export const checkoutPaths = {
  root: createStatePath("checkout"),
  draft: createStatePath("checkout", "draft"),
  review: createStatePath("checkout", "review"),
  reviewPending: createStatePath("checkout", "review", "pending"),
  reviewHistory: createStatePath("checkout", "review", "$history"),
  approved: createStatePath("checkout", "approved"),
  rejected: createStatePath("checkout", "rejected"),
} as const;

export const checkoutStateIds = {
  draft: checkoutPaths.draft.id as "checkout.draft",
  review: checkoutPaths.review.id as "checkout.review",
  approved: checkoutPaths.approved.id as "checkout.approved",
  rejected: checkoutPaths.rejected.id as "checkout.rejected",
} as const;

export type CheckoutState = (typeof checkoutStateIds)[keyof typeof checkoutStateIds];
export type CheckoutPermission = "checkout:approve" | "checkout:reject";

export interface CheckoutItem {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
}

export interface CheckoutCustomer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly tier: "standard" | "vip";
}

export interface CheckoutApprover {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly CheckoutPermission[];
}

export interface CheckoutDecision {
  readonly kind: "approved" | "rejected";
  readonly reason: string;
  readonly approverId: string;
  readonly decidedAt: number;
}

export interface CheckoutContext {
  readonly customer: CheckoutCustomer;
  readonly items: readonly CheckoutItem[];
  readonly approvalThresholdCents: number;
  readonly approvalReason: string;
  readonly approver: CheckoutApprover | null;
  readonly decision: CheckoutDecision | null;
  readonly submittedAt: number | null;
  readonly lastReviewState: string | null;
}

export type CheckoutEvent =
  | ({
      readonly type: "UPDATE_ITEM_QUANTITY";
      readonly itemId: string;
      readonly quantity: number;
    } & FlowEvent)
  | ({ readonly type: "SET_APPROVER"; readonly approver: CheckoutApprover | null } & FlowEvent)
  | ({ readonly type: "UPDATE_APPROVAL_REASON"; readonly reason: string } & FlowEvent)
  | ({ readonly type: "SUBMIT_FOR_REVIEW" } & FlowEvent)
  | ({ readonly type: "RETURN_TO_DRAFT" } & FlowEvent)
  | ({ readonly type: "RESTORE_REVIEW" } & FlowEvent)
  | ({ readonly type: "APPROVE_CHECKOUT" } & FlowEvent)
  | ({ readonly type: "REJECT_CHECKOUT" } & FlowEvent);

export type CheckoutSnapshot = FlowSnapshot<CheckoutContext, CheckoutState>;
type CheckoutArgs = FlowTransitionArgs<CheckoutContext, CheckoutEvent, CheckoutState>;

export interface CheckoutSummary {
  readonly itemCount: number;
  readonly totalCents: number;
  readonly needsApproval: boolean;
  readonly approvalReady: boolean;
}

export interface CheckoutInvariantResult {
  readonly id: string;
  readonly ok: boolean;
  readonly message: string;
  readonly severity: "error" | "warning";
}

const checkoutRuntime: FlowRuntimeEnvironment = {
  now: () => 0,
};

export const managerApprover: CheckoutApprover = {
  id: "mgr-1",
  name: "Mira Shah",
  permissions: ["checkout:approve", "checkout:reject"],
};

export const viewerApprover: CheckoutApprover = {
  id: "viewer-1",
  name: "Dev Readonly",
  permissions: [],
};

export const defaultCheckoutContext: CheckoutContext = {
  customer: {
    id: "cust-42",
    name: "Northwind Studio",
    email: "ops@northwind.example",
    tier: "vip",
  },
  items: [
    {
      id: "desk",
      name: "Standing desk",
      quantity: 1,
      unitPriceCents: 72_000,
    },
    {
      id: "chair",
      name: "Ergonomic chair",
      quantity: 2,
      unitPriceCents: 31_500,
    },
  ],
  approvalThresholdCents: 100_000,
  approvalReason: "",
  approver: null,
  decision: null,
  submittedAt: null,
  lastReviewState: null,
};

export const checkoutContextSchema = flow.schema({
  id: "checkout.context",
  version: 1,
  path: checkoutPaths.root.id,
  fields: {
    customer: "redacted customer identity",
    items: "reviewed cart lines",
    approvalReason: "required before approval or rejection",
    approver: "actor used by permission descriptors",
  },
});

export const checkoutCommandSchema = flow.schema({
  id: "checkout.commands",
  version: 1,
  commands: [
    "SUBMIT_FOR_REVIEW",
    "RETURN_TO_DRAFT",
    "RESTORE_REVIEW",
    "APPROVE_CHECKOUT",
    "REJECT_CHECKOUT",
  ],
});

export const checkoutReviewHistory = flow.history({
  id: "checkout.review.history",
  path: checkoutPaths.review.id,
  kind: "shallow",
  default: checkoutPaths.reviewPending.id,
});

export const checkoutPersistence = flow.persist({
  id: "checkout.snapshot",
  version: 2,
  select: (snapshot: CheckoutSnapshot) => ({
    value: snapshot.value,
    context: snapshot.context,
  }),
  redact: (value: unknown) => redactPersistedCheckout(value),
  migrate: (value: unknown, fromVersion: number) =>
    fromVersion < 2 ? migrateLegacyCheckoutSnapshot(value) : value,
});

export const checkoutViews = {
  summary: flow.view<CheckoutContext, CheckoutState, CheckoutSummary>({
    id: "checkout.summary",
    sources: ["context"],
    meta: {
      path: checkoutPaths.root.id,
    },
    select: ({ context }) => selectCheckoutSummary(context),
  }),
  approvalPanel: flow.view<
    CheckoutContext,
    CheckoutState,
    {
      readonly reason: string;
      readonly approver: string;
      readonly decision: CheckoutDecision | null;
    }
  >({
    id: "checkout.approval-panel",
    sources: ["context"],
    meta: {
      path: checkoutPaths.review.id,
    },
    select: ({ context }) => ({
      reason: context.approvalReason,
      approver: context.approver?.name ?? "Unassigned",
      decision: context.decision,
    }),
  }),
};

export const approvePermission = flow.permission<CheckoutContext, CheckoutEvent, CheckoutState>({
  id: "checkout.permission.approve",
  description: "Approver can approve checkout only after a review reason is present.",
  path: checkoutPaths.review,
  event: "APPROVE_CHECKOUT",
  meta: {
    commandLabel: "Approve",
    denialSurface: "review-panel",
  },
  check: ({ context }) =>
    hasPermission(context.approver, "checkout:approve")
      ? { allowed: true }
      : {
          allowed: false,
          reason: "Assign an approver with checkout:approve before approving.",
        },
});

export const rejectPermission = flow.permission<CheckoutContext, CheckoutEvent, CheckoutState>({
  id: "checkout.permission.reject",
  description: "Approver can reject checkout only after a review reason is present.",
  path: checkoutPaths.review,
  event: "REJECT_CHECKOUT",
  meta: {
    commandLabel: "Reject",
    denialSurface: "review-panel",
  },
  check: ({ context }) =>
    hasPermission(context.approver, "checkout:reject")
      ? { allowed: true }
      : {
          allowed: false,
          reason: "Assign an approver with checkout:reject before rejecting.",
        },
});

export const nonNegativeTotalInvariant = flow.invariant<
  CheckoutContext,
  CheckoutEvent,
  CheckoutState
>({
  id: "checkout.invariant.non-negative-total",
  description: "Cart math must stay inside the valid checkout domain.",
  path: checkoutPaths.root,
  meta: {
    owner: "cart",
  },
  message: "Checkout total cannot be negative.",
  severity: "error",
  check: ({ context }) => selectCheckoutSummary(context).totalCents >= 0,
});

export const approvalReasonInvariant = flow.invariant<
  CheckoutContext,
  CheckoutEvent,
  CheckoutState
>({
  id: "checkout.invariant.approval-reason",
  description: "Review states require an auditable approval or rejection reason.",
  path: checkoutPaths.review,
  meta: {
    owner: "approval",
  },
  message: "Approval or rejection requires a review reason.",
  severity: "error",
  check: ({ context, snapshot }) =>
    snapshot.value !== checkoutStateIds.review ||
    normalizeReason(context.approvalReason).length > 0,
});

export const checkoutWorkflowDescriptor = {
  path: checkoutPaths.root,
  schema: {
    context: checkoutContextSchema,
    commands: checkoutCommandSchema,
  },
  history: checkoutReviewHistory,
  persist: checkoutPersistence,
  views: checkoutViews,
};

export const checkoutMachine = flow.machine<CheckoutContext, CheckoutEvent, CheckoutState>({
  id: "example-4-checkout-approval-flow",
  initial: checkoutStateIds.draft,
  context: () => defaultCheckoutContext,
  persist: checkoutPersistence,
  invariants: [nonNegativeTotalInvariant],
  states: {
    [checkoutStateIds.draft]: {
      type: "atomic",
      on: {
        UPDATE_ITEM_QUANTITY: {
          update: updateItemQuantity,
        },
        SET_APPROVER: {
          update: setApprover,
        },
        UPDATE_APPROVAL_REASON: {
          update: setApprovalReason,
        },
        SUBMIT_FOR_REVIEW: {
          target: checkoutStateIds.review,
          guard: readyForReview,
          update: submitForReview,
        },
        RESTORE_REVIEW: {
          target: checkoutStateIds.review,
          guard: hasReviewHistory,
        },
      },
    },
    [checkoutStateIds.review]: {
      type: "compound",
      initial: checkoutPaths.reviewPending.id,
      states: {
        [checkoutPaths.reviewPending.id]: {
          type: "atomic",
          permissions: [approvePermission, rejectPermission],
          invariants: [approvalReasonInvariant],
        },
        [checkoutPaths.reviewHistory.id]: {
          type: "history",
          history: checkoutReviewHistory,
        },
      },
      history: checkoutReviewHistory,
      permissions: [approvePermission, rejectPermission],
      invariants: [approvalReasonInvariant],
      on: {
        SET_APPROVER: {
          update: setApprover,
        },
        UPDATE_APPROVAL_REASON: {
          update: setApprovalReason,
        },
        RETURN_TO_DRAFT: {
          target: checkoutStateIds.draft,
          update: rememberReview,
        },
        APPROVE_CHECKOUT: {
          target: checkoutStateIds.approved,
          guard: canApproveCheckout,
          update: approveCheckout,
        },
        REJECT_CHECKOUT: {
          target: checkoutStateIds.rejected,
          guard: canRejectCheckout,
          update: rejectCheckout,
        },
      },
    },
    [checkoutStateIds.approved]: {
      type: "final",
      on: {
        RETURN_TO_DRAFT: {
          target: checkoutStateIds.draft,
          update: clearDecision,
        },
      },
    },
    [checkoutStateIds.rejected]: {
      type: "final",
      on: {
        RETURN_TO_DRAFT: {
          target: checkoutStateIds.draft,
          update: clearDecision,
        },
      },
    },
  },
});

export function selectCheckoutSummary(context: CheckoutContext): CheckoutSummary {
  const totalCents = context.items.reduce(
    (total, item) => total + item.quantity * item.unitPriceCents,
    0,
  );
  const itemCount = context.items.reduce((total, item) => total + Math.max(item.quantity, 0), 0);
  const needsApproval = totalCents >= context.approvalThresholdCents;

  return {
    itemCount,
    totalCents,
    needsApproval,
    approvalReady:
      needsApproval &&
      normalizeReason(context.approvalReason).length > 0 &&
      hasPermission(context.approver, "checkout:approve"),
  };
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function checkoutStatusLabel(snapshot: CheckoutSnapshot): string {
  return flow.match(snapshot, {
    [checkoutStateIds.draft]: () => "Draft",
    [checkoutStateIds.review]: () => "In review",
    [checkoutStateIds.approved]: () => "Approved",
    [checkoutStateIds.rejected]: () => "Rejected",
    _: () => "Checkout",
  });
}

export function evaluatePermission(
  permission: FlowPermissionDefinition<CheckoutContext, CheckoutEvent, CheckoutState>,
  snapshot: CheckoutSnapshot,
  event: CheckoutEvent,
): FlowPermissionDecision {
  return normalizeDecision(
    permission.check({
      context: snapshot.context,
      event,
      snapshot,
      runtime: checkoutRuntime,
    }),
  );
}

export function evaluateCheckoutInvariants(
  snapshot: CheckoutSnapshot,
  event: CheckoutEvent = { type: "SUBMIT_FOR_REVIEW" },
): readonly CheckoutInvariantResult[] {
  return [
    nonNegativeTotalInvariant,
    ...(snapshot.value === checkoutStateIds.review ? [approvalReasonInvariant] : []),
  ].map((invariant) => evaluateInvariant(invariant, snapshot, event));
}

function evaluateInvariant(
  invariant: FlowInvariantDefinition<CheckoutContext, CheckoutEvent, CheckoutState>,
  snapshot: CheckoutSnapshot,
  event: CheckoutEvent,
): CheckoutInvariantResult {
  return {
    id: invariant.id,
    ok: invariant.check({
      context: snapshot.context,
      event,
      snapshot,
      runtime: checkoutRuntime,
    }),
    message: invariant.message,
    severity: invariant.severity ?? "error",
  };
}

function readyForReview({ context }: CheckoutArgs): boolean {
  const summary = selectCheckoutSummary(context);
  return summary.itemCount > 0 && summary.totalCents >= 0;
}

function hasReviewHistory({ context }: CheckoutArgs): boolean {
  return context.lastReviewState === checkoutPaths.reviewPending.id;
}

function canApproveCheckout(args: CheckoutArgs): boolean {
  return (
    normalizeDecision(approvePermission.check(args)).allowed && approvalReasonInvariant.check(args)
  );
}

function canRejectCheckout(args: CheckoutArgs): boolean {
  return (
    normalizeDecision(rejectPermission.check(args)).allowed && approvalReasonInvariant.check(args)
  );
}

function updateItemQuantity({
  context,
  event,
}: CheckoutArgs): Partial<CheckoutContext> | CheckoutContext {
  if (event.type !== "UPDATE_ITEM_QUANTITY") {
    return context;
  }

  return {
    decision: null,
    items: context.items.map((item) =>
      item.id === event.itemId ? { ...item, quantity: event.quantity } : item,
    ),
  };
}

function setApprover({ context, event }: CheckoutArgs): Partial<CheckoutContext> | CheckoutContext {
  if (event.type !== "SET_APPROVER") {
    return context;
  }

  return {
    approver: event.approver,
    decision: null,
  };
}

function setApprovalReason({
  context,
  event,
}: CheckoutArgs): Partial<CheckoutContext> | CheckoutContext {
  if (event.type !== "UPDATE_APPROVAL_REASON") {
    return context;
  }

  return {
    approvalReason: event.reason,
    decision: null,
  };
}

function submitForReview({ runtime }: CheckoutArgs): Partial<CheckoutContext> {
  return {
    submittedAt: runtime.now(),
    decision: null,
    lastReviewState: checkoutPaths.reviewPending.id,
  };
}

function rememberReview(): Partial<CheckoutContext> {
  return {
    lastReviewState: checkoutPaths.reviewPending.id,
  };
}

function approveCheckout({ context, runtime }: CheckoutArgs): Partial<CheckoutContext> {
  return {
    decision: {
      kind: "approved",
      reason: normalizeReason(context.approvalReason),
      approverId: context.approver?.id ?? "unknown",
      decidedAt: runtime.now(),
    },
  };
}

function rejectCheckout({ context, runtime }: CheckoutArgs): Partial<CheckoutContext> {
  return {
    decision: {
      kind: "rejected",
      reason: normalizeReason(context.approvalReason),
      approverId: context.approver?.id ?? "unknown",
      decidedAt: runtime.now(),
    },
  };
}

function clearDecision(): Partial<CheckoutContext> {
  return {
    approvalReason: "",
    decision: null,
  };
}

function hasPermission(approver: CheckoutApprover | null, permission: CheckoutPermission): boolean {
  return approver?.permissions.includes(permission) ?? false;
}

function normalizeDecision(decision: boolean | FlowPermissionDecision): FlowPermissionDecision {
  return typeof decision === "boolean" ? { allowed: decision } : decision;
}

function normalizeReason(reason: string): string {
  return reason.trim().replaceAll(/\s+/g, " ");
}

function redactPersistedCheckout(value: unknown): unknown {
  if (!isPersistedCheckout(value)) {
    return value;
  }

  return {
    ...value,
    context: {
      ...value.context,
      customer: {
        ...value.context.customer,
        email: "[redacted]",
      },
      approvalReason: value.context.decision === null ? value.context.approvalReason : "[redacted]",
    },
  };
}

function migrateLegacyCheckoutSnapshot(value: unknown): unknown {
  if (!isObject(value) || !isObject(value.context)) {
    return value;
  }

  return {
    ...value,
    context: {
      ...value.context,
      lastReviewState:
        typeof value.context.lastReviewState === "string" ? value.context.lastReviewState : null,
    },
  };
}

function isPersistedCheckout(value: unknown): value is {
  readonly value: CheckoutState;
  readonly context: CheckoutContext;
} {
  return isObject(value) && isObject(value.context) && isObject(value.context.customer);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
