# Proposal: commit outcomes as three channels

Status: **merged into machine-design.md on 2026-10-30; kept as the record behind it.** It was merge 1 of 2 into
[machine-design.md](../machine-design.md) (section 2.7.1, rules 13 and 18, and the "Decisions" section there), before
[merged/server-calls](server-calls/proposal.md), which amends it (its section 6.4). Where this record and the design
differ, the design wins. It changed how a commit's ending reaches the machine and the cache, and superseded v4's P9,
P13, P14, the `definite` field of `abandoned`, and parts of the Operations and EntityDomains plans (section 7). The
in-machine half (timeout and retry placement, fencing, `abandoned`, late turns, the saga recipe) is merge 2,
[server-calls/proposal.md](server-calls/proposal.md). The implementation is checked by the spike in
[spikes/outcome-channels](../spikes/outcome-channels/outcome.ts).

## 1. The problem

A commit is a server call that changes something. The plans give it five endings (`success`,
`failure`, `defect`, `interrupt`, `unknown`) and v4 adds a sixth (`notSent`). Two of them are Effect
mechanics rather than answers: `interrupt` is always either "never sent" or "may have happened",
and `defect` is a bug whose effect on the server is unknown. v4 also asked the author to classify
error tags in a separate `failureKinds` list on the descriptor, far from the code that produces the
errors, and only the author reading that code can know what an error means.

A machine needs one thing from a commit: **what is now true on the server?** There are three
answers.

## 2. Three channels

| Channel | Meaning | Filled by |
| --- | --- | --- |
| **success** | it happened | the commit's return value |
| **failure** | it definitely did not happen | the author's errors, and Flow's `NotSent` |
| **unknown** | it may have happened | the author's `Outcome.unknown(…)`, and Flow's `Timeout`, `Cancelled`, `Restored`, `Interrupted`, `Defect` |

"unknown" is about the server's state, not about the reason. A definite failure can have a reason
nobody understands (an untyped error); it is still a failure.

## 3. Public design

### 3.1 Inside the commit function (the operation, outside the machine)

The decision about what an ending means is made where the request is made, line by line, by the
author who has read the API. Flow interprets no status codes and no error types.

```ts
return yield* Outcome.success(value)  // success. A plain `return value` is the same.
return yield* Outcome.failure(err)    // failure, stated explicitly (recommended)
return yield* new SomeError(…)        // failure: any plain error defaults here
return yield* Outcome.unknown(err)    // unknown: "this may have happened"
throw / die                           // unknown, reason Defect, and an actor issue

catch: (e) => Outcome.unknown(err)    // the same calls work wherever Effect wants an error value
```

- `Outcome.*` classifies any error: `Schema.TaggedError`, `Data.TaggedError` or a custom class.
- `Outcome.failure` and `Outcome.unknown` return error values, so one spelling works in `yield*`,
  in `catch:` (`tryPromise`, `try`) and in `mapError`. Authors never use the wrapper classes.
- `Outcome.success` is not needed (a plain `return` is success); it exists for symmetry, so every
  ending of a commit can be written the same way.
- Flow's own abort needs nothing from the author. When Flow aborts the call (timeout, cancel), it
  ignores what the commit then reports and uses its own reason.
- `Outcome` is the recommended standard. Plain errors default to failure because they are already
  in Effect's error channel and that is what an author usually means by `Effect.fail`.

### 3.2 Flow's own reasons

These are reserved names; an author error with one of these tags is a type error.

| Reason | Channel | When |
| --- | --- | --- |
| `NotSent` | failure | the commit was never called: cancelled or timed out first, or the page reloaded before the Attempt was saved |
| `Timeout` | unknown | `timeout` ran out after the call started; the real result later goes to `abandoned` |
| `Cancelled` | unknown | `O.x.cancel` after the call started |
| `Restored` | unknown | the page reloaded mid-call (persisted actors only) |
| `Interrupted` | unknown | the commit's fiber was interrupted by something other than Flow |
| `Defect` | unknown | the commit threw or died; also published as an actor issue |

`Defect` and `Interrupted` carry the full Effect `Cause` for diagnostics.

### 3.3 In the machine: the call's `outcomes`

```ts
outcomes: {
  success: E.X.from((value, { input, attempt }) => …),
  failure: { TagA: E.A, TagB: E.B.from((err) => …), NotSent: E.C },   // exhaustive over the failure channel
  // or one event for every failure: failure: E.Failed.from((err) => …)
  unknown: E.Unsure.from((reason, { attempt }) => …),                // targets a Flow.uncertain event
},
```

- **Recovering from unknown.** Never run the action again. Ask about the same attempt with
  `O.x.retry(attempt)`: it re-sends the same Attempt id, which the commit passes to the server as an
  idempotency key, so the server returns the original result or performs the work once.
- **Automatic retry.** `retry: { on: [...] }` may name any failure tag. Naming it is the author's
  claim that the tag is safe to retry.

### 3.4 What each channel does to the cache

| Channel | Optimistic look / domain predictions | Refetch |
| --- | --- | --- |
| success | confirmed | none |
| failure | removed | none |
| unknown | kept, marked uncertain | the displayed entries, once |

- The refetch is a read, and a read has no unknown: it succeeds or fails. If it fails, the look
  stays marked uncertain and the next natural trigger (reconnect, focus, invalidate) reads again.
  Flow never loops.
- Entity domains follow the same rule: a definite failure removes predictions without a repair
  refetch; unknown keeps them and forces the existing repair.
- Reads (`lookup`, `subscribe`) keep two channels, success and failure, because a read changes
  nothing. A defect in a read is an issue and a `Failure` lane.

## 4. How it is implemented

### 4.1 Two wrappers on Effect's error channel

Effect has two physical channels, success (`A`) and error (`E`). The unknown channel is a
classified part of `E`, built the way Effect's own `HttpClientError` carries a `reason`:

```ts
class OutcomeFailure<R> extends Data.TaggedError("Flow/Failure")<{ readonly reason: R }> {}
class OutcomeUnknown<R> extends Data.TaggedError("Flow/Unknown")<{ readonly reason: R }> {}

export const Outcome = {
  success: <A>(value: A) => Effect.succeed(value),            // symmetry only
  failure: <R>(reason: R) => new OutcomeFailure({ reason }),  // an error value: yieldable, and usable as catch:'s return
  unknown: <R>(reason: R) => new OutcomeUnknown({ reason }),
}
```

The wrappers are internal: authors write only `Outcome.*`. Effect's own combinators keep working inside a commit, for example
`Effect.catchReason("Flow/Unknown", "NoResponse", …)`. (`catchReason` keeps the parent error in
the type after handling a reason; that is Effect's documented behaviour.)

### 4.2 Types split the error channel

Inferred from the commit, with nothing declared elsewhere:

```ts
type FailureReasons<E> = E extends OutcomeFailure<infer R> ? R : E extends OutcomeUnknown<any> ? never : E
type UnknownReasons<E> = E extends OutcomeUnknown<infer R> ? R : never

// for a descriptor:
//   failure channel = FailureReasons<E> | NotSent
//   unknown channel = UnknownReasons<E> | Timeout | Cancelled | Restored | Interrupted | Defect
```

Branching inside a commit should use `Effect.gen` with `if` and `return yield*`; a ternary that
returns different Effect types does not unify.

### 4.3 The runtime classifies from the Exit and its Cause

Flow's own knowledge first, then the whole `Cause`, most cautious first:

```ts
if (neverInvoked)                      → failure: NotSent
if (restoredWithSavedAttempt)          → unknown: Restored
Exit success                           → success: value
Cause.hasDies(cause)                   → unknown: Defect (with the Cause), and an actor issue
Cause.findError(cause) finds e:
  e is OutcomeUnknown                  → unknown: e.reason
  e is OutcomeFailure                  → failure: e.reason
  otherwise                            → failure: e
only interruptions:
  Cause.interruptors are Flow's fibers → NotSent before invocation, else Timeout / Cancelled
  otherwise                            → unknown: Interrupted (with the Cause)
```

A Cause can hold several reasons (a failure plus a crashing finalizer, parallel sub-calls), so the
classifier reads all of it: a failure followed by a dying finalizer is unknown, not failure.

### 4.4 Then

The classified outcome drives the cache rule (3.4) and the mapped machine event, which is routed to
its state or to `abandoned` by fencing (v4 P2).

## 5. Example

```ts
// orders.operations.ts: outside the machine
class OutOfStock  extends Schema.TaggedError<OutOfStock>()("OutOfStock", { sku: Schema.String }) {}
class NoResponse  extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}
class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}

export const placeOrder = transaction({
  id: "Orders.place",
  input: OrderInput,
  concurrency: "reject",
  commit: (order, { signal, attempt }) =>
    Effect.gen(function* () {
      const res = yield* Effect.tryPromise({
        try: () => fetch("/api/orders", {
          method: "POST",
          body: JSON.stringify(order),
          headers: { "Idempotency-Key": attempt.id },   // the same id when this attempt is asked about again
          signal,
        }),
        catch: () => Outcome.unknown(new NoResponse()),  // connection dropped: maybe placed
      })

      // The author reads the statuses, not Flow.
      if (res.status === 409) return yield* Outcome.failure(new OutOfStock({ sku: order.sku }))   // definitely not placed
      if (!res.ok)            return yield* Outcome.unknown(new ServerError({ status: res.status })) // maybe placed

      const receipt = yield* Effect.promise(() => res.json())  // if this rejects: Defect, which is unknown
      return yield* Outcome.success(receipt)
    }),
});
// success channel: { id: string }
// failure channel: OutOfStock | NotSent
// unknown channel: NoResponse | ServerError | Timeout | Cancelled | Restored | Interrupted | Defect
```

```ts
// orders.machine.ts: inside the machine
const place = O.Orders.place.commit(({ memory }) => memory.order, {
  timeout: "15 seconds",
  outcomes: {
    success: E.Placed.from((receipt) => ({ orderId: receipt.id })),
    failure: {
      OutOfStock: E.SoldOut.from((e) => ({ sku: e.sku })),
      NotSent: E.TryAgain,                                   // Flow's: it never left
    },
    unknown: E.Unsure.from((why, { attempt }) => ({ attempt, why: why._tag })),
  },
});

UNSURE: {
  on: {
    // Never "place again": ask about the SAME attempt. The server sees the same attemptId.
    CheckAgain: { target: S.PLACING, actions: [O.Orders.place.retry(({ memory }) => memory.attempt)] },
  },
},
```

## 6. Where unknowns come from, and how they can be known

An unknown always means: **the request left the device, and no trustworthy answer came back.**

| Where | What happened | How it can be detected (tRPC as the example) | Who decides |
| --- | --- | --- | --- |
| In transit | connection dropped, DNS failure, reset | a `TRPCClientError` with no `data`; `cause` is fetch's `TypeError`. The browser cannot say whether the server got the request. | the author, in `catch` |
| In transit | a proxy or load balancer error page (502/504) | a `TRPCClientError` with an HTTP status but no tRPC body | the author |
| On the server | the procedure threw partway | `data.code === "INTERNAL_SERVER_ERROR"`. If the procedure runs in a database transaction, the author knows it rolled back and may make it a failure. | the author |
| On the server | the server's own timeout | `data.code === "TIMEOUT"` | the author |
| After the answer | a success body that will not decode | the decode error; wrapped as `Outcome.unknown(new BadResponse())`, or left as a defect | the author, or Flow by default |
| Inside Flow | timeout after starting, cancel after starting, reload mid-call, outside interruption, a throw | Flow's own timer and actions, the saved Attempt, `Cause.interruptors`, `Cause.hasDies` | Flow, automatically |

The second row is the honest limit of the web: a dropped connection cannot be told apart from "the
server never got it". That is why the unknown channel exists, and why the idempotency key matters.

## 7. Changes against v4 and the plans

| Change | Supersedes |
| --- | --- |
| Commits end in three channels: success, failure, unknown | the plans' five outcomes (Operations O3) and v4's separate `notSent` (P9) |
| `notSent` becomes the reserved failure reason `NotSent` | v4 P9 |
| `interrupt` and `defect` stop being outcome keys; they become unknown reasons `Interrupted` and `Defect` | Operations O3, O7; v4 P9 |
| Classification happens in the commit with `Outcome.*`; plain errors default to failure | `failureKinds` (v4 P14) |
| `retry.on` may name any failure tag | v4 P4 ("definite tags only") |
| `abandoned`'s payload loses `definite`; handlers decide by tag | v4 P10, P14 |
| Unknown keeps the optimistic look, marked uncertain, and refetches the displayed entries once | `revertOnUnknown` (v4 P13); Operations O5 ("unknown retains them and invalidates") |
| Domains: a definite failure removes predictions without a repair refetch | EntityDomains O1 ("failure or defect … repairs") |
| Reads keep success and failure only | Operations O2 (`defect`, `interrupt` for lookups) |

Unchanged: `Flow.uncertain` (the marker on events the unknown channel may target), `timeout`,
`retry` and `retrying`, fencing, `abandoned`, `orphaned`, the saga recipe, `.pending`,
`O.x.retry(attempt)`, the Attempt and its id.

## 8. Alternatives considered

- **`failureKinds` on the descriptor (v4).** A separate list naming error tags, away from the code
  that produces them. Rejected for locality: only the commit's code can know what an error means.
- **Flow reading HTTP status codes or network errors.** Rejected: Flow is not a network library, and
  many APIs are poorly designed and typed.
- **A marker property on the error class** (like Effect's `isRetryable` getters in its HTTP, AI and
  SQL modules). Workable and native, but the user chose an explicit classifier at the point of
  failure.
- **Effect's `Die` as the unknown channel.** Rejected: `Die` is untyped and means "bug".
- **`Cause` annotations as the marker.** Rejected: annotations are not part of the error type, so
  the unknown channel could not be typed or checked for exhaustiveness. `Cause` is used instead to
  read the result (4.3).
- **Raw TypeScript brands.** Replaced by `Data.TaggedError` wrappers, so the channels are real Effect
  errors: yieldable, catchable and visible to Effect's combinators.

## 9. Decisions on the former open questions

1. **`Outcome.failure` and `Outcome.unknown` return error values** (not `Effect.fail(…)`), so one
   spelling works in `yield*`, `catch:` and `mapError` (3.1, 4.1). Checked in a scratch spike on
   Effect 4.0.5: it type-checks and classifies the same in all three positions.
2. **`Outcome.success` stays**, for symmetry only. A plain `return` means the same.
3. **No `flow check` warning on unwrapped typed errors.** TypeScript already catches it: the call's
   `outcomes.failure` is exhaustive, so an unwrapped error (say a `NoResponse` meant as unknown)
   appears there by name and must be handled as a failure, where the author sees it.

Still open elsewhere: the in-machine half, merge 2 ([server-calls/proposal.md](server-calls/proposal.md)).
