// types.ts: the static guarantees the proposal claims. `tsc` fails if any @ts-expect-error line stops erroring,
// so each one proves the type is real (not `any`) and inferred from the commit's Effect.
import { Effect, Schema } from "effect"
import { type CallEvent, type CallsView, deny, machine, Outcome, transaction } from "./flow.ts"
import { type Busy, charge, type Declined, save } from "./operations.ts"

type PayEvent<T extends string> = Extract<CallEvent<"pay", typeof charge>, { readonly _tag: T }>

// 1. Success value: inferred from `Outcome.success({ chargeId })`.
export const v = (e: PayEvent<"pay.success">) => {
  const id: string = e.value.chargeId
  // @ts-expect-error: the success value has no `amount`
  e.value.amount
  return id
}

// 2. A failure payload is the commit's own error class, fields and all.
export const busy = (e: PayEvent<"pay.Busy">) => {
  const ms: number | undefined = e.error.retryAfterMs
  // @ts-expect-error: Busy has no `code` (that is Declined's)
  e.error.code
  return ms
}

// 3. The unknown channel: the author's reasons, Flow's reasons, and StillUnknown carrying the failure union.
export const unknownReason = (e: PayEvent<"pay.unknown">): string => {
  const r = e.reason
  switch (r._tag) {
    case "NoResponse": case "ServerError": case "BadResponse":               // the commit's Outcome.unknown(...)
    case "Cancelled": case "Restored": case "Interrupted": case "Defect":    // Flow's
      return r._tag
    case "StillUnknown": {
      const f: Declined | Busy = r.failure
      // @ts-expect-error: StillUnknown carries a failure, never an unknown reason
      const g: { readonly _tag: "NoResponse" } = r.failure
      return f._tag + String(g)
    }
  }
}
// @ts-expect-error: the unknown reason is a union, not just the author's NoResponse
export const narrow = (e: PayEvent<"pay.unknown">): { readonly _tag: "NoResponse" } => e.reason

// 4. Handlers exist only for endings the commit can produce.
type Go = { readonly _tag: "Go" }
const d4 = machine<Go>()({ calls: { pay: charge }, memory: { n: 0 } })
export const m4 = d4.define({
  initial: "A",
  states: {
    A: {
      on: {
        Go: { target: "self", actions: [d4.C.pay.start(() => ({ cents: 5 }))] },
        "pay.Declined": { target: "self", update: ({ event }) => ({ n: event.error.code.length }) },
        // @ts-expect-error: `charge` has no Teapot failure, so there is no "pay.Teapot" event
        "pay.Teapot": { target: "self" },
      },
    },
  },
})

// 5. The input select must return the transaction's input Schema type.
const d5 = machine<Go>()({ calls: { pay: charge }, memory: {} })
// @ts-expect-error: cents is a number
export const a5 = d5.C.pay.start(() => ({ cents: "5" }))

// 6. Keyed calls: the record is read by the transaction's own key shape; resend and cancel need the key.
const d6 = machine<Go>()({ calls: { save }, memory: { docId: "d1" } })
export const m6 = d6.define({
  initial: "A",
  states: {
    A: {
      on: {
        Go: [
          { target: "self", guard: ({ calls, memory }) => !calls.save.at({ docId: memory.docId }).pending || deny("Saving") },
          // @ts-expect-error: the key is { docId }, not { id }
          { target: "self", guard: ({ calls }) => !calls.save.at({ id: "d1" }).pending || deny("Saving") },
          { target: "self", actions: [d6.C.save.resend(({ memory }) => ({ docId: memory.docId }))] },
        ],
      },
    },
  },
})
// @ts-expect-error: a keyed call cannot be resent without saying which key
export const a6 = d6.C.save.resend()

// 7. The Attempt is read from the record, typed and possibly absent: no `!`, no parked copy in memory.
export const sends = (calls: CallsView<{ pay: typeof charge }>) => {
  const n: number = calls.pay.sends
  const cents: number | undefined = calls.pay.attempt?.input.cents
  // @ts-expect-error: the record may hold no Attempt
  calls.pay.attempt.sends
  return n + (cents ?? 0)
}

// 8. A select can read the event of the transition that starts the call, narrowed to that event.
type Picked = { readonly _tag: "Picked"; readonly cents: number } | { readonly _tag: "Other" }
const d8 = machine<Picked>()({ calls: { pay: charge }, memory: {} })
export const m8 = d8.define({
  initial: "A",
  states: { A: { on: { Picked: { target: "self", actions: [d8.C.pay.start(({ event }) => ({ cents: event.cents }))] } } } },
})
// @ts-expect-error: outside a handler the event is the whole union, and `Other` has no cents
export const a8 = d8.C.pay.start(({ event }) => ({ cents: event.cents }))

// 9. Flow's reason tags are reserved: an author error using one is a type error at the transaction.
class NotSentError extends Schema.TaggedError<NotSentError>()("NotSent", {}) {}
// @ts-expect-error: "NotSent" is Flow's reason
export const bad = transaction({
  id: "X", input: Schema.Struct({}), key: () => ({}), concurrency: "reject",
  commit: () => Effect.gen(function* () { return yield* Outcome.failure(new NotSentError()) }),
})
