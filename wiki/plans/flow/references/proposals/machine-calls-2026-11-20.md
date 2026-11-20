# Calls made from a machine: timing, waits, reloads and input (proposed, 2026-11-20)

**Bottom line (proposed):** Flow adds no timing or retry option. Time spent *inside one send* (deadline, quick
re-sends of a transient error) lives in the contract function's Effect (`Effect.timeoutOrElse`, `Effect.retry` with
a `Schedule`); time *between endings the user can see* lives in the machine (a state, a schedule, `O.x.retry`).
Before invocation a call waits only on facts Flow owns (acknowledgement, capture, and, if the user adopts it, the
Host's offline signal); a reload never sends work by itself. Every call's input, read or write, passes the
operation's input walker at admission, and the function receives only what passed. The freedom removed: **a second
place to state a call's policy** (contract options, call-site overrides, a hidden Flow retry) and **a call input
nothing checked at run time**.

Answers question 5 of `advisor-questions-2026-11-20.md` (open items 4, 9, 10 and the lookup's input). Unblocks
@task.V3.T21. Fits beside `saved-records-2026-11-20.md` (lane records stay a projection of Compiled; this adds at
most one fact, Q3), `raw-throws-2026-11-20.md` (the same "only the decoded value reaches the function" rule, at the
call boundary) and `fragment-lifetimes-2026-11-20.md` (who holds a read is unchanged: the incarnation).

## Where the data comes from

`fetch` (or an SDK) → the app's adapter Layer (Effect `HttpClient`, `AbortSignal` from Effect's own interruption)
classifies the wire into tagged errors (`NoResponse`, `ServerError`, `Busy`) → the service (`ShopApi`) → the
contract function (`commit`/`lookup`), which is ordinary Effect and owns everything about *one send* → Flow
classifies the fiber's Exit into an ending → the operation's mapping → a machine event. `navigator.onLine` and the
`online`/`offline` events are a Host fact, like `hidden`/`onHidden` today
(code:packages/flow-state-v3/src/host/host.ts#Host).
Prior art: TanStack Query pauses mutations while offline (`networkMode: "online"`) and resumes persisted paused
mutations only when the app registers defaults; XState and Effect have no offline concept.

## 1. Timing and retry (open item 4)

Already decided and kept: no timeout reason (@plan.Operations.O3: "a call's deadline is its commit's Effect"), and
Flow never retries automatically (O2, O3). The fixtures already follow it: `pay` and `transfer` use
`Effect.timeoutOrElse` → `Outcome.unknown(new TimedOut())`; `pay`'s `Busy` carries `retryAfterMs` into memory and
`WAITING` re-commits on a schedule (code:packages/flow-state-v3/fixtures/services/shop/machines/pay.ts).

Proposed rule, one sentence each:

- **Inside the function:** anything the user never sees (deadline, a re-send of a definite transient failure under
  the same `attempt.id`). Flow sees one send; `retryCount` does not move.
- **In the machine:** anything the user sees (a "retrying" notice, a wait from `Retry-After`, a limit). The error
  carries the delay; the mapper puts it in the event; a schedule reads it from memory. `retrying` as progress is a
  machine state, not a Flow field.
- **No per-call override:** a screen that needs another deadline uses another contract (or a non-key input field the
  function reads). No fixture needs one.
- **Streams are the one exception, already decided:** `reconnect: { schedule }` is a contract option because Flow,
  not the author, runs the next connection (O4).

```ts
export const pay = transaction({                                  // existing: transaction
  commit: (input, { attempt }) =>                                 // existing: commit, attempt
    ShopApi.use((api) => api.confirm(input, { idempotencyKey: attempt.id })).pipe(
      Effect.retry({ while: (e) => e._tag === "Busy", times: 2 }), // existing Effect: hidden, same Attempt
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),    // existing: Outcome.unknown
      Effect.timeoutOrElse({ duration: "60 seconds",               // existing Effect: the deadline
        orElse: () => Outcome.unknown(new TimedOut()) }),          // user-defined: TimedOut
    ),
  // ...id, input, key, concurrency, services as today
});
// Machine side, unchanged: Busy → WAITING { schedules: { retry: { schedule: ({ memory }) => memory.retryInMs } } }
```

**Shown by:** nothing new to build. A type test that `transaction`/`resource` have no `timeout`/`retry` key (excess
key refused); the existing `pay` Stories. **Cost:** a doc recipe; a `flow check` hint (optional) when a commit's
`Effect.retry` retries an `Outcome.unknown` (it hides a doubt the machine should hear).

## 2. What waits before invocation (open item 9; the user's choice, Q1)

Today an admitted Attempt waits in InFlight for its turn's acknowledgement, record queues and lane-record capture
(@spec.WriteLanes.R8). Reads wait on nothing, and "Offline status blocks and cancels nothing" (@plan.Operations.O2).

- **A. No offline wait (status quo).** The adapter maps a failed `fetch` to its own tag; the machine shows it. Cost:
  zero; every app writes the "you're offline" branch, and a never-sent write offline may be classified unknown.
- **B. Offline is one more wait for writes only.** `Host` gains `online()`/`onOnline` (the browser platform reads
  `navigator.onLine`); the core sees it as an input fact (deterministic, Story-steppable). An InFlight head not yet
  invoked waits while offline; its row stays `pending` and gains `paused` (proposed name; `waiting` already means a
  non-empty queue); `cancel` ends `NotSent { Cancelled }`. The same signal is O2's missing "connection restored".
  Reads stay ungated (they need an ending to render).
  `navigator.onLine === true` proves nothing, so classification is unchanged once sent.
- **C. B plus a per-contract opt-out** (`whenOffline: "send"`, proposed name) for local or service-worker APIs.

**Recommendation: B**, with C only when a fixture needs it. **Shown by:** a Story (`Fake` host goes offline, commit,
row `paused`, fake server received nothing, online, one send); a run rule "no Invoke while offline"; planted fault:
invoke while offline. **Cost:** one Host member, one input, one gate in the lane table; the save rule in §3.

## 3. What survives a reload (open item 10; the user's choice, Q2)

Kept: an acknowledged Attempt restores `unknown { Restored }`; queued commits end `NotSent { Restored }`; one-off
reads are not persisted except a parked `Interrupted` (O3, @plan.Persistence.O4).

**Needed with §2-B, whichever option below:** an offline-held head is captured with the lane but was never sent, so
today it would restore as `unknown { Restored }`, a false doubt. Rule: the lane record carries `sent` (one boolean,
a fact, not derivable), flipped in a capture that the invocation waits for, *only* for a head that waited on the
gate; a restored head with `sent: false` ends `NotSent { Restored }`. A head never gated is sent right after its
first capture, as today, so the common path pays nothing.

- **A. Never resume (status quo).** Every never-sent commit ends `NotSent { Restored }`; the machine (or the user)
  decides. Honest; no send nobody asked for in this session.
- **B. Resume never-sent work** (TanStack's `resumePausedMutations`): queued and gated heads re-admit in order on
  reload. Costs: lane records must store the queue (against saved-records' "headless lane stores only displaced"),
  an age bound (open item 12's cousin), optimistic layers are not persisted (@spec.Reads I16) so the screen
  disagrees until settled, and it breaks "a commit starts only from an accepted action".
- **C. Opt-in per contract** (`resume: true`, proposed name), serialize only, with a required age bound: an outbox.

**Recommendation: A** now; C later as an "outbox" feature if the user wants offline-first apps, built on §2-B.

## 4. Where a call's input is decoded

Today a write's input passes the operation's input walker at commit (`Unencodable` otherwise,
code:packages/flow-state-v3/src/core/lanes.ts), but a lookup's input is cast (`trusted`,
code:packages/flow-state-v3/src/contract.ts) and reaches the adapter unchecked. Types do not cover refinements:
`memory.paymentMethodId ?? ""` type-checks against a `NonEmpty` field.

Proposed rule: **one admission for every call.** The core runs the same input walker for `lookup` as for `commit`,
before any `Command.Lookup`, by the same `text` check commit uses; only an input that passed is sent. A read that
fails ends `Defect` (a read has no `NotSent`) with an actor issue `InvalidInput` (proposed name) and no request.
Restored write inputs already decode through the lane record (saved-records). **Shown by:** a Story whose select
returns `""` for a `NonEmpty` key (fake server received nothing, `Defect` mapped); a run rule "every Invoke/Lookup
input `is` its Schema"; planted fault: skip the walker on lookup.
**Cost:** one walker check per lookup (its text is kept per object).

## Fixtures

| App, call | Timing today | Offline (2-B) | Reload (3-A) | Input (4) |
| --- | --- | --- | --- | --- |
| shop cart `addLine`, `setQuantity` | unknown on `NoResponse` | waits, `paused` | queued edit → NotSent | walked |
| shop `pay`, `intentStatus` | 60 s; `Busy` → `WAITING` | pay waits; lookup fails | unknown, as today | lookup new |
| transfers `transfer`, `balance` | 30 s; `retryable(times: 1)` | waits, not unknown | unsent → NotSent | lookup new |
| sign-in `save`, `me` | `retryable(times: 3)` in machine | waits | as transfers | lookup new |

No fixture needs a Flow timing option or a per-call override; every visible retry is already a machine state.

## Spikes

- `walk.ts` (bun, real `walkerOf`): the commit path's walker rejects a refinement failure, a wrong type and a missing
  field, and accepts extra fields; the same walker suffices for lookups.
- `retry.ts` (`tsc --strict`, real `transaction`/`resource`): `Effect.retry({ schedule, times, while })` and
  `Effect.timeoutOrElse` inside `commit` and `lookup` type-check today, error tags intact. PASS.

## Sidecar log

None run: the sources were few and read directly; TanStack Query's `networkMode` and `resumePausedMutations` are
cited from memory, not re-checked against its code (see Uncovered).

## Open questions for the user

1. **Offline wait (item 9):** A none / B writes wait on the Host's offline signal / C B plus opt-out. Recommend B.
2. **Never-sent work on reload (item 10):** A never resume / B resume all / C opt-in outbox. Recommend A now, C later.
3. **The `sent` flag:** adopt it with Q1-B (one boolean in lane records, saved only for gated heads), or let gated
   heads restore as `unknown { Restored }`. Recommend adopt; it belongs in saved-records' lane Schema.
4. **Invalid lookup input:** A `Defect` + `InvalidInput` issue / B a new read ending `NotSent`-like. Recommend A.
5. **Per-call deadline override:** A none, use another contract / B an option on `O.x.commit`. Recommend A.

## Uncovered

- Whether `retryCount` or traces should see in-function re-sends (a span per send, from Effect's own tracing).
- Stream sessions under offline (O4 already "retries while offline"); not revisited.
- Prior-art claims about TanStack Query were not re-read from source; check before adopting Q2-C.
- Domain writes (`EntityDomains`) waiting offline: record queues may interact with the gate; not checked.

## Review findings (Sonnet review, 2026-11-20)

Findings for the next lead to resolve; ✓ marks one the coordinator checked in the code. Nothing here is decided.

1. ✓ Wrong: `sent` duplicates the lane record's existing `inFlight` (core/record.ts:43) and breaks WriteLanes R5
   ("derived, never stored"). Keep a waiting head in a never-sent Phase tag instead.
2. `sent: false` is wrong for a Held head retried while offline (it was sent before); gate first sends only.
3. A `paused` row flag breaks "one tag per history and wait, never a flag" (world.ts); use a Phase tag and say
   whether it sits before or after Acknowledging.
4. Domain writes: a paused never-sent head keeps predictions shown and holds the record queue while offline; say
   whether it blocks later writes on the same record.
5. No `Host.online` exists (host.ts has `hidden` only); `navigator.onLine` can be falsely offline with no
   force-send.
6. A hidden in-function retry over a lost answer then failing definitely bypasses `mayHaveApplied` (pay reads it);
   make "retry only definite pre-send failures" a rule.
7. Hidden re-sends change neither `retryCount` nor traces; decide it.
8. The deadline example lives in fixtures/services/shop/operations/writes.ts:56; the `Effect.retry({ while: Busy })`
   example is in no fixture.
