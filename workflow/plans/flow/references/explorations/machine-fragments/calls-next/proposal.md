# Proposal: calls, the machine's half of a server write (calls-next)

Status: proposal, not accepted. It replaces `machine-fragments/in-machine-calls-proposal.md` ("the calls
proposal", CP) as a whole. It keeps `machine-fragments/outcome-proposal.md` ("OP") and proposes four flagged
amendments to it (section 6.4). It answers P1–P23 and R1–R38 of the build
synthesis ([SYNTHESIS.md](SYNTHESIS.md)). The data and type flow, and ten failure sequences (seven run old and new), are checked by the spike in
[spike/](spike/) (`bun stories.ts`, output in section 7). Five built cases are rewritten in [rewrites/](rewrites/).

Paths below: `machine-fragments/` is `workflow/plans/flow/references/explorations/machine-fragments/` in the
repository; `build/` is the builders' folder beside this one.

## 1. The problem

A machine starts a server write and must react to everything that happens to it. CP did this with author-declared
events, an `outcomes` and an `abandoned` mapping per commit, `O.x.retry(attempt)`, `cancel`, `.pending` and
schedules. Five builders wrote 21 cases with it (about 5,800 lines) and four reviewers found that:

- **it is wrong in four places that cost money or security** (P1–P5): the ending is routed when it settles, not
  when the machine handles it, so a queued `StopWaiting` loses a wrong-code strike; a failure on a re-send is
  "definite" although an earlier send may have charged, so the user pays twice; `.pending` goes false before the
  ending's turn, so a timeout says "not charged" for a charge that landed; a declined commit produces nothing, so a
  state waits forever; and v4's late-turn rule forbids the refund that `abandoned` exists to start;
- **it leaves the commonest step unspecified** (P6, P8, P13, P14): which mapping a re-send uses, what `cancel` does
  when nothing runs or the ending is queued, which memory a select or a schedule reads;
- **it is long for the wrong reasons** (P9–P12): every ending is renamed in four places (200 internal events in 17
  machines), the Attempt is copied event → nullable memory → `!` (47 `!`), `NotSent` is mapped 40 times for 6
  `cancel`s, and a visible retry is about 25 lines.

The problem is still the one CP stated: one machine, its own parts (events, memory, schedules, guards, actions),
Flow as no network library, fixtures as the only way a Story reaches the server, everything visible to `flow check`.
What changes is where each fact is kept, and when each decision is taken.

## 2. Where the data comes from

Every value the API exposes, its real source, and the hops to where it is read. "Flow" means Flow's own runtime;
nothing in Flow reads an HTTP status or an author error type.

| Value | Real source | How it reaches the machine |
| --- | --- | --- |
| Status, `Retry-After`, body | the browser's `Response` (`res.status`, `res.headers.get("retry-after")`, `res.json()`) | the adapter service decodes it into a typed result, or fails `NoResponse` when `fetch` rejects (`TypeError`) |
| The send's channel | the commit author's `Outcome.success / failure / unknown`, beside the status it reads (OP 3.1) | Flow's classifier reads the commit fiber's `Exit` and `Cause`, outside that fiber (OP 4.3) |
| The success value `A` | the commit's return | `event.value` on `<call>.success`, typed `A` |
| A failure `X` | the author's error class, built from status and body (e.g. `Busy { retryAfterMs }`) | `event.error` on `<call>.<X._tag>`, typed `X` |
| An unknown reason `U` | the author's `Outcome.unknown(u)`, or Flow's `Cancelled`, `Restored`, `Interrupted`, `Defect` | `event.reason` on `<call>.unknown`, typed `U \| Flow reasons \| StillUnknown<X>` |
| `StillUnknown { failure }` | Flow: this Attempt's send history (an earlier send ended unknown) | replaces a later definite failure (rule 6) |
| `NotSent` | Flow: the adapter was never called (cancel or restore before invocation, superseded under `latest`) | `event.error` on `<call>.NotSent` |
| Attempt `id`, `sends` | Flow mints the id at start and counts each invocation | `event.attempt`, `calls.<call>.attempt`, `calls.<call>.sends` |
| `attempt.idempotencyKey` | Flow, from the id and the send history (rule 7) | the commit puts it on the wire (header or body) |
| `attempt.mayHaveApplied` | Flow: an earlier send of this Attempt ended unknown | the commit's context, to read a response with the write's history (R23) |
| `input` | the call's select, over the turn's final memory and event (rule 10) | `event.input`, `event.attempt.input` |
| `key` | the transaction's `key(input)` (Operations O1) | the call record's key; `event.attempt.key` |
| `superseded` | Flow: a newer Attempt was started on the same key after this one | `event.superseded` |
| `pending`, `last` | Flow's call record (rule 9) | guards, schedules and views: `calls.<call>` / `calls.<call>.at(key)` |
| Cancel | the machine's `C.<call>.cancel` action | `Fiber.interrupt` on the commit → `Effect.tryPromise` aborts the `AbortSignal` it handed the adapter → the browser drops the request **only if the adapter passed it to `fetch`/XHR** |
| "the request reached the server", "the server finished after a cancel" | nothing: no browser API reports either | so a send interrupted after invocation is `unknown`, and clean-up is keyed by the Attempt (3.10) |
| Time | the Runtime Clock; `TestClock` in Stories | schedules (`now`, firing metadata, a keyed schedule's `key`) |
| Server truth in Stories | the fixture (a stateful fake server behind the service) | the Story reads the fixture; no outcome is injected (Testing O3) |

## 3. Public design

### 3.1 The commit: as in OP, plus two Attempt fields

```ts
// checkout.operations.ts (outside the machine): unchanged from the builds except the wire key
export const confirm = transaction({
  id: "Stripe.confirm",
  input: Schema.Struct({ intentId: Schema.String, paymentMethodId: Schema.String }),
  key: (i) => ({ intentId: i.intentId }),                       // a record (Operations O1); one lane per intent
  concurrency: "reject",
  commit: (input, { attempt }) => Effect.gen(function* () {
    const api = yield* StripeApi                                // production wraps fetch; Stories use a fixture
    const res = yield* api.confirm(input, { idempotencyKey: attempt.idempotencyKey }).pipe(   // ← CHANGED: was attempt.id
      Effect.retry({ while: (e) => e._tag === "NoResponse", times: 1 }),                     // invisible: one send, same key
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (res.ok) return yield* Outcome.success(res.intent)
    if (res.status === 402) return yield* Outcome.failure(new CardDeclined({ declineCode: res.declineCode ?? "generic_decline" }))
    if (res.status === 429) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))   // information only
    if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
    return yield* Outcome.failure(new Rejected({ code: res.code }))
  }),
})

// R23: a response read with the write's history, by the author who knows the API
if (res.status === 404 && attempt.mayHaveApplied) return yield* Outcome.success({ alreadyGone: true })  // ← NEW field
```

### 3.2 A call is declared; its endings are derived events

```ts
// checkout.definition.ts
export const Checkout = definition({
  id: "Shop/Checkout",
  states: ["CARD", "PAYING", "WAITING", "UNSURE", "DONE", "LEFT"],
  events: { Pay: { paymentMethodId: Schema.String }, Leave: {} },
  internalEvents: { RetryNow: {}, CheckTick: {}, TookTooLong: {} },   // schedules only: no ending is declared by hand
  calls: { pay: Stripe.confirm },                                     // ← NEW: a named call of a transaction
  memory: { intentId: Flow.input(Schema.String), retryInMs: Flow.initial(Schema.Int, 0), error: Flow.initial(Schema.NullOr(Schema.String), null) },
  operations: { Stripe },
})
```

A call's ending events follow from its commit's Effect type, with nothing declared beside it:

| Derived event | When | Payload (`input`, `attempt`, `superseded` on every one) |
| --- | --- | --- |
| `pay.success` | the Attempt succeeded | `value: A` |
| `pay.CardDeclined`, `pay.Busy`, … | one per failure tag the commit can produce | `error: CardDeclined`, `error: Busy`, … |
| `pay.NotSent` | Flow's failure: the adapter was never called | `error: { _tag: "NotSent", why: "Cancelled" \| "Superseded" \| "Restored" }` |
| `pay.unknown` | it may have happened | `reason: U \| Cancelled \| Restored \| Interrupted \| Defect \| StillUnknown<X>` |

The names are flat and dotted, like XState's `xstate.done.actor.<id>`. A handler for a tag the commit cannot
produce is a type error; so is reading a field the error class does not have (spike `types.ts`, checks 2 and 4).

### 3.3 Starting, sending again, cancelling: actions on the call

```ts
machine(Checkout, ({ S, E, C }) => ({                      // ← NEW: C, the definition's calls
  states: {
    CARD: {
      on: {
        // a new card is a new write: a new Attempt. A second Pay while one is in flight is Denied InFlight (rule 4).
        Pay: { target: S.PAYING, actions: [C.pay.start(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }))] },
      },
    },
    WAITING: { on: { RetryNow: [{ target: S.PAYING, actions: [C.pay.resend(key)] }, { target: "self" }] } },  // ← NEW: the same Attempt
    PAYING: { on: { TookTooLong: { target: "self", actions: [C.pay.cancel(key)] } } },                        // ← CHANGED: on the call
  },
}))
```

- `start(select)` mints an Attempt; `resend(key)` sends the key's current Attempt again; `cancel(key)` interrupts.
  A keyless transaction takes no key: `C.pay.resend()`.
- `resend` takes no Attempt: Flow keeps it (rule 9). Its ending is the same call's events, so no mapping can be
  missing, and it is owned by the transition that resends (rule 2).
- The select reads the memory this turn wrote (rule 10), so `updateMemory: … etag …` and `start(… memory.etag …)`
  in one transition send the new etag.

### 3.4 Handling endings: ordinary handlers, current or late

```ts
const paid = { target: S.DONE, guard: ({ event }) => event.value.status === "succeeded" || deny("NotSucceeded") }
return {
  on: {
    // Late (rule 2): PAYING was left before the ending's turn. One handler, routed from the root.
    "pay.success": [{ ...paid, guard: [S.LEFT, paid.guard] }, { target: "self" }],
    "pay.unknown": { target: "self", actions: [C.read.fetch(key)] },          // never drop a charge that may have landed
  },
  states: {
    PAYING: {
      on: {   // current: the user is still in PAYING (or below it)
        "pay.success": [paid, toRead],
        "pay.CardDeclined": { target: S.CARD, updateMemory: ({ event }) => ({ error: declineMessage(event.error.declineCode) }) },
        "pay.Busy": [
          { target: S.WAITING, guard: ({ event }) => event.attempt.sends < 4 || deny("GaveUp"),
            updateMemory: ({ event }) => ({ retryInMs: event.error.retryAfterMs ?? 1000 * 2 ** event.attempt.sends }) },   // the server's delay wins
          toCard("Stripe is busy. Try again shortly."),   // true: after an unknown send this arrives as pay.unknown (rule 6)
        ],
        "pay.NotSent": toCard("We couldn't reach the payment service. You were not charged."),   // required: this machine cancels
        "pay.unknown": S.UNSURE,
      },
    },
  },
}
```

There is no `outcomes` and no `abandoned`: one event per ending, and where it is handled is decided by the
ordinary routing at the moment the machine handles it. A save that belongs to the app (M1) is started with
`target: "self"` and handled at the root only, once, whether the user stayed or left (`rewrites/m1.save.ts`).

### 3.5 Reading a call: the call record

```ts
guard: ({ calls, memory }) => calls.pay.at({ intentId: memory.intentId }).sends >= MAX_CHECKS || deny("ChecksLeft")   // ← NEW
useView(actor, (s) => s.calls.save.at({ docId }).pending)       // "Saving…" and the leave warning, from the record
uncertain: s.calls.like.at({ id }).last?.channel === "unknown"  // a row's heart is shown as uncertain
```

Per call and key: `{ pending, attempt, sends, last }`, typed from the transaction (`attempt: Attempt<I, K> | undefined`;
reading `.attempt.sends` without the `?` is a type error: spike check 7).

### 3.6 A visible retry: the CALL/WAIT split

```ts
PAYING:  { on: { "pay.Busy": [{ target: S.WAITING, guard: underBudget(4), updateMemory: retryIn }, toCard("busy")] } },
WAITING: {
  schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },   // committed memory (rule 11)
  on: { RetryNow: [{ target: S.PAYING, actions: [C.pay.resend(key)] }, { target: "self" }] },
},
```

Entry arms the wait and leaving cancels it, so "stopping when the user leaves" needs nothing, and no `armOn` arms on
the give-up branch. The view shows "retrying 2 of 3" from `calls.pay.sends`. A fresh budget after a manual Retry is
machine policy, kept in memory (`budgetFrom: calls.pay.sends`).

### 3.7 Waiting

| Need | Form | Spike |
| --- | --- | --- |
| "Still working" after a delay | a schedule on the owner state that sets memory | — |
| Stop waiting, keep listening (soft) | a schedule whose handler leaves the owner state; the real ending is then late (rule 2) | P1 |
| Abort a hung request (hard) | a schedule whose handler runs `C.x.cancel(key)`; the ending is `unknown(Cancelled)`, or the real one if it already settled (rule 12) | P3, P3b |
| A transport deadline the UI never sees | inside the commit: `Effect.timeoutOrElse({ duration, orElse: () => Outcome.unknown(new NoResponse()) })` | — |
| A deadline racing a write (seat hold) | a schedule on the enclosing state; the handler chooses, knowing `calls.x.pending` stays true until the ending's turn | — |

### 3.8 Reconciling an unknown

```ts
UNSURE: {
  schedules: { check: { schedule: "3 seconds", send: E.CheckTick } },
  on: { CheckTick: [{ target: S.PAYING, actions: [C.pay.resend(key)] }, { target: "self" }] },   // never a new Attempt
},
```

Re-sending is safe when the server dedups by key. Where it does not, reconcile with a read call (3.12). Once a send
has ended unknown, a later definite failure of the same Attempt arrives as `pay.unknown` with
`reason: { _tag: "StillUnknown", failure }` (rule 6), so a give-up branch can never tell the user "not charged" after
a send that may have charged. This closes the double charge of correctness C3 (spike P2).

### 3.9 Leaving, and compensation

```ts
// booking: the user left mid-charge; the charge lands. LEFT owns no call, so the late handler may move it.
on: {
  "charge.success": [{ target: S.REFUNDING, guard: [S.LEFT], actions: [C.refund.start(({ event }) => ({ paymentId: event.value.paymentId }))] }, { target: "self" }],
  "charge.unknown": [{ target: S.SETTLING, guard: [S.LEFT], actions: [C.charge.resend(({ event }) => event.attempt.key)] }, { target: "self" }],
},
REFUNDING: { on: { "refund.success": S.REFUNDED, … } },   // REFUNDING owns the refund: its endings are current and may move
```

Lateness is not transitive: a call started by a late turn is an ordinary call with its own owner (rule 3), so the
compensation chain can finish (spike P4).

### 3.10 Cancel, then clean up

```ts
UPLOADING: {
  on: {
    Cancel: { target: "self", actions: [C.upload.cancel(key)] },
    "upload.NotSent": S.CANCELLED,                       // never left the device: nothing to clean
    "upload.unknown": {                                  // Cancelled after the adapter was called: it may still land
      target: S.CLEANING,
      actions: [C.discard.start(({ event }) => ({ ref: event.input.ref, uploadKey: event.attempt.idempotencyKey }))],
    },
  },
},
```

The client cannot stop a body already sent, and no browser API says when the server is done with it. So the
clean-up names the write by its key and the server applies it whenever the upload arrives (a tombstone). Flow's part:
the key reaches the clean-up typed, and the call stays `pending` until the commit's fiber has exited, so a resend
cannot run beside it on the client (rule 12). Spike P8 runs both clean-ups against the same late upload.

### 3.11 Concurrency

| Mode | Meaning (per actor, descriptor and key, Operations O3) |
| --- | --- |
| `reject` | **← CHANGED** an implicit guard: a start on a pending key is Denied `InFlight`, in turns and in `check()` |
| `latest` | **← NEW** one send in flight, at most one waiting; a newer start replaces the waiting one, which ends `NotSent { why: "Superseded" }`; the waiting one goes when the in-flight one settles; every ending carries `superseded` |
| `cancel`, `allow`, `serialize` | unchanged; a cancelled or replaced queued start ends `NotSent` |

```ts
// B1 likes: rapid toggles; the input reads the memory this turn flipped (rule 10). No hand-written coalescing.
Toggle: { target: "self", updateMemory: flip, actions: [C.like.start(({ memory, event }) => ({ id: event.id, liked: desired(memory, event.id) }))] },
"like.Refused": [{ target: "self", guard: ({ event }) => event.superseded || deny("Latest") }, revertToConfirmed],   // never undo newer intent
```

### 3.12 Reads around writes

```ts
calls: { pay: Stripe.confirm, read: Stripe.intent },     // ← NEW: a resource may be a call too
READING: { on: { PollTick: { target: "self", actions: [C.read.fetch(key)] }, "read.success": […], "read.ReadFailed": { target: "self" } } },
```

A resource call derives `success` and one event per failure tag, never `unknown`, `NotSent` or an Attempt; `fetch`
has Operations O2's `refetch` semantics (joins a running request). Its endings are routed like a write's (rule 2).

### 3.13 Time per key: keyed schedules

```ts
schedules: {
  unlock: {                                                                   // ← NEW: one timer per key
    keys: ({ memory }) => Object.keys(memory.lockedUntil),
    schedule: ({ key, memory, now }) => Duration.millis(Math.max(0, memory.lockedUntil[key] - now)),
    send: E.Unlock.from(({ key }) => ({ key })),
  },
},
```

A key's timer is armed when the key first appears in the committed list, cancelled when it leaves, and fires once.
This replaces the builders' "one timer aimed at the earliest lock" (45 lines) and the "first unsure row" tick.

### 3.14 Per-item results of a batch

Each item is its own call (`allow`, keyed by item), with its own Attempt, classification and cache rule. The batching
happens below the commit, in the adapter, with Effect's `RequestResolver`: the commits call
`Effect.request(Archive({ id, key }), resolver)` and the resolver sends one HTTP request and completes each entry
from the per-item statuses. Not spiked.

### 3.15 Stories

```ts
const busyThenPaid = story.machine(Checkout, { id: "Checkout/busy-then-paid", fixtures: FakeStripe({ script: [{ status: 503, retryAfterMs: 2000 }] }) })
  .send(E.Pay()).advance("3 seconds").process()
  .checkpoint("paid", ({ truth }) => truth.FakeStripe.charges === 1)   // ← NEW: the fixture's truth, read, not commented
```

A fixture may expose its truth; a checkpoint reads it. Every ending is producible through services: `unknown` by a
dropped response, `NotSent` by a cancel during the Attempt's storage acknowledgement or by `latest` (spike P11, P16).

## 4. Rules

1. **Calls are declared.** `calls: { name: descriptor }` names each call of a definition. A transaction's call
   derives `name.success`, `name.<Tag>` for each failure tag of its commit plus `NotSent`, and `name.unknown`; an
   untagged failure type derives `name.failure`. A resource's call derives `name.success` and its failure tags.
   Derived events are in `E` under their names, may be listed in `armOn`, and cannot be sent or raised. Their
   payloads are typed from the commit's Effect (2). An author error whose tag is one of Flow's reasons
   (`NotSent`, `Cancelled`, `Restored`, `Interrupted`, `Defect`, `StillUnknown`) or `success`/`unknown` is a type error.
2. **Owner, current, late, decided at admission.** A start or resend is owned by the activation of the state its
   transition names (`"self"`: the handler's own state). When the ending's turn is **admitted** (v4 2.5 step 1), Flow
   tests the owner against the pre-turn snapshot. If that activation is still alive, the ending is **current** and
   routes from the active leaf like any event. Otherwise it is **late** and routes from the nearest strict ancestor of
   the owner whose activation is the one alive when the call started (the root at worst). Nothing is decided at
   settlement.
3. **Late turns.** In a late ending's turn, an alternative whose target would exit a state that owns another pending
   call, or an active subroutine, is denied (`LateMayNotLeave`); so a late handler ends in an alternative that does
   not move (`flow check`). A call started in a late turn is an ordinary call with its own owner: lateness is not
   transitive.
4. **Implicit guards.** An alternative is declined, with a reason in `Denied.reasons`, when one of its actions would
   start a `reject` call on a pending key (`InFlight`), or resend a key that is pending (`InFlight`) or holds no
   Attempt (`NothingToResend`). The same check runs in `check()`, so a view's button is disabled for the same reason.
   For rule 8 totality, such an alternative counts as guarded.
5. **Every start ends once.** Every admitted `start` and `resend` delivers exactly one ending event. A decline (rule
   4) admits nothing, so it is a denial, not an ending.
6. **The Attempt's ending.** Each send is classified as in OP 4.3. The ending delivered is the Attempt's: success if
   this send succeeded; a definite failure only if no earlier send of the same Attempt ended unknown; otherwise
   `unknown` with reason `StillUnknown { failure }`.
7. **The wire key.** `attempt.idempotencyKey` is `attempt.id` until a send ends in a definite failure while nothing
   may have applied; each such failure moves it to `${id}~n`. Once a send has ended unknown, the key it used is the
   key for every later send of that Attempt. `id` stays the Attempt's identity in records, traces and persistence.
8. **Required handling** (`flow check`). Every current ending that can occur is handled totally from every leaf under
   its owner (fall-through to ancestors included). `NotSent` can occur only when the machine cancels the call, its
   concurrency is `latest` or `serialize`, or the actor is persisted. A late `success` or `unknown` is handled at a
   strict ancestor of the owner. A late failure with no handler is dropped with evidence: the server did nothing.
9. **The call record and `.pending`.** Per call and key, Flow keeps `{ pending, attempt, sends, last }`. `pending` is
   true from the starting turn until the ending's turn of every outstanding Attempt of the key is admitted (a waiting
   `latest` start included). The ending's own turn sees the record with that ending applied, so it may resend. `attempt`
   is the key's current Attempt: replaced by `start`, kept after a failure or unknown, cleared after success. Records
   persist with the actor; Persistence O6 acknowledges the Attempt before invocation.
10. **Inputs read the turn's final memory.** A call's input and key selects read the memory with every patch of the
    turn applied, the event, and `now`. They are computed in step 5 (validation), so an invalid input rejects the turn.
11. **Schedules.** A function schedule reads the committed memory of the arming turn. `armOn` counts an event
    accepted anywhere on the active path. A keyed schedule (`keys`) keeps one timer per key of the committed list:
    armed when the key first appears, cancelled when it leaves, firing once with `key` in its metadata.
12. **Cancel.** Before invocation: the ending is `NotSent { why: "Cancelled" }`. After invocation, before settlement:
    the commit's fiber is interrupted; the ending (`unknown`, `Cancelled`) is queued when the fiber has exited, and the
    key stays pending until its turn. After settlement, or with nothing outstanding: no effect, with evidence. **A
    settled ending is never rewritten.**
13. **No Flow timeout and no Flow retry** (CP rule 7, kept). **Classification runs outside the fiber it interrupts**
    (CP rule 8, kept).

### 4.1 Turn-level timing

| Moment | What happens |
| --- | --- |
| The starting turn, step 5 | input and key computed from the final memory (rule 10); implicit guards (rule 4) |
| The starting turn, step 6, after publish | Attempt minted; the record's `attempt` replaced; `pending` true; owner recorded |
| Invocation | after the Persistence O6 acknowledgement; from here a cancel means `unknown` |
| Settlement | the send is classified (OP 4.3) and its ending queued in the FIFO mailbox; the record is not touched; `pending` stays true; under `latest` the waiting start is invoked now |
| A cancel | rule 12 |
| The ending's admission (step 1) | rule 6 applied; the record updated (`last`, `sends`, `attempt`, `pending`); owner tested (rule 2) |
| The ending's turn, steps 2–6 | ordinary selection, rule 3 if late; a resend here is not `InFlight` |
| A timer of a dead activation | discarded at admission (Machines O5) |
| Restore | an invoked send ends `unknown` (`Restored`); an unacknowledged one `NotSent` (`Restored`); saved endings are delivered after readiness (Persistence O4) and routed by rule 2 then |

## 5. How it is implemented

The spike's `flow.ts` (about 400 lines) is the reference: the transaction and `CallEvent` types, the call record,
and a turn runtime. At settlement a watcher fiber pushes `{ record, outstanding, sendEnding }`; at admission
`admitEnding` applies rule 6, updates the record and builds the event; routing starts from the leaf or from the
surviving ancestor (rule 2). `Legacy` flags switch each old behaviour back on so every Story can run old and new on
the same machine and fixture. The machine API is a stand-in (states as dotted paths; no traits, no persistence).

## 6. Changes

### 6.1 Added

| Added | Kind | Example |
| --- | --- | --- |
| `calls: { name: descriptor }` | definition category, after `internalEvents` | `calls: { pay: Stripe.confirm }` |
| Derived ending events | events | `"pay.Busy": { … event.error.retryAfterMs … }` |
| `C.<call>.start / resend / cancel`, `C.<read>.fetch` | actions on the call | `C.pay.resend(key)` |
| The call record | `calls` in guards and schedules, `s.calls` in views | `calls.save.at({ docId }).pending` |
| `attempt.idempotencyKey`, `attempt.mayHaveApplied` | Attempt fields | `{ idempotencyKey: attempt.idempotencyKey }` |
| `StillUnknown { failure }` | Flow's unknown reason | rule 6 |
| `superseded` | ending payload field | `guard: ({ event }) => event.superseded \|\| deny(…)` |
| `concurrency: "latest"` | transaction option | likes, autosave |
| `InFlight`, `NothingToResend`, `LateMayNotLeave` | denial codes | `check(s, E.Save())` → `Denied ["InFlight"]` |
| Keyed schedules (`keys`) | schedule option | per-challenge lockout |
| A checkpoint reading fixture truth | Testing | `.checkpoint("paid", ({ truth }) => …)` |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| How an ending reaches the machine | `outcomes` maps it to an author-declared event (CP 3.2, v4 P2) | a derived event (rule 1) |
| When `outcomes` vs `abandoned` is chosen | at settlement (CP spike) | owner tested at admission (rule 2) |
| `.pending` | false at settlement (CP spike) or "until real settlement" (v4 P3) | until the ending's turn is admitted (rule 9) |
| `concurrency: "reject"` | "declines … without work or outcome" (Operations O3) | an implicit guard, Denied `InFlight` (rule 4) |
| Re-send | `O.x.retry(select[, options])` taking an Attempt (Operations O3, CP rule 3) | `C.x.resend(key)`; no Attempt, no options, same events |
| `cancel` | silent before invocation (Operations O7); "final" after (CP rule 4) | rule 12 for all four cases |
| Late turns | transitive; the last alternative of each handler must not move (v4 rule 6) | rule 3: not transitive; deny only exits of states owning another call |
| Commit selects | the pre-turn snapshot (Machines O3, v4 2.5) | the turn's final memory (rule 10) |
| Function schedules | memory unspecified (Machines O5) | committed memory; `armOn` on any accepted event on the active path (rule 11) |
| `failure` in the outcome proposal | "it definitely did not happen" | for this send; the Attempt's ending is rule 6 (**OP amendment**) |
| `NotSent` | mapped in every `failure` (CP rule 1) | handled only where it can occur (rule 8) |
| The key on the wire | `attempt.id` (Operations O3) | `attempt.idempotencyKey` (rule 7) |
| Read outcomes | unfenced events reaching "the actor's later state" (Operations O2, Machines O6) | read calls routed by rule 2 |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| The `outcomes` and `abandoned` commit options and `E.X.from((v, { input, attempt }) => …)` for endings | CP 3.2, 3.6; v4 P2, P10 | derived events; one table instead of two (P7, P10) |
| Hand-declared ending events in `internalEvents` | CP 3.2 | derived (73 → 18 internal events in the five rewrites) |
| `Flow.uncertain` | OP 3.3, v4 | the derived `unknown` event is the only target an unknown can reach (P22) |
| `Timeout` as a Flow reason | OP 3.2 | Flow has no timeout (CP, confirmed) |
| Exported `X.Attempt` Schema in author events and memory | CP rule 2 | Flow keeps the Attempt (P9); it stays for persistence |
| v4 rule 12's "outcome handlers outside the fenced state" | construction error | late endings are handled outside the owner by definition |
| v4 rule 6's "the last alternative must not move" for every late chain | v4 2.4 | replaced by rule 3 |

Kept: OP's `Outcome` API, three channels, classifier and cache table; the Attempt and its id minted by Flow;
fixtures as services; schedules; cancel by interruption; fencing by activation (now "owner").

### 6.4 Amendments to the outcome proposal (flagged)

1. Section 2, failure: "it definitely did not happen" becomes "this send definitely did not do it"; the Attempt's
   ending is rule 6, and `StillUnknown { failure }` joins the unknown reasons (fixes P2).
2. Section 3.2: drop `Timeout` (CP had already); `NotSent` also covers `Superseded` and `Restored`, with a `why`.
3. Section 3.3 ("In the machine: the call's `outcomes`") is replaced by section 3.2–3.4 here; `Flow.uncertain` goes.
4. Section 3.3, recovering from unknown: `C.x.resend(key)`, not `O.x.retry(attempt)`; the wire key is rule 7.

## 7. Evidence

### 7.1 The spike

[spike/](spike/) runs on Effect 4.0.5: `tsc -p spike` then `bun spike/stories.ts`. `types.ts` holds 11
`@ts-expect-error` checks: success value fields, error class fields, the unknown union and `StillUnknown`'s failure
type, a handler for a tag the commit cannot produce, the input type of a select, the key shape of a keyed record,
`resend` of a keyed call without a key, a possibly absent Attempt, a select narrowed to its handler's event, and a
reserved tag. `machines.ts` has no `!`, cast or hand-declared ending. Each Story runs the new rule, then the old one
it replaces, on the same machine and the same fixture, and asserts server truth.

Finding: v4's `machine(def, (h) => body)` callback is context-sensitive, so TypeScript drops its excess-property check
and a handler for a non-existent event is not a type error. The spike uses `machine<Ev>()(def).define(body)` (open 3).

```
tsc: 0 errors (11 @ts-expect-error checks hold)

P1 mailbox race: NEW (routed when the turn is admitted)
   t=    0 Submit TWO_FACTOR.ENTERING → TWO_FACTOR.VERIFYING
   t=15020 StopWaiting TWO_FACTOR.VERIFYING → TWO_FACTOR.ENTERING
   t=15020 verify.WrongCode(a1#1) [late] TWO_FACTOR.ENTERING
   PASS the late WrongCode strikes its own challenge at the root

P1 mailbox race: OLD (outcomes/abandoned chosen at settlement)
   t=    0 Submit TWO_FACTOR.ENTERING → TWO_FACTOR.VERIFYING
   t=15020 StopWaiting TWO_FACTOR.VERIFYING → TWO_FACTOR.ENTERING
   t=15020 verify.WrongCode(a1#1) Unhandled: LOST
   PASS old rule: the strike is lost (reproduces correctness C1)

P2 unknown then failure: NEW (the Attempt's ending: failure after unknown stays unknown)
   t=    0 Pay CARD → PAYING
   t= 1000 pay.unknown(a1#1) PAYING → UNSURE
   t= 2500 CheckTick UNSURE → PAYING
   t= 2700 pay.unknown(a1#2) PAYING → UNSURE
   t= 3000 TookTooLong discarded (its state was left)
   t= 4200 CheckTick UNSURE → PAYING
   t= 4400 pay.unknown(a1#3) PAYING → UNSURE
   t= 5500 TookTooLong discarded (its state was left)
   t= 5900 CheckTick UNSURE → PAYING
   t= 6100 pay.unknown(a1#4) PAYING → UNSURE
   t= 7200 TookTooLong discarded (its state was left)
   t= 7600 CheckTick UNSURE → PAYING
   t= 7800 pay.unknown(a1#5) PAYING → UNSURE
   t= 8900 TookTooLong discarded (its state was left)
   t= 9300 CheckTick UNSURE → PAYING
   t= 9500 pay.unknown(a1#6) PAYING → UNSURE
   t=10600 TookTooLong discarded (its state was left)
   t=11000 CheckTick UNSURE → PAYING
   t=11200 pay.success(a1#7) PAYING → DONE
   t=12300 TookTooLong discarded (its state was left)
   t=14000 TookTooLong discarded (its state was left)
   server truth: charges=1 keys=["a1","a1","a1","a1","a1","a1","a1"]
   PASS charged once; the machine never said 'not charged'

P2 unknown then failure: OLD (a failure on a re-send is definite)
   t=    0 Pay CARD → PAYING
   t= 1000 pay.unknown(a1#1) PAYING → UNSURE
   t= 2500 CheckTick UNSURE → PAYING
   t= 2700 pay.Busy(a1#2) PAYING → WAITING
   t= 3000 TookTooLong discarded (its state was left)
   t= 3200 RetryNow WAITING → PAYING
   t= 3400 pay.Busy(a1#3) PAYING → WAITING
   t= 3900 RetryNow WAITING → PAYING
   t= 4100 pay.Busy(a1#4) PAYING → CARD
            user reads "The bank is busy. You were not charged." and presses Pay again
   t= 4500 Pay CARD → PAYING
   t= 5500 TookTooLong discarded (its state was left)
   t= 6200 TookTooLong discarded (its state was left)
   t= 6900 TookTooLong discarded (its state was left)
   t= 7500 TookTooLong PAYING
   t= 7510 pay.unknown(a2#1) PAYING → UNSURE
   t= 9010 CheckTick UNSURE → PAYING
   t= 9210 pay.Busy(a2#2) PAYING → WAITING
   t= 9710 RetryNow WAITING → PAYING
   t= 9910 pay.Busy(a2#3) PAYING → WAITING
   t=10410 RetryNow WAITING → PAYING
   t=10610 pay.Busy(a2#4) PAYING → CARD
   t=12010 TookTooLong discarded (its state was left)
   t=12710 TookTooLong discarded (its state was left)
   t=13410 TookTooLong discarded (its state was left)
   server truth: charges=2 keys=["a1","a1","a1","a1","a2","a2","a2","a2"]
   PASS old rule: the card is charged twice (reproduces correctness C3)

P3 timeout racing the ending: NEW (.pending until the ending's turn; cancel never rewrites a settled ending)
   t=    0 Pay CARD → PAYING
   t= 3020 TookTooLong PAYING
   t= 3020   pay.cancel: nothing unsettled (no-op, evidence)
   t= 3020 pay.success(a1#1) PAYING → DONE
   server truth: charges=1; screen: DONE ""
   PASS the real ending wins: DONE, charged once

P3 timeout racing the ending: OLD (.pending false at settlement)
   t=    0 Pay CARD → PAYING
   t= 3020 TookTooLong PAYING → CARD
   t= 3020 pay.success(a1#1) [late] CARD
   server truth: charges=1; screen: CARD "That took too long. You were not charged."
   PASS old rule: 'You were not charged' shown, but the card was charged

P3b timeout before the ending: cancel → unknown(Cancelled) → same Attempt again
   t=    0 Pay CARD → PAYING
   t= 3000 TookTooLong PAYING
   t= 3010 pay.unknown(a1#1) PAYING → UNSURE
   t= 4510 CheckTick UNSURE → PAYING
   t= 4710 pay.unknown(a1#2) PAYING → UNSURE
   t= 6210 CheckTick UNSURE → PAYING
   t= 6410 pay.success(a1#3) PAYING → DONE
   t= 7510 TookTooLong discarded (its state was left)
   t= 9210 TookTooLong discarded (its state was left)
   server truth: charges=1 keys=["a1","a1","a1"]
   PASS charged once, reconciled by key

P5 decline: NEW (reject is an implicit guard: Denied InFlight)
   t=    0 Edit DOC.EDITING
   t=    0 Save DOC.EDITING → DOC.SAVING
   t=  200 OpenList DOC.SAVING → LIST
   t=  200 OpenDoc LIST → DOC.EDITING
   t=  200 Edit DOC.EDITING
            check(Save) = Denied ["InFlight"]   (what the view's button reads)
   t=  200 Save Denied ["InFlight"]
   t= 1000 save.success(a1#1) [late] DOC.EDITING
   server truth: puts=1; final state DOC.EDITING
   PASS the second Save is Denied and the user stays in EDITING

P5 decline: OLD (reject declines silently)
   t=    0 Edit DOC.EDITING
   t=    0 Save DOC.EDITING → DOC.SAVING
   t=  200 OpenList DOC.SAVING → LIST
   t=  200 OpenDoc LIST → DOC.EDITING
   t=  200 Edit DOC.EDITING
            check(Save) = Allowed   (what the view's button reads)
   t=  200 Save DOC.EDITING → DOC.SAVING
   t=  200   save.start declined silently (legacy)
   t= 1000 save.success(a1#1) [late] DOC.SAVING
   server truth: puts=1; final state DOC.SAVING
   PASS old rule: SAVING waits forever (reproduces correctness C5)

P6 retry mapping: NEW (resend: same Attempt, same events, fresh wire key after a definite failure)
   t=    0 Pay CARD → PAYING
   t=  200 pay.Busy(a1#1) PAYING → WAITING
   t= 2200 RetryNow WAITING → PAYING
   t= 2700 pay.success(a1#2) PAYING → DONE
   t= 3000 TookTooLong discarded (its state was left)
   t= 5200 TookTooLong discarded (its state was left)
   server truth: charges=1 keys=["a1","a1~1"]
   PASS pay.Busy(a1#1) → WAITING 2 s (from Retry-After) → pay.success(a1#2)

P6 retry mapping: OLD wire key (the Attempt id again: the server replays its cached 503)
   t=    0 Pay CARD → PAYING
   t=  200 pay.Busy(a1#1) PAYING → WAITING
   t= 2200 RetryNow WAITING → PAYING
   t= 2400 pay.Busy(a1#2) PAYING → WAITING
   t= 3000 TookTooLong discarded (its state was left)
   t= 4400 RetryNow WAITING → PAYING
   t= 4600 pay.Busy(a1#3) PAYING → WAITING
   t= 5200 TookTooLong discarded (its state was left)
   t= 6600 RetryNow WAITING → PAYING
   t= 6800 pay.Busy(a1#4) PAYING → CARD
   t= 7400 TookTooLong discarded (its state was left)
   t= 9600 TookTooLong discarded (its state was left)
   server truth: charges=0 keys=["a1","a1","a1","a1"]
   PASS old key: the cached failure comes back every time (reproduces correctness C12)

P8 cancel then clean-up: OLD (discard by ref: whatever is there now)
   t=    0 Pick IDLE → UPLOADING
   t=  500 Cancel UPLOADING
   t=  510 upload.unknown(a1#1) UPLOADING → CLEANING
   t=  610 discard.success(a2#1) CLEANING → CANCELLED
   server truth: files=1 refused=0; final state CANCELLED
   PASS old clean-up: the file lands after the discard (reproduces correctness C8)

P8 cancel then clean-up: NEW (discard by the Attempt's key; the server refuses a later arrival)
   t=    0 Pick IDLE → UPLOADING
   t=  500 Cancel UPLOADING
   t=  510 upload.unknown(a1#1) UPLOADING → CLEANING
   t=  610 discard.success(a2#1) CLEANING → CANCELLED
   server truth: files=0 refused=1; final state CANCELLED
   PASS no orphan: the upload that lands at 2 s is refused

P16 latest coalescing: Toggle at 0, 50, 100 ms; each request takes 300 ms
   t=    0 Toggle READY
   t=   50 Toggle READY
   t=  100 Toggle READY
   t=  100 like.NotSent(a2#1,superseded) READY
   t=  300 like.success(a1#1,superseded) READY
   t=  600 like.success(a3#1) READY
   server truth: requests=["a1:true","a3:true"] liked=true
   PASS two requests; the server ends at the last click

P4 compensation chain: leave mid-charge, the charge lands, refund, REFUNDED
   t=    0 Pay CARD → PAYING
   t=  300 Leave PAYING → LEFT
   t= 1000 pay.success(a1#1) [late] LEFT → REFUNDING
   t= 1300 refund.success(a2#1) REFUNDING → REFUNDED
   server truth: charges=1 refunds=1
   PASS the refund started by a late turn finishes (v4 rule 6 forbade it)

P11 NotSent is producible: cancel while the Attempt's storage ack is pending (50 ms)
   t=    0 Pick IDLE → UPLOADING
   t=   20 Cancel UPLOADING
   t=   30 upload.NotSent(a1#1) UPLOADING → CANCELLED
   server truth: files=0; final state CANCELLED
   PASS upload.NotSent: nothing left the device, no clean-up needed

all stories pass
```

Reading the traces: `t=15020` is the first turn after a held mailbox (the main thread was busy from 14.990 s); P2's
"TookTooLong discarded" lines are timers of PAYING activations already left (Machines O5). In P3 the cancel finds the
send settled and changes nothing, so the real success is delivered. In P6 the second send uses `a1~1` because the
first ended in a definite failure, so the server's cached 503 cannot answer it.

Not spiked: `flow check` (rules 3 and 8), keyed schedules, read calls, `serialize`, persistence and restore, the
`RequestResolver` batch, `LateMayNotLeave` (implemented in the runtime, not exercised by a Story).

### 7.2 The rewrites

[rewrites/](rewrites/) holds definition and machine for five cases; the operations files are unchanged except the
wire key (rule 7), `latest` on likes and key records in auth. Counts are definition + machine, without blank and
comment lines; characters exclude whitespace and comments. The rewrites' lines are wider, so characters are the
fairer measure.

| Case | Lines before → after | Characters before → after | Internal events | `!` | INVENTED |
| --- | --- | --- | --- | --- | --- |
| payments `checkout` (E1–E3) | 246 → 136 | 7,727 → 5,286 | 20 → 6 | 2 → 0 | 1 → 0 |
| payments `booking` (F1) | 276 → 157 | 11,071 → 7,483 | 25 → 6 | 14 → 5 | 6 → 0 |
| auth `signin` | 206 → 121 | 6,163 → 5,351 | 10 → 3 | 0 → 0 | 3 → 1 |
| editing `list` (B1, B2) | 317 → 147 | 12,062 → 8,425 | 13 → 2 | 11 → 0 | 1 → 0 |
| lifecycle `m1.save` | 118 → 59 | 4,016 → 2,631 | 5 → 1 | 1 → 0 | 3 → 0 |
| **total** | **1,163 → 620 (−47%)** | **41,039 → 29,176 (−29%)** | **73 → 18** | **28 → 5** | **14 → 1** |

- The five `!` left in `booking` are on memory set on entry to HELD (`holdId`, `expiresAt`) or in the charge's
  success turn (`paymentId`): v4 has no state-scoped memory. None is on an Attempt.
- The one INVENTED is the builder's: `Flow.state` without traits (a v4 gap).
- Behaviour changes, all deliberate: `signin` keeps one timer per locked challenge (keyed schedule) instead of one
  aimed at the earliest; `list` coalesces likes with `latest` and reconciles each unsure row on its own timer;
  `m1.save` drops its SAVING state ("saving" is `calls.save.at(key).pending`) and writes each handler once; the
  `booking` confirm and charge give-ups can no longer refund a real booking or say "not charged" after an unknown send.

## 8. Coverage

### 8.1 Requirements

| R | Met by | Shown |
| --- | --- | --- |
| R1 start from a user action, same-turn values | `C.x.start(select)`; rule 10 | spike P16, `m1.save` |
| R2 stable identity, the idempotency key | Attempt id; rule 7; records persist (rule 9) | P6, P3b |
| R3 new write vs the same again | `start` vs `resend`; `start` replaces the record's Attempt, so a replaced write cannot be resent | checkout E3 |
| R4 independent writes per key | keyed calls, `calls.x.at(key)` | `list`, types 6 |
| R5 one per key, a defined decline | rule 4 (`InFlight`) | P5 |
| R6 latest-wins coalescing | `latest`, `superseded` | P16 |
| R7 order per key, dependent creates | `serialize` (unchanged); the dependent write starts in the create's success handler with the server's id | `list` |
| R8 one ending reaches the machine | rules 5, 8; a decline is a denial, not a write | P5, P11 |
| R9 typed, exhaustive, only possible endings | rule 1 (types), rule 8 (`flow check`, `NotSent` conditional) | types 1–4 |
| R10 an ending is about the write | rule 6 | P2 |
| R11 success that is not completion | guards on `event.value` | `checkout` (`requires_action`) |
| R12 per-item batch results | one call per item, batched in the adapter (3.14) | not spiked |
| R13 the ending reaches the activation current when handled | rule 2 | P1 |
| R14 "still working" | a schedule on the owner state | `checkout` |
| R15 soft stop waiting | leave the owner; the late ending still counts | P1 |
| R16 hard abort | schedule + cancel → `unknown(Cancelled)` | P3b |
| R17 a deadline races a write | rules 9, 12; FIFO mailbox | P3 |
| R18 time per key | keyed schedules (rule 11) | `signin`, `list`; not spiked |
| R19 server-dictated delays | `event.error.retryAfterMs` → memory → schedule | P6 |
| R20 visible retry, budget, leave stops it, fresh budget | CALL/WAIT (3.6); `sends`; fresh budget in memory | P6; budget reset is a recipe |
| R21 invisible transport retries | `Effect.retry` inside one send (3.1) | — |
| R22 reconcile an unknown | resend, or a read call | P2, P3b |
| R23 interpret with history | `attempt.mayHaveApplied` | 3.1 |
| R24 same write after a sub-flow; a modified write is new | resend (fresh wire key after a definite failure); `start` | P6 |
| R25 leaving does not cancel; the ending updates elsewhere | rule 2; root handlers | P5, `m1.save` |
| R26 compensation after leaving can finish | rule 3 | P4 |
| R27 a late result never takes the user out of live work | rule 3 (`LateMayNotLeave`) | implemented, not exercised |
| R28 cancel in every case; clean-up not racing | rule 12; clean-up keyed by the Attempt | P3, P8, P11 |
| R29 writes while the page closes | **scoped out** (P19) | — |
| R30 reload mid-write | records persist; `Restored` endings routed by rule 2 | not spiked |
| R31 poll a long job | a read call + a schedule | `checkout` READING |
| R32 truth on another channel | an ordinary event; the call's real ending arrives later and is handled late | recipe |
| R33 per-key reads for views and guards | the call record | types 6, 7 |
| R34 Stories mock through services and produce every ending | fixtures; `NotSent` via cancel-before-ack and `latest`; truth asserted | all Stories |
| R35 statically analysable | calls declared; events derived; owners from transitions; rules 3, 8 | not spiked |
| R36 errors carry information | no flags on errors; Flow reads no status | 3.1 |
| R37 typed end to end, inferred | `CallEvent<N, T>` from the commit's Effect; no `!`, cast or parallel declaration on the path | types.ts |
| R38 the same path with a fixture | the Stories | all Stories |

### 8.2 Problems

| P | Answer | Status |
| --- | --- | --- |
| P1 routed at settlement | rule 2: owner tested at admission | resolved, spike P1 |
| P2 failure on a re-send treated as definite | rule 6 (`StillUnknown`); OP amendment 1 | resolved, spike P2 |
| P3 `.pending` false early; cancel undefined | rules 9 and 12 | resolved, spike P3, P3b |
| P4 late rule forbids compensation | rule 3; v4 rule 12's fence error removed | resolved, spike P4 |
| P5 silent decline | rule 4 | resolved, spike P5 |
| P6 retry has no mapping | `resend` on the call; same derived events; owned by its transition | resolved, spike P6 |
| P7 unmapped late unknown dropped; copied tables | one event routed by rule 2; rule 8 makes late `success`/`unknown` handling a `flow check` error; ignoring is a visible `{ target: "self" }` | resolved (check not spiked) |
| P8 cancel final while the request runs | rule 12 (pending until the fiber exits); clean-up keyed by `attempt.idempotencyKey` with a server tombstone | resolved in part: the server half is a contract Flow can only state; spike P8 |
| P9 the Attempt relayed by hand | the call record; `resend(key)` | resolved: 0 `!` on Attempts in the rewrites |
| P10 event plumbing | derived events | resolved: 73 → 18 internal events |
| P11 `NotSent` everywhere, untestable | rule 8; producible | resolved, spike P11, P16 |
| P12 the visible retry recipe | CALL/WAIT, 2 states and about 6 lines; no `armOn` | resolved |
| P13 selects read the pre-turn snapshot | rule 10 | resolved, spike P16 |
| P14 schedule memory, `armOn` scope | rule 11 | resolved (spike P6 arms from the Busy turn's memory) |
| P15 no per-key time | keyed schedules; `now` in guards stays out (Machines O4: `check` must not depend on the clock) | resolved, not spiked |
| P16 no coalescing; dependent writes | `latest`; the dependent write from the create's success handler | resolved, spike P16 |
| P17 per-item results in a success value | one call per item, Effect `RequestResolver` in the adapter | resolved by design, not spiked |
| P18 polling as a transaction | read calls (3.12) | resolved, not spiked |
| P19 page-exit flush | **scoped out.** `pagehide` gives no time for an async turn and Persistence O6's acknowledgement. Server-side alternative: send at once with a server-side delay (`sendAt`) and undo as `DELETE` by the Attempt's key; autosave sends small debounced writes so nothing waits for exit | scoped out |
| P20 Stories cannot assert truth | fixture truth read by a checkpoint (3.15); every ending producible | resolved in the spike; Story API spelling open (8) |
| P21 cached failure on a re-send | rule 7 | resolved, spike P6 |
| P22 contradictions | `Flow.uncertain` removed; cancel-before-invocation is `NotSent`, declared against Operations O3/O7; `Timeout` removed from OP | resolved |
| P23 no `Effect.retry`; scalar keys | 3.1 shows both; the record makes the key's shape matter | resolved |

## 9. Alternatives considered

Each was tested against a failure sequence from the builds.

- **Keep `outcomes`/`abandoned`, chosen at settlement** (CP). Sign-in: `[StopWaiting, CodeWrong]` queued; `CodeWrong`
  was mapped as in-state and arrives in ENTERING: the strike is lost (spike P1, old). Rejected.
- **Keep both tables, chosen at admission** (correctness C1's direction). It fixes P1, but checkout's `abandoned`
  mapped only `success`, so an unknown after Leave is dropped (P7), and 3 of 5 builds copied `outcomes` into
  `abandoned` with drifting handlers (m1: 12 duplicated lines). One event with two handler locations gives the same
  answer with one table. Rejected.
- **Endings as inline transitions under the call.** Rejected by the owner; not revisited.
- **Author-named events with a defaulted mapping** (event = tag). Still a parallel declaration of every payload:
  `Busy: { retryAfterMs: Schema.optional(Schema.Number) }` repeats the error. When the author adds `region` to
  `Busy`, the event schema does not get it and the mapper drops it silently. Rejected for R37.
- **Nested handler keys** (`on: { pay: { success, Busy } }`). It groups by call, but it nests under the call name and
  collides with v4's rule that fragment events are not handled in a host's `on`. Flat dotted names chosen.
- **Failure stays definite per write; give the author `mayHaveApplied` only.** Checkout: the builder classified 429
  lock as `Busy`; after an unknown send the give-up says "not charged" and Pay charges again (spike P2, old). The safe
  default must be Flow's. Rejected.
- **Flow treats 409/429 "in progress" as unknown.** Flow would read statuses. Rejected.
- **A declined start answers `NotSent`** (correctness C5, workarounds W2). M1: Save enters SAVING, then `NotSent`
  must bring it back; `check(Save)` says Allowed for a save that will not happen, so the button lies; every start site
  needs the handler. The implicit guard is visible to `check()` and needs nothing (spike P5). Rejected.
- **`retry()` with no argument, "the last unsettled Attempt"** (complexity C2). Adopted as `resend(key)`; the key is
  needed for keyed calls, and Flow's record makes the Attempt implicit.
- **Keep the call pending until "the server finished" after a cancel** (lifecycle 3). No browser API reports it (2).
  Rejected; the clean-up is keyed by the Attempt instead.
- **Transitive late turns** (v4 rule 6). Booking: `PaidAfterLeaving` starts the refund; `Refunded` must leave
  REFUNDING and may not. Rejected (spike P4).
- **The Attempt id as the wire key for every send** (R2 read literally). Step-up: 403 cached under K; the re-send gets
  the cached 403 until the budget runs out (spike P6, old). **A fresh key on every send**: a re-send after an unknown
  charges twice. Rule 7 is the only key that is safe in both.
- **`now` in guards for lockouts.** `check(snapshot, event)` would depend on the clock, and a view would need to pass
  it. Keyed schedules keep `check` pure. Rejected.
- **Polling as a transaction** (jobs G1). Each GET mints an Attempt and has an `unknown` channel a read cannot have.
  Rejected for read calls.
- **Per-item results in the success value** (jobs P1). Per-item unknowns get no cache rule. Rejected for one call
  per item.
- **Requiring a late handler for every failure too.** One `{ target: "self" }` per failure tag per late-capable call,
  for endings that by definition changed nothing on the server. Considered; rule 8 requires only `success` and
  `unknown` (open 1).

## 10. Open questions

1. **Late failures.** Rule 8 lets a late failure go unhandled (dropped with evidence). Sign-in's late `WrongCode`
   shows a failure can matter; `flow check` cannot know. Should every late ending need a handler?
2. **`StillUnknown` has no author override.** A server that dedups by key and answers a re-send with the original
   decline is definite for the write, but rule 6 reports `StillUnknown { failure: CardDeclined }` and the machine must
   read the intent to conclude. Is an override needed (and how, without configuration on errors)?
3. **The machine signature.** The spike found that `machine(def, (h) => body)` loses TypeScript's excess-property check
   on handler keys. Change v4's signature (the spike's `machine<Ev>()(def).define(body)`), or rely on `flow check`?
4. **Wire-key format** (`${id}~n`): servers with key length or alphabet limits; whether the commit should receive the
   history and build its own key instead.
5. **Record retention** for keyed calls with unbounded keys (a list of thousands of rows): evict settled records, or
   require a `max` like `.each`?
6. **Persisted endings.** A persisted actor's saved ending needs the transaction's success Schema (`result`), as
   persisted resources do (Operations O1).
7. **Keyed schedules:** re-arm when a present key's computed deadline changes, or only on appearance (as proposed)?
8. **The Story API** for reading fixture truth at a checkpoint; and a `.settle()` command.
9. **`writes` and `optimistic`** on a call (Operations O3/O5) are not redesigned here: on the call declaration, so
   every send of it applies them?
10. **Randomness** for jitter in backoff (Machines O3 mentions seeded test randomness but no source in a turn).
