// Spike: where each piece of a commit's data comes from, and how a Story drives it.
import { Cause, Context, Data, Effect, Exit, Fiber, Layer, Result, Schema } from "effect"
import * as TestClock from "effect/testing/TestClock"

// ── Flow: Outcome (as in outcome-proposal.md) ─────────────────────────────────
class OutcomeFailure<R> extends Data.TaggedError("Flow/Failure")<{ readonly reason: R }> {}
class OutcomeUnknown<R> extends Data.TaggedError("Flow/Unknown")<{ readonly reason: R }> {}
export const Outcome = {
  success: <A>(value: A) => Effect.succeed(value),
  failure: <R>(reason: R) => new OutcomeFailure({ reason }),
  unknown: <R>(reason: R) => new OutcomeUnknown({ reason }),
}
type FailuresOf<E> = E extends OutcomeFailure<infer R> ? R : E extends OutcomeUnknown<any> ? never : E
type UnknownsOf<E> = E extends OutcomeUnknown<infer R> ? R : never
type Tagged = { readonly _tag: string }
type NotSent = { readonly _tag: "NotSent" }
type FlowUnknown = { readonly _tag: "Cancelled" | "Defect" | "Interrupted" }

// ── Flow: the Attempt. Flow mints it and counts sends, because Flow is what invokes the commit.
export interface Attempt<I> { readonly id: string; readonly operation: string; readonly input: I; readonly sends: number }

// ── Flow: a transaction descriptor (outside the machine)
type CommitFn<I, A, E, R> = (input: I, ctx: { readonly attempt: Attempt<I> }) => Effect.Effect<A, E, R>
export const transaction = <I, A, E extends Tagged | OutcomeFailure<Tagged> | OutcomeUnknown<Tagged>, R>(d: { id: string; commit: CommitFn<I, A, E, R> }) => d

// ── Flow: the outcome mapping (inside the machine). Every ending maps to one of the machine's events.
type Ctx<I> = { readonly input: I; readonly attempt: Attempt<I> }
export type Outcomes<I, A, E, Ev> = {
  readonly success: (value: A, ctx: Ctx<I>) => Ev
  readonly failure: { readonly [K in Extract<FailuresOf<E> | NotSent, Tagged>["_tag"]]: (reason: Extract<FailuresOf<E> | NotSent, { _tag: K }>, ctx: Ctx<I>) => Ev }
  readonly unknown: (reason: UnknownsOf<E> | FlowUnknown, ctx: Ctx<I>) => Ev
}

// ── Flow: the runtime's half. Invoke, classify the Exit, route by owner.
type Ending = { readonly _tag: "Success"; value: unknown } | { readonly _tag: "Failure" | "Unknown"; reason: Tagged }
const classify = (exit: Exit.Exit<unknown, unknown>, cancelledByFlow: boolean, invoked: boolean): Ending => {
  if (Exit.isSuccess(exit)) return { _tag: "Success", value: exit.value }
  const cause = exit.cause
  if (Cause.hasDies(cause)) return { _tag: "Unknown", reason: { _tag: "Defect" } }
  const found = Cause.findError(cause)
  if (Result.isSuccess(found)) {
    const e = found.success as any
    if (e instanceof OutcomeUnknown) return { _tag: "Unknown", reason: e.reason as Tagged }
    if (e instanceof OutcomeFailure) return { _tag: "Failure", reason: e.reason as Tagged }
    return { _tag: "Failure", reason: e }
  }
  if (cancelledByFlow) return invoked ? { _tag: "Unknown", reason: { _tag: "Cancelled" } } : { _tag: "Failure", reason: { _tag: "NotSent" } }
  return { _tag: "Unknown", reason: { _tag: "Interrupted" } }
}

export const makeCalls = <Ev>(mailbox: Array<{ late: boolean; event: Ev }>) => {
  let n = 0
  const live = new Map<string, { fiber: Fiber.Fiber<unknown, unknown>; cancelled: boolean }>()
  const start = <I, A, E, R>(
    op: { id: string; commit: CommitFn<I, A, E, R> },
    input: I,
    map: { outcomes: Outcomes<I, A, E, Ev>; abandoned?: Partial<Outcomes<I, A, E, Ev>> },
    owner: { active: boolean },
    previous?: Attempt<I>,
  ) => Effect.gen(function* () {
    const attempt: Attempt<I> = previous ? { ...previous, sends: previous.sends + 1 } : { id: `att-${++n}`, operation: op.id, input, sends: 1 }
    const entry = { fiber: undefined as any, cancelled: false }
    // Two fibers: the commit (Flow may interrupt it) and the watcher that classifies and delivers.
    entry.fiber = yield* Effect.forkDetach(op.commit(attempt.input, { attempt }) as Effect.Effect<unknown, unknown, never>)
    yield* Effect.forkDetach(Effect.exit(Fiber.join(entry.fiber)).pipe(
      Effect.flatMap((exit) => Effect.sync(() => {
        live.delete(attempt.id)
        const ending = classify(exit, entry.cancelled, true)
        const m = owner.active ? map.outcomes : map.abandoned           // fencing: who is still waiting?
        const ctx = { input: attempt.input, attempt }
        const event = !m ? undefined
          : ending._tag === "Success" ? m.success?.(ending.value as A, ctx)
          : ending._tag === "Failure" ? (m.failure as any)?.[ending.reason._tag]?.(ending.reason, ctx)
          : m.unknown?.(ending.reason as any, ctx)
        if (event !== undefined) mailbox.push({ late: !owner.active, event })
        else mailbox.push({ late: true, event: { _tag: "Dropped", ending } as any })  // evidence, never silent
      })),
    ))
    live.set(attempt.id, entry)
    return attempt
  })
  const cancel = (attemptId: string) => Effect.gen(function* () {
    const e = live.get(attemptId); if (!e) return
    e.cancelled = true
    yield* Fiber.interrupt(e.fiber)                  // interruption aborts the AbortSignal Effect.tryPromise handed the adapter
  })
  const pending = (attemptId: string) => live.has(attemptId)
  return { start, cancel, pending }
}

// ── The app: a service is the adapter boundary. Production wraps fetch; Stories replace it with a fixture.
export type HttpResult = { readonly status: number; readonly retryAfterMs?: number; readonly body?: unknown }
export class PaymentsApi extends Context.Service<PaymentsApi, {
  readonly charge: (body: { cents: number }, opts: { idempotencyKey: string }) => Effect.Effect<HttpResult, NoResponse>
}>()("PaymentsApi") {}

export class Declined extends Schema.TaggedError<Declined>()("Declined", {}) {}
export class Busy extends Schema.TaggedError<Busy>()("Busy", { retryAfterMs: Schema.optional(Schema.Number) }) {}
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

// production adapter: the signal is how interruption reaches the browser
export const PaymentsApiLive = (wired: boolean) => Layer.succeed(PaymentsApi, {
  charge: (body, { idempotencyKey }) => Effect.tryPromise({
    try: (signal) => fetch("/api/charges", {
      method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": idempotencyKey },
      ...(wired ? { signal } : {}),                // not wired: interruption stops waiting, the request still goes
    }).then(async (r) => ({ status: r.status, retryAfterMs: Number(r.headers.get("retry-after") ?? NaN) * 1000 || undefined, body: await r.json() })),
    catch: () => new NoResponse(),
  }),
})

export const charge = transaction({
  id: "Payments.charge",
  commit: (input: { cents: number }, { attempt }) => Effect.gen(function* () {
    const api = yield* PaymentsApi
    const res = yield* api.charge(input, { idempotencyKey: attempt.id }).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    )
    if (res.status === 402) return yield* Outcome.failure(new Declined())
    if (res.status === 503) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))
    if (res.status >= 500) return yield* Outcome.unknown(new NoResponse())
    return yield* Outcome.success(res.body as { chargeId: string })
  }),
})

// ── Static checks on the mapping ───────────────────────────────────────────────
type Ev = { _tag: "Paid"; chargeId: string } | { _tag: "Declined" } | { _tag: "Busy"; attempt: Attempt<{ cents: number }>; retryAfterMs?: number } | { _tag: "TryLater" } | { _tag: "Unsure"; attempt: Attempt<{ cents: number }> } | { _tag: "ChargedAfterLeaving"; chargeId: string }
type ChargeE = Effect.Error<ReturnType<typeof charge.commit>>
export const ok: Outcomes<{ cents: number }, { chargeId: string }, ChargeE, Ev> = {
  success: (v) => ({ _tag: "Paid", chargeId: v.chargeId }),
  failure: {
    Declined: () => ({ _tag: "Declined" }),
    Busy: (r, { attempt }) => ({ _tag: "Busy", attempt, retryAfterMs: r.retryAfterMs }),   // r is typed Busy
    NotSent: () => ({ _tag: "TryLater" }),
  },
  unknown: (_r, { attempt }) => ({ _tag: "Unsure", attempt }),
}
// @ts-expect-error: a failure tag is missing (Busy), so the mapping is not exhaustive
export const missing: Outcomes<{ cents: number }, { chargeId: string }, ChargeE, Ev> = { success: ok.success, unknown: ok.unknown, failure: { Declined: ok.failure.Declined, NotSent: ok.failure.NotSent } }
// @ts-expect-error: a tag the commit cannot produce
export const extra: Outcomes<{ cents: number }, { chargeId: string }, ChargeE, Ev> = { ...ok, failure: { ...ok.failure, Teapot: () => ({ _tag: "TryLater" }) } }
