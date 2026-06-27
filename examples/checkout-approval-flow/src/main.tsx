import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FlowProvider, createRuntime, flow, useFlow, useSelector } from "@flow-state/core";

import "./styles.css";
import {
  approvePermission,
  checkoutMachine,
  checkoutStateIds,
  checkoutStatusLabel,
  evaluatePermission,
  formatMoney,
  managerApprover,
  selectCheckoutSummary,
  viewerApprover,
} from "./checkoutFlow";
import type { CheckoutApprover, CheckoutItem } from "./checkoutFlow";

const runtime = createRuntime();
const approvers: readonly CheckoutApprover[] = [managerApprover, viewerApprover];

function CheckoutApprovalExample(): React.ReactElement {
  const actor = useFlow(checkoutMachine);
  const snapshot = useSelector(actor, (current) => current);
  const summary = useSelector(
    actor,
    (current) => selectCheckoutSummary(current.context),
    sameSummary,
  );
  const approveDecision = evaluatePermission(approvePermission, snapshot, {
    type: "APPROVE_CHECKOUT",
  });
  const canApprove = flow.can(actor, { type: "APPROVE_CHECKOUT" });
  const canReject = flow.can(actor, { type: "REJECT_CHECKOUT" });

  function chooseApprover(id: string): void {
    actor.send({
      type: "SET_APPROVER",
      approver: approvers.find((approver) => approver.id === id) ?? null,
    });
  }

  return (
    <main className="checkoutShell">
      <section className="checkoutSurface" aria-labelledby="checkout-heading">
        <header className="masthead">
          <div>
            <p className="eyebrow">Example 4</p>
            <h1 id="checkout-heading">Checkout Approval Flow</h1>
          </div>
          <span className={`statusPill ${snapshot.value.replace(".", "-")}`}>
            {checkoutStatusLabel(snapshot)}
          </span>
        </header>

        <section className="summaryStrip" aria-label="Checkout summary">
          <div>
            <span className="metric">{formatMoney(summary.totalCents)}</span>
            <span className="metricLabel">cart total</span>
          </div>
          <div>
            <span className="metric">{summary.itemCount}</span>
            <span className="metricLabel">items</span>
          </div>
          <div>
            <span className="metric small">{summary.needsApproval ? "Yes" : "No"}</span>
            <span className="metricLabel">approval</span>
          </div>
        </section>

        <section className="cartGrid" aria-label="Cart items">
          {snapshot.context.items.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              disabled={snapshot.value !== checkoutStateIds.draft}
              onQuantityChange={(quantity) =>
                actor.send({ type: "UPDATE_ITEM_QUANTITY", itemId: item.id, quantity })
              }
            />
          ))}
        </section>

        <section className="reviewPanel" aria-label="Review controls">
          <label>
            <span>Approver</span>
            <select
              value={snapshot.context.approver?.id ?? ""}
              onChange={(event) => chooseApprover(event.target.value)}
            >
              <option value="">Unassigned</option>
              {approvers.map((approver) => (
                <option key={approver.id} value={approver.id}>
                  {approver.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Review reason</span>
            <textarea
              value={snapshot.context.approvalReason}
              rows={3}
              onChange={(event) =>
                actor.send({ type: "UPDATE_APPROVAL_REASON", reason: event.target.value })
              }
            />
          </label>

          <p className={approveDecision.allowed ? "permissionNotice allowed" : "permissionNotice"}>
            {approveDecision.allowed ? "Approver can approve." : approveDecision.reason}
          </p>
        </section>

        <footer className="actionBar">
          <button
            type="button"
            className="primary"
            disabled={!flow.can(actor, { type: "SUBMIT_FOR_REVIEW" })}
            onClick={() => actor.send({ type: "SUBMIT_FOR_REVIEW" })}
          >
            Submit
          </button>
          <button
            type="button"
            disabled={!flow.can(actor, { type: "RETURN_TO_DRAFT" })}
            onClick={() => actor.send({ type: "RETURN_TO_DRAFT" })}
          >
            Back
          </button>
          <button
            type="button"
            disabled={!flow.can(actor, { type: "RESTORE_REVIEW" })}
            onClick={() => actor.send({ type: "RESTORE_REVIEW" })}
          >
            Restore
          </button>
          <button
            type="button"
            disabled={!canApprove}
            onClick={() => actor.send({ type: "APPROVE_CHECKOUT" })}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={!canReject}
            onClick={() => actor.send({ type: "REJECT_CHECKOUT" })}
          >
            Reject
          </button>
        </footer>

        {snapshot.context.decision === null ? null : (
          <p className={`decisionBanner ${snapshot.context.decision.kind}`} role="status">
            {snapshot.context.decision.kind === "approved" ? "Approved" : "Rejected"} by{" "}
            {snapshot.context.decision.approverId}: {snapshot.context.decision.reason}
          </p>
        )}
      </section>
    </main>
  );
}

function CartItemRow(props: {
  readonly item: CheckoutItem;
  readonly disabled: boolean;
  readonly onQuantityChange: (quantity: number) => void;
}): React.ReactElement {
  return (
    <article className="cartRow">
      <div>
        <strong>{props.item.name}</strong>
        <span>{formatMoney(props.item.unitPriceCents)} each</span>
      </div>
      <label>
        <span>Qty</span>
        <input
          type="number"
          min="-9"
          max="99"
          value={props.item.quantity}
          disabled={props.disabled}
          onChange={(event) => props.onQuantityChange(event.currentTarget.valueAsNumber || 0)}
        />
      </label>
      <output>{formatMoney(props.item.quantity * props.item.unitPriceCents)}</output>
    </article>
  );
}

function sameSummary(
  left: ReturnType<typeof selectCheckoutSummary>,
  right: ReturnType<typeof selectCheckoutSummary>,
): boolean {
  return (
    left.itemCount === right.itemCount &&
    left.totalCents === right.totalCents &&
    left.needsApproval === right.needsApproval &&
    left.approvalReady === right.approvalReady
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FlowProvider runtime={runtime}>
      <CheckoutApprovalExample />
    </FlowProvider>
  </StrictMode>,
);
