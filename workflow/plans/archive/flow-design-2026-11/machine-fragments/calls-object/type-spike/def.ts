// def.ts: the shared fixture. One operation, one definition, one trait definition. Types only.
import { definition, operation, schema, type Events, type Uncertain } from "./lib.ts"

// ── operations ─────────────────────────────────────────────────────────────────────────────────────
export type CardDeclined = { readonly _tag: "CardDeclined"; readonly declineCode: string }
export type Busy = { readonly _tag: "Busy"; readonly retryAfterMs: number }
export type Rejected = { readonly _tag: "Rejected"; readonly code: string }
export const confirm = operation<
  { readonly intentId: string; readonly paymentMethodId: string },
  { readonly chargeId: string },
  CardDeclined | Busy | Rejected
>("Stripe.confirm", schema())
export const save = operation<{ readonly value: string }, { readonly savedAt: number }, Rejected>("Api.save", schema())

// ── the machine definition ─────────────────────────────────────────────────────────────────────────
export type SetterEv =
  | { readonly _tag: "Set"; readonly value: string }
  | { readonly _tag: "Saved" }
  | { readonly _tag: "SaveFailed" }
  | Uncertain<{ readonly _tag: "SaveUnsure" }>
export const Setter = definition<SetterEv>()({
  id: "Setter",
  memory: { value: "" },
  operations: { Api: { save } },
})

export type CheckoutEv =
  | { readonly _tag: "Pay"; readonly paymentMethodId: string }
  | { readonly _tag: "RetryNow" }
  | { readonly _tag: "Other" }
  | { readonly _tag: "Paid"; readonly chargeId: string }
  | { readonly _tag: "Declined"; readonly code: string }
  | { readonly _tag: "TryLater" }
  | Uncertain<{ readonly _tag: "Unsure" }>

export const Checkout = definition<CheckoutEv>()({
  id: "Checkout",
  memory: { intentId: "", paymentMethodId: "", busyTries: 0 },
  operations: { Stripe: { confirm } },
})

// ── shared bits for the negative cases ────────────────────────────────────────────────────────────
export type PayNeed = { readonly paymentMethodId: string }
export const payOutcomes = (E: Events<CheckoutEv>) => ({
  success: E.Paid.from((v: { readonly chargeId: string }) => ({ chargeId: v.chargeId })),
  failure: { CardDeclined: E.Declined.from((r: CardDeclined) => ({ code: r.declineCode })), Busy: E.TryLater, Rejected: E.TryLater },
  unknown: E.Unsure,
})
