import { Cause, Data, Effect, Exit, Schema } from "effect"

// ── Library side: the classifier, built on Data.TaggedError with a `reason`, like HttpClientError ──
export class OutcomeFailure<R> extends Data.TaggedError("Flow/Failure")<{ readonly reason: R }> {}
export class OutcomeMaybe<R> extends Data.TaggedError("Flow/Maybe")<{ readonly reason: R }> {}

export const Outcome = {
  success: <A>(value: A): Effect.Effect<A> => Effect.succeed(value),
  failure: <R>(reason: R): Effect.Effect<never, OutcomeFailure<R>> => Effect.fail(new OutcomeFailure({ reason })),
  maybe: <R>(reason: R): Effect.Effect<never, OutcomeMaybe<R>> => Effect.fail(new OutcomeMaybe({ reason })),
}

// Split a commit's error channel into the two typed outcome channels.
// Unclassified errors go to failure (the default the user chose).
export type FailuresOf<E> = E extends OutcomeFailure<infer R> ? R : E extends OutcomeMaybe<any> ? never : E
export type MaybesOf<E> = E extends OutcomeMaybe<infer R> ? R : never

export type Classified<A, E> =
  | { readonly _tag: "Success"; readonly value: A }
  | { readonly _tag: "Failure"; readonly reason: FailuresOf<E> }
  | { readonly _tag: "Maybe"; readonly reason: MaybesOf<E> | { readonly _tag: "Defect"; readonly defect: unknown } | { readonly _tag: "Interrupted" } }

// Runtime side: read the Cause, never interpret the author's errors.
export const classify = <A, E>(exit: Exit.Exit<A, E>): Classified<A, E> => {
  if (Exit.isSuccess(exit)) return { _tag: "Success", value: exit.value }
  const reason = exit.cause.reasons[0]
  if (reason && Cause.isFailReason(reason)) {
    const e = reason.error as unknown
    if (e instanceof OutcomeMaybe) return { _tag: "Maybe", reason: e.reason }
    if (e instanceof OutcomeFailure) return { _tag: "Failure", reason: e.reason }
    return { _tag: "Failure", reason: e as FailuresOf<E> }
  }
  // Flow's own timeout or cancel would be reported here with its own reason (Timeout, Cancelled).
  if (reason && Cause.isInterruptReason(reason)) return { _tag: "Maybe", reason: { _tag: "Interrupted" } }
  return { _tag: "Maybe", reason: { _tag: "Defect", defect: reason } }
}

// ── Author side ──
class OutOfStock extends Schema.TaggedError<OutOfStock>()("OutOfStock", { sku: Schema.String }) {}
class Invalid extends Data.TaggedError("Invalid")<{ field: string }> {}
class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}
class ServerCrash extends Data.TaggedError("ServerCrash")<{}> {}
type Receipt = { id: string }
declare const call: (n: number) => Effect.Effect<Receipt, "net" | "conflict" | "crash" | "bad">

const commit = (n: number) =>
  Effect.gen(function* () {
    const r = yield* call(n).pipe(
      Effect.catch((e) =>
        Effect.gen(function* () {
          if (e === "conflict") return yield* Outcome.failure(new OutOfStock({ sku: "x" }))
          if (e === "net") return yield* Outcome.maybe(new NoResponse())
          if (e === "crash") return yield* Outcome.maybe(new ServerCrash())
          return yield* new Invalid({ field: "qty" })              // a plain error: failure by default
        }),
      ),
    )
    return yield* Outcome.success(r)
  })

type C = ReturnType<typeof commit>
type E = Effect.Error<C>
export type F = FailuresOf<E>   // expect OutOfStock | Invalid
export type M = MaybesOf<E>     // expect NoResponse | ServerCrash
const f: [F] extends [OutOfStock | Invalid] ? ([OutOfStock | Invalid] extends [F] ? true : false) : false = true
const m: [M] extends [NoResponse | ServerCrash] ? ([NoResponse | ServerCrash] extends [M] ? true : false) : false = true

// Effect's own reason combinators still work on the wrappers
const handled = commit(1).pipe(
  Effect.catchReason("Flow/Maybe", "NoResponse", () => Effect.succeed({ id: "fallback" })),
)
// Note: Effect.catchReason keeps the parent error in the type ("preserving the parent error shape"),
// so the handled reason is not removed from E. Compiling the call is the check here.
export { f, m, handled }
