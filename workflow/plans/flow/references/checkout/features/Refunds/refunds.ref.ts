import { actorRef } from "flow-state";
import { RefundsMachine } from "./refunds.machine.js";

// Persisted: a refund on the wire survives a reload (E18).
export const refundsRef = actorRef(RefundsMachine, "refunds", { persist: true });
