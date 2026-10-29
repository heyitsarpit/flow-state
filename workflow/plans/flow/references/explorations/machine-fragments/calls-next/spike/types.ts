// types.ts: the static guarantees the proposal claims. `tsc` fails if any @ts-expect-error line stops erroring,
// so each one proves the type is real (not `any`) and inferred from the commit's Effect.
import { Effect, Schema } from "effect"
import { deny, machine, Outcome, transaction, type Uncertain } from "./flow.ts"
import { type Busy, charge, type Declined, save } from "./operations.ts"

type Ev =
  | { readonly _tag: "Go" } | { readonly _tag: "Other" } | { readonly _tag: "Picked"; readonly cents: number }
  | { readonly _tag: "Paid"; readonly chargeId: string } | { readonly _tag: "Failed" } | { readonly _tag: "Busy"; readonly ms: number | undefined }
  | { readonly _tag: "Plain" } | Uncertain<{ readonly _tag: "Unsure" }> | Uncertain<{ readonly _tag: "UnsureWhy"; readonly why: string }>
const m = machine<Ev>()({ memory: { n: 0, docId: "d1" }, operations: { Payments: { charge }, Docs: { save } } })
const { E, O } = m

// 1-3. Mapper inputs are inferred from the commit: the success value, the error class, the unknown union.
export const typed = O.Payments.charge.commit(() => ({ cents: 5 }), {
  outcomes: {
    success: E.Paid.from((v) => {
      // @ts-expect-error: the success value has no `amount`
      void v.amount
      return { chargeId: v.chargeId }
    }),
    failure: {
      Declined: E.Failed,
      Busy: E.Busy.from((e, { attempt }) => {
        // @ts-expect-error: Busy has no `code` (that is Declined's)
        void e.code
        return { ms: e.retryAfterMs ?? attempt.sends }
      }),
    },
    unknown: E.UnsureWhy.from((r) => {
      switch (r._tag) {
        case "NoResponse": case "ServerError": case "BadResponse":               // the commit's Outcome.unknown(...)
        case "Cancelled": case "Restored": case "Interrupted": case "Defect":    // Flow's
          return { why: r._tag }
        case "StillUnknown": {
          const f: Declined | Busy = r.failure
          // @ts-expect-error: StillUnknown carries a failure, never an unknown reason
          const g: { readonly _tag: "NoResponse" } = r.failure
          return { why: f._tag + String(g) }
        }
      }
    }),
  },
})

// 4. A mapping missing a failure tag is a type error ...
// @ts-expect-error: Busy is not mapped
export const missingTag = O.Payments.charge.commit(() => ({ cents: 5 }), { outcomes: { success: E.Paid.from((v) => ({ chargeId: v.chargeId })), failure: { Declined: E.Failed }, unknown: E.Unsure } })
// ... a missing NotSent is not (flow check requires it only where it can occur, rule 8).
export const noNotSent = O.Payments.charge.commit(() => ({ cents: 5 }), { outcomes: { success: E.Paid.from((v) => ({ chargeId: v.chargeId })), failure: { Declined: E.Failed, Busy: E.Failed }, unknown: E.Unsure } })

// 5. A tag the commit cannot produce.
export const extraTag = O.Payments.charge.commit(() => ({ cents: 5 }), {
  outcomes: {
    success: E.Paid.from((v) => ({ chargeId: v.chargeId })),
    // @ts-expect-error: `charge` has no Teapot failure
    failure: { Declined: E.Failed, Busy: E.Failed, Teapot: E.Failed },
    unknown: E.Unsure,
  },
})

// 6. Flow.uncertain: `unknown:` may target only an event marked uncertain.
export const notUncertain = O.Payments.charge.commit(() => ({ cents: 5 }), {
  outcomes: {
    success: E.Paid.from((v) => ({ chargeId: v.chargeId })),
    failure: { Declined: E.Failed, Busy: E.Failed },
    // @ts-expect-error: Failed is not a Flow.uncertain event
    unknown: E.Failed,
  },
})

// 7-8. A payload event cannot be a bare target, and a mapper must return the event's payload.
export const bareWithPayload = O.Payments.charge.commit(() => ({ cents: 5 }), {
  outcomes: {
    // @ts-expect-error: Paid has a payload, so it needs .from
    success: E.Paid,
    failure: {
      Declined: E.Failed,
      // @ts-expect-error: Busy's payload is { ms }, not { retryAfterMs }
      Busy: E.Busy.from((e) => ({ retryAfterMs: e.retryAfterMs })),
    },
    unknown: E.Unsure,
  },
})

// 9. The input select must return the transaction's input Schema type.
// @ts-expect-error: cents is a number
export const badInput = O.Payments.charge.commit(() => ({ cents: "5" }), { outcomes: { success: E.Plain, failure: { Declined: E.Failed, Busy: E.Failed }, unknown: E.Unsure } })

// 10. Keyed records are read by the transaction's own key shape; retry and cancel need the key; the Attempt may be absent.
const saveDoc = O.Docs.save.commit(({ memory }) => ({ docId: memory.docId, body: "" }), {
  outcomes: { success: E.Plain, failure: { Conflict: E.Failed }, unknown: E.Unsure },
})
export const keyed = m.define({
  initial: "A",
  states: {
    A: {
      on: {
        Go: [
          { target: "self", guard: (g) => !saveDoc.pending(g, { docId: g.memory.docId }) || deny("Saving") },
          // @ts-expect-error: the key is { docId }, not { id }
          { target: "self", guard: (g) => !saveDoc.pending(g, { id: "d1" }) || deny("Saving") },
          // @ts-expect-error: the record may hold no Attempt
          { target: "self", guard: (g) => typed.at(g).attempt.sends > 0 || deny("None") },
          { target: "self", guard: (g) => (typed.at(g).attempt?.input.cents ?? 0) >= 0 || deny("None"), actions: [saveDoc.retry(({ memory }) => ({ docId: memory.docId }))] },
        ],
        // @ts-expect-error: there is no Teapot event
        Teapot: { target: "self" },
      },
    },
  },
})
// @ts-expect-error: a keyed call cannot be retried without saying which key
export const noKey = saveDoc.retry()

// 11. A select that reads its event is checked where the commit is listed.
const picked = O.Payments.charge.commit<{ readonly _tag: "Picked"; readonly cents: number }>(({ event }) => ({ cents: event.cents }), {
  outcomes: { success: E.Plain, failure: { Declined: E.Failed, Busy: E.Failed }, unknown: E.Unsure },
})
export const listed = m.define({
  initial: "A",
  states: {
    A: {
      on: {
        Picked: { target: "self", actions: [picked] },
        // @ts-expect-error: `Other` has no cents, so `picked` cannot start from its handler
        Other: { target: "self", actions: [picked] },
      },
    },
  },
})

// 12. Flow's reason tags are reserved: an author error using one is a type error at the transaction.
class NotSentError extends Schema.TaggedError<NotSentError>()("NotSent", {}) {}
// @ts-expect-error: "NotSent" is Flow's reason
export const bad = transaction({
  id: "X", input: Schema.Struct({}), key: () => ({}), concurrency: "reject",
  commit: () => Effect.gen(function* () { return yield* Outcome.failure(new NotSentError()) }),
})
