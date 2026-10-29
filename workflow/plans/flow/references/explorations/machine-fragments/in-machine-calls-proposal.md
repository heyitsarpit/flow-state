# Proposal: server calls inside the machine

Status: proposal, not accepted. It is the in-machine half of the commit design; the out-of-machine
half is [outcome-proposal.md](outcome-proposal.md) (final, to be merged into
[proposal-v4.md](proposal-v4.md)). It closes [revisit.md](revisit.md) item 4 except where section
8 says otherwise. Merged, it supersedes v4's P1 (in part), P4, P10, P16, P20 (in part) and the
`retry`, `retrying` and `timeout` commit options, and amends Operations O3 (section 5). The data
flow is checked by the spike in [spikes/call-dataflow](spikes/call-dataflow/stories.ts).

## 1. The problem

A machine starts a commit and must react to everything that happens to it: its ending, a retry, a
slow server, a user who cancels or leaves, a result that arrives after nobody is waiting. v4
answered this with call options (`retry`, `retrying`, `timeout`, `abandoned`) that each carried
their own rules.

Four constraints shape this proposal:

1. **Flow is not the network library.** Every piece of data the machine sees must have a source
   the commit or Flow actually holds (section 2). Flow interprets no statuses and no error types.
2. **Stories must run it.** Fixtures replace whole services and cannot inject outcomes (Testing
   O3), so the commit must reach the network through a service.
3. **It must be statically analysable.** Every ending becomes a declared event; mappings are
   exhaustive by type; `flow check` sees schedules and actions.
4. **In-machine first.** Everything is built from the machine's existing pieces (events, memory,
   schedules, actions). Extracting a pattern into a trait is a later, optional abstraction, never
   the default assumption.

## 2. Where the data comes from

| Data | Source | How it reaches the machine |
| --- | --- | --- |
| The ending (success, failure, unknown) | the commit's `Outcome.*` and Flow's classifier | the call's `outcomes` mapping, as an event |
| The Attempt `{ id, operation, key, input, sends }` | Flow mints it at admission and counts each invocation of the commit | the mapper's `{ attempt }`, into a declared event field |
| `Retry-After` | the response header, read by the adapter | a field on the commit's error (information, never configuration), then the mapper |
| Cancel | `O.x.cancel` interrupts the commit's fiber | `Effect.tryPromise` aborts the `AbortSignal` it handed the adapter; the browser drops the request **only if the adapter passed the signal to `fetch`** |
| "The request was sent" | nothing: `fetch` never reports it | Flow only knows it called the adapter, so after that every abort is `unknown` |
| Upload or download progress, streamed tokens | `XMLHttpRequest.upload.onprogress`, a `response.body` reader | not covered here (section 8) |

## 3. Public design

### 3.1 The commit reaches the network through a service

```ts
// payments.operations.ts
export class PaymentsApi extends Context.Service<PaymentsApi, {
  readonly charge: (body: ChargeInput, o: { idempotencyKey: string }) => Effect.Effect<HttpResult, NoResponse>
}>()("PaymentsApi") {}

class Busy extends Schema.TaggedError<Busy>()("Busy", {
  retryAfterMs: Schema.optional(Schema.Number),        // what the server said; nothing here says "retry"
}) {}

export const charge = transaction({
  id: "Payments.charge", input: ChargeInput, concurrency: "reject",
  commit: (input, { attempt }) => Effect.gen(function* () {
    const api = yield* PaymentsApi                      // production wraps fetch; Stories use a fixture
    const res = yield* api.charge(input, { idempotencyKey: attempt.id }).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (res.status === 402) return yield* Outcome.failure(new Declined())
    if (res.status === 503) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))
    return yield* Outcome.success(res.body)
  }),
})
```

A retry the UI never sees stays in the commit, in Effect's own style:

```ts
api.charge(input, opts).pipe(Effect.retry({ while: (e) => e._tag === "Busy", times: 2 }))
```

### 3.2 Endings map to events; the Attempt travels in them

```ts
// checkout.definition.ts
internalEvents: {
  Paid: { chargeId: Schema.String },
  Declined: {}, TryLater: {}, Slow: {}, RetryNow: {},
  Busy: { attempt: charge.Attempt, retryAfterMs: Schema.optional(Schema.Number) },  // charge.Attempt: the operation's Attempt Schema
  Unsure: { attempt: charge.Attempt },
  ChargedAfterLeaving: { chargeId: Schema.String },
},

// checkout.machine.ts
const pay = O.Payments.charge.commit(({ memory }) => memory.charge, {
  outcomes: {
    success: E.Paid.from((v) => ({ chargeId: v.chargeId })),
    failure: {                                          // exhaustive: a missing or unknown tag is a type error
      Declined: E.Declined,
      Busy: E.Busy.from((r, { attempt }) => ({ attempt, retryAfterMs: r.retryAfterMs })),
      NotSent: E.TryLater,
    },
    unknown: E.Unsure.from((_r, { attempt }) => ({ attempt })),
  },
  abandoned: { success: E.ChargedAfterLeaving.from((v) => ({ chargeId: v.chargeId })) },
});
```

### 3.3 A visible retry: an event, memory and a schedule

```ts
PAYING: {
  schedules: {
    retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow, armOn: [E.Busy] },
    slow: { schedule: "4 seconds", send: E.Slow },
  },
  on: {
    Busy: [
      {
        guard: ({ event }) => event.attempt.sends < 4 || deny("GaveUp"),  // the count is the Attempt's
        target: "self",
        updateMemory: ({ event }) => ({
          attempt: event.attempt,
          retryInMs: event.retryAfterMs ?? 1000 * 2 ** event.attempt.sends,  // the server's delay wins
        }),
      },
      { target: S.CARD, updateMemory: () => ({ error: "The bank is busy. Try again shortly." }) },
    ],
    RetryNow: { target: "self", actions: [O.Payments.charge.retry(({ memory }) => memory.attempt)] },
    Slow: { target: "self", updateMemory: () => ({ slow: true }) },
    Paid: S.DONE,
    Declined: { target: S.CARD, updateMemory: () => ({ error: "Card declined" }) },
    Unsure: { target: S.UNSURE, updateMemory: ({ event }) => ({ attempt: event.attempt }) },
    TryLater: S.CARD,
  },
},
```

Leaving PAYING (the give-up branch, or the user going back) stops the armed retry, so no retry is
sent after the user has moved on. "Retrying 2/3" in a view reads `memory.attempt.sends`. A payment
has no cancel and no timeout: the user sees "still working" after 4 seconds.

### 3.4 A hard timeout: a schedule plus `cancel`

```ts
// autosave on a flaky network: a PUT, safe to send again with the same Attempt
SAVING: {
  schedules: { giveUp: { schedule: "10 seconds", send: E.TookTooLong } },
  on: {
    TookTooLong: { target: "self", actions: [O.Docs.save.cancel(({ memory }) => ({ docId: memory.docId }))] },
    SaveUnsure: { target: S.SAVING, actions: [O.Docs.save.retry(({ event }) => event.attempt)] },
  },
},
```

`cancel` before the commit was called answers failure `NotSent`; after, `unknown` with reason
`Cancelled`, whether or not the adapter wired the signal (2). A deadline that belongs to the
transport goes inside the commit: `Effect.timeoutOrElse` returning `Outcome.unknown(…)`.

### 3.5 A soft timeout: a schedule plus leaving

```ts
// v4's sign-in: show "couldn't check" after 15 s, but a real WrongCode afterwards still strikes
VERIFYING: {
  schedules: { gaveUp: { schedule: "15 seconds", send: E.StopWaiting } },
  on: { StopWaiting: { target: S.ENTERING, updateMemory: () => ({ error: "Couldn't check" }) } },
},
// the call keeps running; its real ending goes to `abandoned` (3.6)
```

### 3.6 `abandoned`: endings after the state was left

```ts
const pay = O.Payments.charge.commit(select, {
  outcomes: { … },
  abandoned: { success: E.ChargedAfterLeaving.from((v) => ({ chargeId: v.chargeId })) },
});

root: { on: { ChargedAfterLeaving: { target: "self", actions: [refund] } } }
```

It has the shape of `outcomes`, every key optional. The event routes from the active leaf like any
event and starts a late turn (v4 rule 6). An ending with no mapping is dropped with evidence.

### 3.7 Reconciling `unknown`: the same Attempt, once the old one has settled

```ts
UNSURE: {
  on: {
    CheckAgain: {
      target: S.PAYING,
      guard: [(g) => !O.Payments.charge.pending(g) || deny("StillChecking")],
      actions: [O.Payments.charge.retry(({ memory }) => memory.attempt)],
    },
  },
},
```

### 3.8 Stories

```ts
const busyThenPaid = story
  .machine(Checkout, { id: "Checkout/busy-then-paid", fixtures: FakePayments({ script: [{ status: 503, retryAfterMs: 2000 }] }) })
  .send(E.Pay()).advance("1 second").process()   // Busy (sends 1); the retry is armed for 2 s
  .advance("2 seconds").process()                // RetryNow sends the same Attempt again
  .advance("1 second").process()
  .checkpoint("paid")                            // state DONE; server truth: charged once
```

The fixture is a stateful fake server behind `PaymentsApi`: delays on the controlled clock,
scripted responses, idempotency by key.

## 4. Rules

1. **Endings are events.** Every ending of a commit reaches the machine as one of its declared
   events, through `outcomes` while the fenced state is active (v4 P2) and through `abandoned`
   after it is left. `failure` is exhaustive over the commit's failure tags plus `NotSent`.
2. **The Attempt.** Flow mints `{ id, operation, key, input, sends }` at admission. `sends` is the
   number of times Flow has called the commit for it, starting at 1. Each transaction exports its
   Attempt Schema (`charge.Attempt`) so events and memory can hold one. Mappers receive
   `(value, { input, attempt })`.
3. **`retry(attempt)` sends the same Attempt again** (same id and input, `sends + 1`), fenced like
   any commit started by its transition. A settled success replays its result without a call; a
   settled failure or unknown calls the commit again; a pending Attempt is refused.
4. **`cancel` interrupts.** Before the commit was called: failure `NotSent`. After: `unknown`
   (`Cancelled`), final. The ending is delivered by rule 1.
5. **`abandoned` runs once,** at the real ending, and its events start late turns (v4 rule 6).
   Unmapped endings are dropped with evidence.
6. **`.pending`** is true from admission until the final ending or a cancel. Leaving the state
   does not end it.
7. **Flow has no timeout and no automatic retry.** Waiting is the machine's (schedules); transport
   policy is the commit's (Effect).
8. **The runtime classifies and delivers outside the fiber it interrupts,** so a cancel cannot
   lose its own ending (found by the spike).

## 5. Changes against v4, the outcome proposal and the plans

**Added**

| Added | Kind | Example |
| --- | --- | --- |
| `attempt.sends` | new field on the Attempt | `guard: ({ event }) => event.attempt.sends < 4` |
| `charge.Attempt` | new Schema exported by each transaction | `Busy: { attempt: charge.Attempt }` |
| The commit calls a service, never `fetch` | convention; Stories need it | `const api = yield* PaymentsApi` |

**Changed**

| Changed | Before | Now |
| --- | --- | --- |
| `abandoned` | v4 P10: inline `on`-style handlers, run twice (pending, then settled) | maps endings to events, runs once, routes like any event |
| `O.x.retry(attempt)` | Operations O3: "exists only to reconcile"; a settled failure replays without a call | also re-sends after a failure; only a settled success replays |
| Visible retry | v4 P4: `retry: { on, schedule }` call option | event → memory → schedule `armOn` → `O.x.retry(attempt)` |
| Timeout | v4 P16: `timeout` call option, "stop waiting, keep listening" | hard: schedule + `cancel`; soft: schedule + leaving the state |
| Invisible retry | not distinguished | `Effect.retry({ while, times })` inside the commit |
| Outcome proposal | `Timeout` is one of Flow's unknown reasons | removed: Flow never times a call out; a hard timeout arrives as `Cancelled`. Sections 3.2, 4.2, 4.3 and 5 of the outcome proposal change with this one |

**Removed:** the `retry`, `retrying` and `timeout` commit options; `{ perAttempt, total }`;
`abandoned`'s pending run and its `"pending"` payload, with rule 12's defect for keys it shares
with the leaving transition; v4 P20's statement that `abandoned` runs actions inline (it now
raises events, whose handlers run them).

**Kept from v4 and the plans:** mapping endings to events, mappers, fencing (P2), `.pending` (P3),
`cancel` (Operations O7), late turns (rule 6), the Attempt and idempotency keys (Operations O3).

**New uses of existing features, no new syntax:** a schedule's delay read from memory
(Machines O5's function form); `armOn` arming a retry; a schedule driving `cancel`.

## 6. Evidence

[spikes/call-dataflow](spikes/call-dataflow/) runs on Effect 4.0.5 (`bun stories.ts`). A fake
server behind `PaymentsApi` takes 100 ms to arrive, 400 ms to process and 100 ms back, and honours
idempotency keys; the controlled clock moves time.

```
1 success                          ["Paid"]                     received 1, applied 1
2 Busy → wait Retry-After → resend ["Busy(att-1#1)","Paid"]     received 2, applied 1
3 cancel at 50ms, signal wired     ["Unsure(att-1#1)","Paid"]   received 1, applied 1   the request never arrived
4 cancel at 50ms, signal NOT wired ["Unsure(att-1#1)","Paid"]   received 2, applied 1   it arrived anyway; the key saved it
5 leave mid-call, abandoned mapped ["late:ChargedAfterLeaving"] received 1, applied 1
6 leave mid-call, nothing mapped   ["late:Dropped"]             evidence, never silent
```

Stories 3 and 4 show why a cancel after the call is `unknown`: the client sees the same thing while
the server truth differs, and re-sending the same Attempt reconciles both without a second charge.
The type checks reject a mapping that misses a failure tag or names one the commit cannot produce.

The machine-side code in section 3 is not compiled, since the machine API does not exist yet.

## 7. Alternatives considered

- **Outcomes as inline transitions** (`failure: { Busy: { target, actions } }`). It removes event
  plumbing but nests the whole transition machinery under the call, away from the state's `on`.
  Rejected.
- **Success keyed by tag.** It works only for tagged success values; guards on the event payload
  work for any value. Rejected.
- **A `retry` handler field, or a call option naming tags** (`retry: { on: ["Busy"] }`). A tag
  list is not Effect's convention (a predicate over the error is), and both add a second retry
  path beside `O.x.retry`. Rejected for the in-machine case.
- **Retry configuration on the error** (`Outcome.failure(err, { retry })`). Errors carry
  information, not configuration. Rejected.
- **A `timeout` call option,** hard or "stop waiting, keep listening". Both are a schedule plus
  `cancel` or plus leaving, which the machine already has. Rejected.
- **A `progress` channel on the transaction.** Its real sources (XHR upload events, a response
  body reader) belong to a separate design for writes that stream. Deferred.
- **A `late` key, `within` ownership and a `.status` read.** Not needed by any example once
  timeouts are schedules. Dropped.
- **A `Backoff` trait.** Possible later as an extraction of 3.3; not the starting point.

## 8. Open

1. **Attempt and idempotency** (out of machine): persisting `sends`, the Attempt Schema, and
   whether re-sending an `unknown` Attempt needs a declared idempotency window.
2. **Coalescing concurrency** (`latest`) for autosave and rapid toggles.
3. **Writes that stream:** LLM generation and upload progress, designed from their sources.
4. **The `armOn` cost in 3.3.** The give-up branch arms the retry too; it is harmless only because
   that branch leaves PAYING. A give-up that stays would need a guard on `RetryNow`. This is
   [revisit.md](revisit.md) item 1 again.
5. **Should `abandoned` be required** (with an explicit ignore) on commits whose late success
   needs compensation, rather than optional with evidence?
