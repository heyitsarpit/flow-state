import type { FlowReceipt, FlowResourceReceipt, FlowTransactionReceipt } from "../api/types.js";

export function isCanonicalResourceReceipt(receipt: FlowReceipt): receipt is FlowResourceReceipt {
  switch (receipt.type) {
    case "resource:start":
    case "resource:patch":
    case "resource:invalidate":
    case "resource:hydrate":
    case "resource:placeholder":
    case "resource:success":
    case "resource:failure":
    case "resource:defect":
    case "resource:interrupt":
    case "resource:freshness":
      return true;
    default:
      return false;
  }
}

export function isCanonicalTransactionReceipt(
  receipt: FlowReceipt,
): receipt is FlowTransactionReceipt {
  switch (receipt.type) {
    case "transaction:queue":
    case "transaction:dequeue":
    case "transaction:start":
    case "transaction:success":
    case "transaction:failure":
    case "transaction:defect":
    case "transaction:interrupt":
    case "transaction:reject":
    case "transaction:retry":
    case "transaction:reset":
    case "transaction:preview-patch":
    case "transaction:rollback":
      return true;
    default:
      return false;
  }
}

export function canonicalReceiptFamily(
  receipt: FlowReceipt,
): "resources" | "transactions" | undefined {
  if (isCanonicalResourceReceipt(receipt)) {
    return "resources";
  }

  if (isCanonicalTransactionReceipt(receipt)) {
    return "transactions";
  }

  return undefined;
}
