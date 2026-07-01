import type { FlowInspectionSubscription } from "./public/types.js";

type MutableFlowInspectionSubscription = (() => void) & {
  unsubscribe: () => void;
  closed: boolean;
};

export function createInspectionSubscription(
  onUnsubscribe: () => void,
): FlowInspectionSubscription {
  const subscription = (() => {
    if (subscription.closed) {
      return;
    }

    subscription.closed = true;
    onUnsubscribe();
  }) as MutableFlowInspectionSubscription;

  subscription.unsubscribe = subscription;
  subscription.closed = false;
  return subscription satisfies FlowInspectionSubscription;
}
