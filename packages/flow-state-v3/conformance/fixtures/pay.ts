import { cellsPart, payPart } from "../../fixtures/pay/index.ts";
import { typedPart } from "../parts/reference.ts";

const writes = { pay: "reject", place: "reject", void: "reject" } as const;

/**
 * The checkout's Pay as every case and generated run knows it, on every runtime: its reference
 * derived from the real machine's `Compiled` (Conformance R15, I46), with the shop's `classify`,
 * and typed by its definition.
 */
export const Pay = typedPart(payPart, writes);

/**
 * Pay with `AbortPay`, which cancels the intent's `pay`, derived the same way.
 */
export const Cells = typedPart(cellsPart, writes);
