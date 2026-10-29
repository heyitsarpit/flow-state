# Proposal: server calls inside the machine, revised (calls-next)

Status: proposal, not accepted. It revises [in-machine-calls-proposal.md](../in-machine-calls-proposal.md) ("the
calls proposal", CP) and keeps its syntax: a commit value with `outcomes` mappings onto author-declared events. It
replaces CP's rules where five builds and four reviews found them wrong or silent, drops `abandoned`, and makes the
commit value the handle for re-sending, cancelling and reading the call. It keeps
[outcome-proposal.md](../outcome-proposal.md) ("OP") with four flagged amendments (section 6.4). It answers P1–P23 and
R1–R38 of [SYNTHESIS.md](SYNTHESIS.md). The data and type flow and ten failure sequences (seven run old and new) are
checked by the spike in [spike/](spike/) (`tsc -p .`, `bun stories.ts`; output in section 7.1). Five built cases are
rewritten in [rewrites/](rewrites/). Both predate the last decisions in sections 3–4 (`pay.pending` and
`pay.retryCount`, declines as endings, `pay.idle`, the wire key) and are not re-ported; 7.1 and 7.2 say what differs. Open questions,
left out of scope here, are in section 10; settled decisions, with their reasons, are in section 11.

## 1. The problem

A machine starts a server write and must react to everything that happens to it. CP gave each commit an `outcomes`
and an `abandoned` mapping, `O.x.retry(attempt)`, `cancel`, `.pending` and schedules. Five builders wrote 21 cases
with it (about 5,800 lines in `build/`) and four reviewers found that:

- **it is wrong where money and security are** (P1–P5): the ending is routed when it settles, not when the machine
  handles it, so a queued `StopWaiting` loses a wrong-code strike; a failure on a re-send is "definite" although an
  earlier send may have charged, so the user pays twice; `.pending` goes false before the ending's turn, so a timeout
  says "not charged" for a charge that landed; a declined commit produces nothing, so a state waits forever; and v4's
  late-turn rule forbids the refund that `abandoned` exists to start;
- **it leaves the commonest steps unspecified** (P6, P8, P13, P14): which mapping a re-send uses, what `cancel` does
  when nothing runs or the ending is queued, which memory a select or a schedule reads;
- **it costs lines for the wrong reasons** (P9–P12): the Attempt is copied event → nullable memory → `!` (47 `!`),
  `abandoned` copies `outcomes` in 3 of 5 builds, `NotSent` is mapped 40 times for 6 `cancel`s, and a visible retry is
  about 25 lines.

The syntax stays CP's. What changes is where each fact is kept and when each decision is taken.

## 2. Where the data comes from

"Flow" means Flow's own runtime; nothing in Flow reads an HTTP status or an author error type.

| Value | Real source | How it reaches the machine |
| --- | --- | --- |
| Status, `Retry-After`, body | the browser's `Response` (`res.status`, `res.headers.get("retry-after")`, `res.json()`) | the adapter service decodes it into a typed result, or fails `NoResponse` when `fetch` rejects (`TypeError`) |
| The send's channel | the commit author's `Outcome.success / failure / unknown`, beside the status it reads (OP 3.1) | Flow's classifier reads the commit fiber's `Exit` and `Cause`, outside that fiber (OP 4.3) |
| The success value `A` | the commit's return | the `success:` mapper's `value`, typed `A` |
| A failure `X` | the author's error class, built from status and body (`Busy { retryAfterMs }`) | the `failure.<X._tag>:` mapper's `value`, typed `X` |
| An unknown reason | the author's `Outcome.unknown(u)`, or Flow's `Cancelled`, `Restored`, `Interrupted`, `Defect` | the `unknown:` mapper's `value`, typed `U \| Flow reasons \| StillUnknown<X>` |
| `StillUnknown { failure }` | Flow: this Attempt's send history (an earlier send ended unknown) | replaces a later definite failure (rule 6), so it reaches `unknown:` |
| `NotSent { why }` | Flow: the adapter was never called. `why` is `Cancelled`, `Restored`, `Superseded` (`latest`), `Rejected` (a busy `reject` lane) or `NothingToResend` (a retry with no current Attempt) | the `failure.NotSent:` mapper |
| The author's event and payload | the author's mapper: `E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs }))` | the event, declared in the definition, routed by rule 2 |
| Attempt `id`, `retryCount` | Flow mints the id, random, when a write starts, and counts each re-send of that write | the mapper's `attempt`; the count also as `pay.retryCount(g, key)` (rule 9) |
| The idempotency key on the wire | the commit author puts `attempt.id` wherever the API expects it (header or body) | the server; Flow sends nothing itself (rule 7) |
| `attempt.mayHaveApplied` | Flow: an earlier send of this Attempt ended unknown | the commit's context, to read a response with the write's history (R23) |
| `input` | the commit's select, over the turn's final memory and event (rule 10) | the mapper's `input` |
| `key` | the transaction's optional `key(input)` (Operations O1; omitted means one lane, `{}`) | the lane's key; `attempt.key` |
| `superseded` | Flow: a newer Attempt was started on the same key after this one | the mapper's `superseded` |
| `pending`, `retryCount` | Flow's lane for the transaction and key (rule 9) | `pay.pending(g, key)`, `pay.retryCount(g, key)` and the guard `pay.idle(key)` in guards, schedules and views |
| Cancel | the machine's `pay.cancel(key)` action | `Fiber.interrupt` on the commit → `Effect.tryPromise` aborts the `AbortSignal` it handed the adapter → the browser drops the request **only if the adapter passed it to `fetch`/XHR** |
| "the request reached the server", "the server finished after a cancel" | nothing: no browser API reports either | so a send interrupted after invocation is `unknown`, and clean-up is keyed by the Attempt (3.10) |
| Time | the Runtime Clock; `TestClock` in Stories | schedules (`now`, firing metadata, a keyed schedule's `key`) |
| Server truth in Stories | the fixture (a stateful fake server behind the service) | the Story reads the fixture; no outcome is injected (Testing O3) |

## 3. Public design

### 3.1 The commit: as in OP, plus one Attempt field

```ts
// checkout.operations.ts (outside the machine)
export const confirm = transaction({
  id: "Stripe.confirm",
  input: Schema.Struct({ intentId: Schema.String, paymentMethodId: Schema.String }),
  key: (i) => ({ intentId: i.intentId }),                       // a record (Operations O1); one lane per intent
  concurrency: "reject",
  commit: (input, { attempt }) => Effect.gen(function* () {
    const api = yield* StripeApi                                // production wraps fetch; Stories use a fixture
    const res = yield* api.confirm(input, { idempotencyKey: attempt.id }).pipe(          // the author puts Flow's id on the wire (rule 7)
      Effect.retry({ while: (e) => e._tag === "NoResponse", times: 1 }),                     // invisible: inside one send
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

### 3.2 The commit value: `outcomes` onto author events

```ts
// checkout.definition.ts
internalEvents: {
  Intent: { status: IntentStatus, chargeId: Schema.optional(Schema.String) },   // the payment intent; 3.4 reads `status`
  Declined: { code: Schema.String },
  Busy: { retryAfterMs: Schema.optional(Schema.Number) },   // ← CHANGED: no `attempt` field; Flow keeps the Attempt
  TryLater: {},
  Unsure: Flow.uncertain({}),                               // the only kind of event `unknown:` may target
  RetryNow: {}, CheckTick: {}, TookTooLong: {},
},

// checkout.machine.ts
const pay = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: memory.paymentMethodId }), {   // memory only: Pay and RetryNow both start it
  outcomes: {
    success: E.Intent.from((v) => ({ status: v.status, chargeId: v.chargeId })),   // the read in 3.12 maps to the same event
    failure: {                                                // exhaustive over the commit's failure tags
      CardDeclined: E.Declined.from((r) => ({ code: r.declineCode })),
      Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })),
      TooManyAttempts: E.TryLater, Rejected: E.TryLater,      // several endings may map to one event
      NotSent: E.TryLater,                                    // ← CHANGED: optional in the type; flow check requires it here because this machine cancels (rule 8)
    },
    unknown: E.Unsure,                                        // ← CHANGED: StillUnknown arrives here too (rule 6)
  },
})
```

- Mappers receive `(value, { input, attempt, superseded })` (**← CHANGED**: `superseded` is new).
- `failure` is exhaustive over the commit's tags: a missing tag, or one the commit cannot produce, is a type error.
  `NotSent` is optional in the type and required by `flow check` only where it can occur.
- `unknown:` may target only a `Flow.uncertain` event: a type error otherwise (spike check 6).
- There is no `abandoned` (**← removed**): the same mapped event serves the user who stayed and the one who left
  (3.4, rule 2).

### 3.3 The commit value is the handle

```ts
const key = ({ memory }) => ({ intentId: memory.intentId })   // the lane (Stripe.confirm is keyed by intent)

CARD:    { on: { Pay: { target: S.PAYING, guard: [pay.idle(key)], updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId, busyTries: 0 }), actions: [pay] } } },   // ← NEW: idle; a new Attempt
UNSURE:  { on: { CheckAgain: [{ target: S.PAYING, actions: [pay.retry(key)] }, { target: "self" }] } },   // ← CHANGED: the same Attempt, same outcomes
PAYING:  { on: { TookTooLong: { target: "self", actions: [pay.cancel(key)] } } },                  // ← CHANGED: on the commit value
```

**What `pay` is.** `O.x.commit(select, { outcomes })` returns an inert object, not a function. It holds the select
(how to build the input) and the `outcomes` (which events the endings become). Nothing runs when it is built or
listed; Flow runs it when a turn that lists it in `actions` commits (Machines O3). Its methods return more values of
the same kinds:

| Member | Kind | Meaning |
| --- | --- | --- |
| `pay` (in `actions`) | action | start a new write: run the select on the turn's memory and event, mint an Attempt, invoke the commit |
| `pay.retry(key?)` | action | send the lane's current Attempt again, with the same id, through the `outcomes` of the commit value that started it; owned by the transition that retries (rule 2) |
| `pay.cancel(key?)` | action | interrupt the lane's write (rule 12) |
| `pay.idle(key?)` | guard | `(g) => !pay.pending(g, key) \|\| deny("InFlight", { operation, key })`: the guard form of `pending`, with one standard code |
| `pay.pending(g \| s, key?)` | read | something on the lane is unfinished (rule 9) |
| `pay.retryCount(g \| s, key?)` | read | how many times the lane's current write has been sent again: 0 on its first send, and when there is none (rule 9) |

**Keys are optional.** The key is the transaction's key record. Actions and the guard (`retry`, `cancel`, `idle`) take
it as a selector over the turn, like `key` above; the reads take the key record itself (`pay.pending(g, key(g))`,
`like.pending(s, { id })`). A transaction without `key` has one lane per actor (Operations O1: omitted means `{}`), and
its members take no key: `pay.idle()`, `pay.retry()`, `pay.pending(g)`. A key is needed only when one actor runs
several independent lanes of one transaction (list rows, documents, challenges).

**Lanes belong to the transaction and key, not to `pay`.** Two commit values of the same transaction in one machine
share a lane: the same `pending`, the same current Attempt. That is deliberate: `reject` promises the server one write
in flight per key, and separate lanes per commit value would let `pay` and `payWithSaved` both charge one intent. The
lane remembers which commit value started its current Attempt, and `retry`, called on any commit value of the
transaction, sends it through that starter's `outcomes`. So two commit values of one transaction are safe:

```ts
const pay          = O.Payments.charge.commit(fromForm,  { outcomes: formOutcomes })
const payWithSaved = O.Payments.charge.commit(fromSaved, { outcomes: savedOutcomes })
// payWithSaved started the lane's write → pay.retry() re-sends it through savedOutcomes
```

**Refusing a second press is explicit.** Under `concurrency: "reject"`, a start on a busy lane refuses only the write:
the transition still runs, and the decline arrives as `NotSent { why: "Rejected" }` (rule 4). To refuse the whole
transition, and disable the button through `check()`, write `pay.idle(key)` in its guard. Other modes (`allow`,
`serialize`, `cancel`, `latest`) decide what many presses do (3.11).

**Starting is static.** A write starts only by listing a commit value in `actions` (Machines O1: actions are static).
A conditional start is written as alternatives:

```ts
Pay: [
  { guard: ({ memory }) => memory.useSaved || deny("NoSavedCard"), target: S.PAYING, actions: [payWithSaved] },
  { target: S.PAYING, actions: [pay] },
]
```

A commit value is a value, so it may sit in a shared transition object, in an action list beside other actions, in a
host's filling of a fragment callback, or behind a schedule's event; it cannot be started from a guard, mapper or
`updateMemory`. One write made of several requests that must succeed or fail together is composed inside the commit,
as Effect code calling services (one Attempt, one ending). Writes that depend on each other are separate commit values
chained through states.

**The select is typed where it is used.** The select runs with the memory and event of whichever transition lists
`pay`, so it is type-checked at each such transition (as v4 checks commits). A select that reads `event.paymentMethodId`
can be listed only on transitions whose event has that field; give each trigger its own commit value, or read memory
only. The select reads the memory this turn wrote (rule 10), so writing `etag` and sending it in one transition works.

### 3.4 Handling endings: current or late, same event

```ts
const paid = { target: S.DONE, guard: ({ event }) => event.status === "succeeded" || deny("NotSucceeded") }
return {
  on: {
    // Late (rule 2): PAYING was left before the ending's turn. The same event, routed from the root.
    Intent: [{ ...paid, guard: [S.LEFT, paid.guard] }, { target: "self" }],
    Unsure: { target: "self", actions: [read.fetch(key)] },     // never drop a charge that may have landed
    Declined: { target: "self" }, Busy: { target: "self" }, TryLater: { target: "self" },   // late failures: explicit ignores (rule 8)
  },
  states: {
    PAYING: {
      on: {   // current: the user is still in PAYING (or below it)
        Intent: [paid, toRead],
        Busy: [
          { target: S.WAITING, guard: ({ memory }) => memory.busyTries < 3 || deny("GaveUp"),   // a budget across new writes: memory
            updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? 1000 * 2 ** memory.busyTries }) },
          toCard("Stripe is busy. Try again shortly."),   // true: after an unknown send this arrives as Unsure (rule 6)
        ],
        Unsure: S.UNSURE,
      },
    },
  },
}
```

At admission Flow tests whether the call's owner is alive. If so the mapped event routes from the active leaf; if not,
the same event routes from the nearest surviving ancestor of the owner. A handler on the owner state is the "still
waiting" reaction; a handler on an ancestor is the "after leaving" one. A save that belongs to the app (M1) is
started with `target: "self"` and handled once at the root (`rewrites/m1.save.ts`).

### 3.5 Reading a call: `pending` and `retryCount`

```ts
guard: (g) => pay.retryCount(g, key(g)) < MAX_CHECKS || deny("ChecksLeft")      // ← NEW: a budget for re-sending one write
useView(actor, (s) => save.pending(s, { docId }))                                // "Saving…" and the leave warning
```

The machine reads two things from a lane, and nothing else: whether it is busy, and how many times its current write
has been sent again. Both are typed from the transaction's key. Everything else has a better home:

- **The write itself** (`attempt`: id, input, `retryCount`) reaches the machine only through the mapper,
  `(value, { input, attempt, superseded })`, for the rare case that needs it (a clean-up keyed by the write, 3.10).
- **The last ending** is handled by its own event, whose handler writes memory when the view needs to remember it:

```ts
LikeUnsure: { target: "self", updateMemory: ({ memory, event }) => ({ unsure: { ...memory.unsure, [event.id]: true } }) }   // a row shown as uncertain
```

### 3.6 A visible retry: the CALL/WAIT split

```ts
PAYING:  { on: { Busy: [{ target: S.WAITING, guard: underBudget, updateMemory: countAndDelay }, toCard("busy")] } },
WAITING: {
  schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },   // committed memory (rule 11)
  on: { RetryNow: { target: S.PAYING, guard: [pay.idle(key)], actions: [pay] } },   // Busy is definite: a new write, a new id (rule 7)
},
```

Entry arms the wait and leaving cancels it, so leaving stops the retry, and no `armOn` arms on the give-up branch. The
view shows "retrying 2 of 3" from `memory.busyTries`. Trying again after a definite failure is a new write (`pay`):
nothing happened, so there is nothing to dedup, and a new id means a server that stores failures under a key cannot
replay `Busy` (rule 7). Its budget is therefore memory, counted across writes. Re-sending after an **unknown** is the
other case: the same write (`pay.retry`), so the server dedups, and `pay.retryCount` is its budget (3.8).

### 3.7 Waiting

| Need | Form | Spike |
| --- | --- | --- |
| "Still working" after a delay | a schedule on the owner state that sets memory | — |
| Stop waiting, keep listening (soft) | a schedule whose handler leaves the owner state; the real ending is then late (rule 2) | P1 |
| Abort a hung request (hard) | a schedule whose handler runs `pay.cancel(key)`; the ending is `unknown(Cancelled)`, or the real one if it already settled (rule 12) | P3, P3b |
| A transport deadline the UI never sees | inside the commit: `Effect.timeoutOrElse({ duration, orElse: () => Outcome.unknown(new NoResponse()) })` | — |
| A deadline racing a write (seat hold) | a schedule on the enclosing state; `pay.pending(g, key)` stays true until the ending's turn | — |

### 3.8 Reconciling an unknown

```ts
UNSURE: {
  schedules: { check: { schedule: "3 seconds", send: E.CheckTick } },
  on: {
    CheckTick: [
      { target: S.PAYING, guard: (g) => pay.retryCount(g, key(g)) < 5 || deny("ChecksLeft"), actions: [pay.retry(key)] },   // never a new Attempt
      { target: S.STUCK },                                    // still unknown after 5 re-sends: tell the user, never "not charged"
    ],
  },
},
```

Re-sending is safe when the server dedups by key; otherwise reconcile with a read (3.12). Once a send has ended
unknown, a later definite failure of the same Attempt reaches `unknown:` with reason
`{ _tag: "StillUnknown", failure }` (rule 6), so a give-up branch can never say "not charged" after a send that may
have charged (spike P2).

### 3.9 Leaving, and compensation

```ts
// booking: the user left mid-charge; the charge lands. LEFT owns no call, so the late handler may move it.
on: {
  Paid: [{ target: S.REFUNDING, guard: [S.LEFT], updateMemory: ({ event }) => ({ paymentId: event.paymentId }), actions: [refund] }, { target: "self" }],
  ChargeUnsure: [{ target: S.SETTLING, guard: [S.LEFT], actions: [charge.retry(chargeKey)] }, { target: "self" }],
},
REFUNDING: { on: { Refunded: S.REFUNDED, … } },   // REFUNDING owns the refund: its endings are current and may move
```

Lateness is not transitive: a call started by a late turn is an ordinary call with its own owner (rule 3), so the
chain can finish (spike P4). The refund's select reads the `paymentId` the same turn wrote (rule 10), so one commit
value serves both starting points and `refund.retry(key)` always finds its record.

### 3.10 Cancel, then clean up

```ts
const put = O.Uploads.upload.commit(({ memory }) => ({ ref: memory.ref }), {
  outcomes: {
    success: E.Uploaded,
    failure: { NotSent: E.UploadNotSent },                               // never left the device: nothing to clean
    unknown: E.UploadUnsure.from((_r, { input, attempt }) => ({ ref: input.ref, uploadKey: attempt.id })),
  },
})
const clean = O.Uploads.discard.commit(({ event }) => ({ ref: event.ref, uploadKey: event.uploadKey }), { outcomes: { … } })
UPLOADING: { on: { Cancel: { target: "self", actions: [put.cancel(key)] }, UploadNotSent: S.CANCELLED, UploadUnsure: { target: S.CLEANING, actions: [clean] } } },
```

The client cannot stop a body already sent, and no browser API says when the server is done with it. So the clean-up
names the write by its key and the server applies it whenever the upload arrives (a tombstone). Flow's part: the key
reaches the clean-up typed, and the call stays pending until the commit's fiber has exited, so a retry cannot run
beside it on the client (rule 12). Spike P8 runs both clean-ups against the same late upload.

### 3.11 Concurrency

| Mode | Meaning (per actor, descriptor and key, Operations O3) |
| --- | --- |
| `reject` | **← CHANGED** a start on a pending key refuses only the write: it ends `NotSent { why: "Rejected" }` and the transition still runs. `pay.idle(key)` refuses the transition too (rule 4) |
| `latest` | **← NEW** one send in flight, at most one waiting; a newer start replaces the waiting one, which ends `NotSent { why: "Superseded" }`; the waiting one goes when the in-flight one settles; every mapper receives `superseded` |
| `cancel`, `allow`, `serialize` | unchanged; a cancelled or replaced queued start ends `NotSent` |

```ts
// B1 likes: rapid toggles; the select reads the memory this turn flipped (rule 10). No hand-written coalescing.
const like = O.Issues.setLike.commit(({ memory, event }) => ({ id: event.id, liked: desired(memory, event.id) }), {
  outcomes: {
    success: E.LikeSynced.from((v, { input }) => ({ id: input.id, liked: input.liked, count: v.count })),
    failure: { Refused: E.LikeRefused.from((_r, { input, superseded }) => ({ id: input.id, superseded })), NotSent: E.LikeSkipped },
    unknown: E.LikeUnsure.from((_r, { input, superseded }) => ({ id: input.id, superseded })),
  },
})
LikeRefused: [{ target: "self", guard: ({ event }) => event.superseded || deny("Latest") }, revertToConfirmed],   // never undo newer intent
```

### 3.12 Reads around writes

```ts
const read = O.Stripe.intent.lookup(key, { outcomes: { success: E.Intent.from(toDone), failure: E.ReadFailed } })   // a resource's call value
READING: { on: { PollTick: { target: "self", actions: [read.fetch(key)] }, Intent: […], ReadFailed: { target: "self" } } },
```

A resource's call value maps `success` and its failure tags, never `unknown` or `NotSent`, and has no Attempt and no
`retry`; `read.fetch(key)` has Operations O2's `refetch` semantics (joins a running request). Its endings are routed
like a write's (rule 2).

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
This replaces "one timer aimed at the earliest lock" (45 lines in the sign-in build) and the "first unsure row" tick.
Keyed schedules are a Machines feature, kept in this proposal and marked for review (D12).

### 3.14 Per-item results of a batch

Each item is its own commit (`allow`, keyed by item) with its own Attempt, classification and cache rule. The batching
happens below the commit, in the adapter, with Effect's `RequestResolver`: each commit calls
`Effect.request(Archive({ id, key }), resolver)`, and the resolver sends one HTTP request and completes each entry from
the per-item statuses. Not spiked.

### 3.15 Stories

```ts
const busyThenPaid = story.machine(Checkout, { id: "Checkout/busy-then-paid", fixtures: FakeStripe({ script: [{ status: 503, retryAfterMs: 2000 }] }) })
  .send(E.Pay()).advance("3 seconds").process()
  .checkpoint("paid", ({ truth }) => truth.FakeStripe.charges === 1)   // ← NEW: the fixture's truth, read, not commented
```

A fixture may expose its truth; a checkpoint reads it. Every ending can be produced through services: `unknown` by a
dropped response, `NotSent` by a cancel during the Attempt's storage acknowledgement or by `latest` (spike P11, P16).

## 4. Rules

1. **Endings map to events.** A commit value `O.x.commit(select, { outcomes })` maps each ending of its Attempts to one
   of the definition's events: `success:`, `failure:` (an exhaustive record over the commit's failure tags, plus an
   optional `NotSent`; or one event for an untagged failure type), and `unknown:`. A mapping value is an event
   (payload-free) or `E.X.from((value, { input, attempt, superseded }) => payload)`. Several endings may map to one
   event. `unknown:` may target only a `Flow.uncertain` event. A resource's call value maps `success:` and `failure:`
   only. An author error whose tag is one of Flow's reasons (`NotSent`, `Cancelled`, `Restored`, `Interrupted`,
   `Defect`, `StillUnknown`) is a type error.
2. **Owner, current, late, decided at admission.** A start or retry is owned by the activation of the state its
   transition names (`"self"`: the handler's own state). When the ending's turn is **admitted** (v4 2.5 step 1), Flow
   maps the ending through the commit value's `outcomes` and tests the owner against the pre-turn snapshot. If that
   activation is alive, the event is **current** and routes from the active leaf. Otherwise it is **late** and the
   same event routes from the nearest strict ancestor of the owner whose activation is the one alive when the call
   started (the root at worst). Nothing is decided at settlement.
3. **Late turns.** In a late event's turn, an alternative whose target would exit a state that owns another pending
   call, or an active subroutine, is denied (`LateMayNotLeave`); so a late handler ends in an alternative that does not
   move (`flow check`). A call started in a late turn is an ordinary call with its own owner: lateness is not
   transitive.
4. **Declines are endings; Flow adds no guard.** A decline refuses only the write, never the transition that asked for
   it: the transition's target, memory and other actions run as written. Under `concurrency: "reject"`, a start on a
   lane that is pending invokes nothing and ends `NotSent { why: "Rejected" }`. A retry on a lane that is pending also
   ends `NotSent { why: "Rejected" }`; a retry on a lane with no current Attempt ends
   `NotSent { why: "NothingToResend" }`. The ending is mapped through the commit value's `outcomes` and owned by the
   transition that asked (rule 2). To refuse the transition itself, the author writes `pay.idle(key)` in its guard, so
   `check()` and a view's button agree. `flow check` warns when a transition that changes state lists a `reject`
   commit value without its `idle` guard.
5. **Every start ends once.** Every start and every retry, invoked or declined, delivers exactly one ending.
6. **The Attempt's ending.** Each send is classified as in OP 4.3. The ending delivered is the Attempt's: success if
   this send succeeded; a definite failure only if no earlier send of the same Attempt ended unknown; otherwise
   `unknown` with reason `StillUnknown { failure }`.
7. **The key is the Attempt's id.** Flow mints `attempt.id`, random, when a write starts; every send of that write
   carries the same id. The commit author puts it on the wire where the API expects it; Flow sends nothing itself and
   derives no other key. Re-sending after an unknown is `pay.retry` (the same id, so the server dedups). After a
   definite failure nothing happened, so trying again is a new write (`pay`, a new id): a server that stores failures
   under a key cannot replay one. `pay.retry` after a definite failure stays allowed and sends the same id.
8. **Required handling** (`flow check`). Every current event that can occur is handled totally from every leaf under
   its owner (fall-through to ancestors included). `failure.NotSent` must be mapped only when it can occur: its
   concurrency is `reject`, `latest` or `serialize`, the machine cancels or retries that commit value, or the actor is
   persisted. **Every late event that can occur, from any channel, is handled** at a strict ancestor of the owner;
   `{ target: "self" }` is the explicit ignore. A missing late handler is a `flow check` error naming the event and
   the state whose leaving makes it late. Flow cannot know which late failures matter (sign-in's late `WrongCode` is a
   strike), so a person decides for each one.
9. **The lane: `pending` and `retryCount`.** Per actor, transaction and key (Operations O3), across every commit value of
   that transaction, Flow keeps a lane holding the current Attempt. The machine reads two things from it:
   `pay.pending(g | s, key)`, true from the starting turn until the ending's turn of every outstanding Attempt of the
   lane is admitted (a waiting `latest` start included); and `pay.retryCount(g | s, key)`, the number of times the
   current Attempt has been sent again, 0 on its first send and when there is none. `pay.idle(key)` is the guard form of `!pending` (rule 4). The
   current Attempt is replaced by a start, kept after a failure or unknown, and cleared after a success; it is not
   readable from guards or views, only through the mapper's `attempt`. A lane that settles with nothing pending and no
   current Attempt (after a success) is evicted; reading an evicted lane gives `pending` false and `retryCount` 0, the
   same as a fresh lane, so eviction cannot be observed. A lane holding a failed or unknown Attempt is kept, because
   `retry` needs it. The lane remembers which commit value started
   the current Attempt; `retry` on any commit value of the transaction uses that starter's `outcomes`. The ending's own turn sees the lane with that
   ending applied, so it may retry. Lanes persist with the actor; Persistence O6 acknowledges the Attempt before
   invocation.
10. **Selects read the turn's final memory.** A commit's input select and a retry's or cancel's key select read the
    memory with every patch of the turn applied, the event, and `now`. They are computed in step 5 (validation), so an
    invalid input rejects the turn.
    **Needs review (D12).** This rule changes every machine, not only calls. Today a turn already has several memory
    views (v4 2.5: guards and mappers read the pre-turn snapshot, `resetOn` and `input` the source-updated memory);
    rule 10 adds the final memory for selects and rule 11 the committed memory for schedules. The aim is one behaviour
    for every memory read in a turn; a review must check rules 10 and 11 against that aim before they are applied.
11. **Schedules.** A function schedule reads the committed memory of the arming turn. `armOn` counts an event accepted
    anywhere on the active path. A keyed schedule (`keys`) keeps one timer per key of the committed list: armed when
    the key first appears, cancelled when it leaves, firing once with `key` in its metadata.
    **Needs review (D12):** see rule 10.
12. **Cancel.** Before invocation: the ending is `NotSent { why: "Cancelled" }`. After invocation, before settlement:
    the commit's fiber is interrupted; the ending (`unknown`, `Cancelled`) is queued when the fiber has exited, and the
    lane stays pending until its turn. After settlement, or with nothing outstanding: no effect, with evidence. **A
    settled ending is never rewritten.**
13. **No Flow timeout and no Flow retry** (CP rule 7, kept). **Classification runs outside the fiber it interrupts**
    (CP rule 8, kept).

### 4.1 Turn-level timing

| Moment | What happens |
| --- | --- |
| The starting turn, steps 2–3 | the author's guards, including `pay.idle(key)` if written, decide whether the transition runs; Flow adds none (rule 4) |
| The starting turn, step 5 | input and key computed from the final memory (rule 10) |
| The starting turn, step 6, after publish | on a busy `reject` lane: no Attempt, and `NotSent { why: "Rejected" }` queued (rule 4). Otherwise: Attempt minted and made the lane's current one; `pending` true; owner recorded |
| Invocation | after the Persistence O6 acknowledgement; from here a cancel means `unknown` |
| Settlement | the send is classified (OP 4.3) and its ending queued in the FIFO mailbox; the lane is not touched; `pending` stays true; under `latest` the waiting start is invoked now |
| A cancel | rule 12 |
| The ending's admission (step 1) | rule 6 applied; the lane updated (`pending`, `retryCount`, the current Attempt); mapped through `outcomes`; owner tested (rule 2) |
| The event's turn, steps 2–6 | ordinary selection, rule 3 if late; the lane is already free, so a retry here is not `Rejected` |
| A timer of a dead activation | discarded at admission (Machines O5) |
| Restore | an invoked send ends `unknown` (`Restored`); an unacknowledged one `NotSent` (`Restored`); saved endings are delivered after readiness (Persistence O4) and routed by rule 2 then |

## 5. How it is implemented

The spike's `flow.ts` is the reference: the transaction, `Outcomes` and `Events` types, the commit value, the lane
(the spike still calls it the record and exposes `pay.at`; see 7.1) and a turn runtime. At settlement a watcher fiber pushes `{ record, outstanding, sendEnding }`; at admission
`admitEnding` applies rule 6, updates the record and maps the ending through the commit value's `outcomes`; routing
starts from the leaf or from the surviving ancestor (rule 2). `Flow.uncertain` is a type brand (`Uncertain<…>`) that
`unknown:` requires. `Legacy` flags switch each old behaviour back on, so every Story runs old and new on the same
machine and fixture. The machine API is a stand-in (states as dotted paths, no traits, no persistence).

## 6. Changes

Against [in-machine-calls-proposal.md](../in-machine-calls-proposal.md) (CP), whose syntax this keeps, and against
v4, OP and the plans.

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `pay.retry(key?)` | action on the commit value | send the lane's current Attempt again, with the same id, through its starter's `outcomes` |
| `pay.cancel(key?)` | action on the commit value | interrupt the lane's unsettled send (rule 12) |
| `pay.idle(key?)` | guard on the commit value | the guard form of `!pending`, with the standard code `InFlight` (rule 4) |
| `pay.pending(g \| s, key?)`, `pay.retryCount(g \| s, key?)` | reads on the commit value | is the lane busy; how many times its current write was sent again (rule 9) |
| `attempt.retryCount` | Attempt field | the same count, in the mapper and the commit |
| `superseded` | mapper context field | a newer Attempt was started on the key after this one |
| `attempt.mayHaveApplied` | Attempt field | an earlier send of this Attempt ended unknown (commit context) |
| `StillUnknown { failure }` | Flow unknown reason | a definite failure after an unknown send of the same Attempt (rule 6) |
| `concurrency: "latest"` | transaction option | coalescing: one in flight, one waiting, older waiting ends `NotSent` |
| `NotSent { why: "Rejected" \| "NothingToResend" }` | Flow failure reasons | a declined start or retry is an ending, not a denial (rule 4) |
| `LateMayNotLeave` | denial code | a late turn may not leave a state that owns another pending call (rule 3) |
| A `flow check` warning | tooling | a state-changing transition with a `reject` commit value and no `idle` guard (rule 4) |
| A resource call value: `O.x.lookup(select, { outcomes })`, `read.fetch(key)` | read action | a read whose endings are routed like a write's |
| `keys` | schedule option | one timer per key of a memory list |
| A checkpoint reading fixture truth | Testing | `.checkpoint(name, ({ truth }) => …)` |

### 6.2 Changed

| Changed | Before (CP unless named) | Now |
| --- | --- | --- |
| When the ending is routed | `outcomes` vs `abandoned` chosen at settlement (CP spike) | mapped and owner tested at admission (rule 2) |
| An ending after the state was left | `abandoned` mapping | the same `outcomes` event, routed from the nearest surviving ancestor |
| Re-send | `O.x.retry(attempt)` with no mapping (CP rule 3), or `retry(select, options)` (Operations O3) | `pay.retry(key)`: no Attempt argument, the starter's `outcomes`, owned by its transition; for an unknown. A definite failure is tried again as a new write (rule 7) |
| `cancel` | `O.x.cancel(select)`; before invocation silent (Operations O7) or `NotSent`, after "final" (CP rule 4) | `pay.cancel(key)`; rule 12 for all four cases |
| `.pending` | `O.x.pending(g, key)`; true "until the final ending or a cancel" (CP rule 6), false at settlement in the CP spike | `pay.pending(g, key)`; true until the ending's turn is admitted (rule 9) |
| `concurrency: "reject"` | "declines … without work or outcome" (Operations O3) | declines only the write, as the ending `NotSent { why: "Rejected" }`; the transition runs (rule 4) |
| Mapper context | `{ input, attempt }` | `{ input, attempt, superseded }` |
| Events carrying an Attempt | `Busy: { attempt: charge.Attempt, … }` (CP 3.2) | not needed: the lane holds the current Attempt; budgets read `pay.retryCount` or memory |
| `failure.NotSent` | required in every `failure` (CP rule 1) | optional in the type; required by `flow check` where it can occur (rule 8) |
| `failure` meaning | "it definitely did not happen" (OP 2) | for this send; the Attempt's ending is rule 6 (**OP amendment**) |
| Late failures | CP: `abandoned` optional per ending; this proposal's first revision: may go unhandled | every late event must be handled; `{ target: "self" }` is the explicit ignore (rule 8) |
| Late turns | transitive; last alternative of each must not move (v4 rule 6) | rule 3: not transitive; deny only exits of states owning another call |
| Commit selects | the pre-turn snapshot (Machines O3, v4 2.5) | the turn's final memory (rule 10) |
| Function schedules | memory unspecified (Machines O5) | committed memory; `armOn` on any accepted event on the active path (rule 11) |
| Read outcomes | unfenced events reaching "the actor's later state" (Operations O2, Machines O6) | routed by rule 2 |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| `abandoned` | CP 3.6, rule 5; v4 P10 | rule 2 routes the same event to a surviving ancestor; removes the copied tables (P7) |
| The exported `X.Attempt` Schema in author events and memory | CP rule 2 | Flow keeps the Attempt (P9); the Schema stays for persistence |
| `O.x.retry(attempt)` / `O.x.cancel(select)` / `O.x.pending(g, key)` on the descriptor | CP 3.3–3.7 | they live on the commit value, which knows its mapping |
| `Timeout` as a Flow reason | OP 3.2 | Flow has no timeout (CP, confirmed) |
| v4 rule 12's "outcome handlers outside the fenced state" | construction error | late events are handled outside the owner by definition |
| v4 rule 6's transitive late chain | v4 2.4 | rule 3 |
| A Flow-derived wire key (`attempt.idempotencyKey`, `${id}~n`) | this proposal's first revision | Flow would choose a protocol the server must understand. A new write after a definite failure gives a new id instead (rule 7) |
| Implicit guards from concurrency (the first revision's `InFlight` and `NothingToResend` denials) | this proposal's first revision | a network lane must not block a transition's other effects: under `reject`, typing during an autosave would have been refused. Declines are endings (rule 4); refusing the transition is the explicit `pay.idle(key)` |
| A readable call record (`pay.at`, `attempt`, `last`) | this proposal's first revision | the machine needs only `pending` and `retryCount`; the write reaches it through the mapper and the last ending through its own event (3.5) |

**Kept** from CP, v4, OP and the plans: `O.x.commit(select, { outcomes })` and its mapping syntax; exhaustive
`failure` by tag; `Flow.uncertain` as the marker on events `unknown:` may target (OP 3.3); OP's `Outcome` API, three
channels, classifier and cache table; the Attempt and its id minted by Flow; fixtures as services; schedules; cancel by
interruption; fencing by activation (now "owner").

### 6.4 Amendments to the outcome proposal (flagged)

1. Section 2, failure: "it definitely did not happen" becomes "this send definitely did not do it"; the Attempt's
   ending is rule 6, and `StillUnknown { failure }` joins the unknown reasons (fixes P2).
2. Section 3.2: drop `Timeout`; `NotSent` gains a `why`: `Cancelled`, `Restored`, `Superseded`, `Rejected` or
   `NothingToResend`.
3. Section 3.3: `failure.NotSent` is optional in the type (rule 8); mappers also receive `superseded`; `Flow.uncertain`
   kept.
4. Section 3.3, recovering from unknown: `pay.retry(key)`, not `O.x.retry(attempt)`; after a definite failure, a new
   write (rule 7).

### 6.5 Amendments by target document

Every change this proposal makes to another document, grouped by that document so each can be reviewed by its owner
(D14). The `.plan` files change only when this proposal is accepted.

| Target | Amendment | Where here |
| --- | --- | --- |
| **Operations O3** | `concurrency: "reject"` declines only the write, ending `NotSent { why: "Rejected" }` | rule 4, 3.11 |
| Operations O3 | `concurrency: "latest"`, and `superseded` in the mapper context | 3.11 |
| Operations O3 | the commit value as the handle: `retry`, `cancel`, `idle`, `pending`, `retryCount`; `O.x.retry(attempt)` removed | 3.3, D4 |
| Operations O3 | lanes per actor, transaction and key: the starter is remembered, settled lanes are evicted | rule 9, D9, D11 |
| Operations O3 | `attempt.id` is the key on the wire, random per write; a definite failure is tried again as a new write; `attempt.retryCount` and `attempt.mayHaveApplied` | rule 7, 3.1, D8 |
| Operations O3 | every start and retry, invoked or declined, ends once | rule 5 |
| **Operations O7** | cancel defined before invocation, while running, after settlement and with nothing outstanding | rule 12 |
| **Operations O2** | reads as call values (`O.x.lookup(select, { outcomes })`, `read.fetch(key)`), routed like writes | 3.12 |
| **Machines O3, v4 2.5** | selects read the turn's final memory (**needs review**) | rule 10, D12 |
| **Machines O5** | schedules read committed memory; `armOn` anywhere on the active path; keyed schedules (**needs review**) | rule 11, 3.13, D12 |
| **proposal-v4** | routing decided at admission, late endings from the nearest surviving ancestor; `abandoned` removed | rule 2, D2 |
| proposal-v4 | late turns are not transitive (`LateMayNotLeave`); rule 12's fence error removed | rule 3 |
| proposal-v4 | every late event must be handled | rule 8, D13 |
| proposal-v4 | P2, P3, P4, P10, P16, P17 and P20 replaced | 6.2, 6.3 |
| **outcome-proposal** | the four flagged amendments: `failure` describes one send and `StillUnknown`; `NotSent { why }`; `Timeout` dropped; the mapping section replaced | 6.4 |
| **Testing O2, O3** | Story checkpoints read fixture truth | 3.15 |
| **Persistence O4, O6** | lanes persist with the actor; restored endings are routed by rule 2 | rule 9, 4.1 |

## 7. Evidence

### 7.1 The spike

> **Older than sections 3–4.** The spike was written before three later decisions and has not been re-ported: it
> exposes the record as `pay.at(g)` (`{ pending, attempt, sends, last }`) instead of `pay.pending` and `pay.retryCount`;
> it derives the wire key `${id}~n` (P6/P21 shows `a1~1`, where rule 7 now starts a new write with a new id); it
> implements the implicit `reject` guard (its P5 Story shows `Denied ["InFlight"]`, where rule 4 now ends the
> write `NotSent { why: "Rejected" }` and refuses the transition only under `pay.idle`); and it has no `pay.idle`.
> Everything else it checks (routing at admission, rule 6, `.pending` timing, retry through the commit value's
> `outcomes`, cancel, `latest`, the type checks) is unchanged by those decisions.

[spike/](spike/) runs on Effect 4.0.5: `tsc -p .` then `bun stories.ts`, from `spike/`. `machines.ts` uses the syntax
above: commit values with `outcomes` onto author events, `Uncertain<…>` for `Flow.uncertain`, `pay.retry()`,
`pay.cancel()`, `pay.at(g)`, `pay.pending(g)`; no `!`, cast or Attempt in an event or memory.

`types.ts` holds 15 `@ts-expect-error` checks, each confirmed to fail for its stated reason:

1. the success value is typed (`v.amount` does not exist);
2. the error class is typed (`Busy` has no `code`);
3. `StillUnknown` carries a failure, never an unknown reason;
4. a mapping missing a failure tag is an error (a mapping without `NotSent` is not: a positive check);
5. a failure tag the commit cannot produce is an error;
6. `unknown:` targeting an event not marked `Flow.uncertain` is an error;
7. a payload event used bare (without `.from`) is an error;
8. a mapper must return the event's payload;
9. the select must return the transaction's input type;
10. the keyed record needs the transaction's key shape;
11. `pay.at(g).attempt` may be undefined;
12. a handler for an event that does not exist is an error;
13. a keyed `retry()` without a key is an error;
14. a commit whose select reads an event field cannot be listed in another event's handler;
15. an author error using a reserved tag is an error.

The trace prints each mapped event as `Event<ending>(attempt#sends)`. Each Story asserts server truth.

Spike notes: where a select reads its event (upload clean-up, likes, refund), the spike names that event as a type
argument (`commit<UploadUnsure>`), because v4 checks a commit at each transition that lists it and the spike has no
such check. And v4's `machine(def, (h) => body)` callback is context-sensitive, so TypeScript drops its
excess-property check on handler keys; the spike uses `machine<Ev>()(def).define(body)` (open 8).

```
tsc: 0 errors (15 @ts-expect-error checks hold)

P1 mailbox race: NEW (routed when the turn is admitted)
   t=    0 Submit TWO_FACTOR.ENTERING → TWO_FACTOR.VERIFYING
   t=15020 StopWaiting TWO_FACTOR.VERIFYING → TWO_FACTOR.ENTERING
   t=15020 CodeWrong<WrongCode>(a1#1) [late] TWO_FACTOR.ENTERING
   PASS the late WrongCode strikes its own challenge at the root

P1 mailbox race: OLD (outcomes/abandoned chosen at settlement)
   t=    0 Submit TWO_FACTOR.ENTERING → TWO_FACTOR.VERIFYING
   t=15020 StopWaiting TWO_FACTOR.VERIFYING → TWO_FACTOR.ENTERING
   t=15020 CodeWrong<WrongCode>(a1#1) Unhandled: LOST
   PASS old rule: the strike is lost (reproduces correctness C1)

P2 unknown then failure: NEW (the Attempt's ending: failure after unknown stays unknown)
   t=    0 Pay CARD → PAYING
   t= 1000 Unsure<unknown:NoResponse>(a1#1) PAYING → UNSURE
   t= 2500 CheckTick UNSURE → PAYING
   t= 2700 Unsure<unknown:StillUnknown>(a1#2) PAYING → UNSURE
   t= 3000 TookTooLong discarded (its state was left)
   t= 4200 CheckTick UNSURE → PAYING
   t= 4400 Unsure<unknown:StillUnknown>(a1#3) PAYING → UNSURE
   t= 5500 TookTooLong discarded (its state was left)
   t= 5900 CheckTick UNSURE → PAYING
   t= 6100 Unsure<unknown:StillUnknown>(a1#4) PAYING → UNSURE
   t= 7200 TookTooLong discarded (its state was left)
   t= 7600 CheckTick UNSURE → PAYING
   t= 7800 Unsure<unknown:StillUnknown>(a1#5) PAYING → UNSURE
   t= 8900 TookTooLong discarded (its state was left)
   t= 9300 CheckTick UNSURE → PAYING
   t= 9500 Unsure<unknown:StillUnknown>(a1#6) PAYING → UNSURE
   t=10600 TookTooLong discarded (its state was left)
   t=11000 CheckTick UNSURE → PAYING
   t=11200 Paid<success>(a1#7) PAYING → DONE
   t=12300 TookTooLong discarded (its state was left)
   t=14000 TookTooLong discarded (its state was left)
   server truth: charges=1 keys=["a1","a1","a1","a1","a1","a1","a1"]
   PASS charged once; the machine never said 'not charged'

P2 unknown then failure: OLD (a failure on a re-send is definite)
   t=    0 Pay CARD → PAYING
   t= 1000 Unsure<unknown:NoResponse>(a1#1) PAYING → UNSURE
   t= 2500 CheckTick UNSURE → PAYING
   t= 2700 Busy<Busy>(a1#2) PAYING → WAITING
   t= 3000 TookTooLong discarded (its state was left)
   t= 3200 RetryNow WAITING → PAYING
   t= 3400 Busy<Busy>(a1#3) PAYING → WAITING
   t= 3900 RetryNow WAITING → PAYING
   t= 4100 Busy<Busy>(a1#4) PAYING → CARD
            user reads "The bank is busy. You were not charged." and presses Pay again
   t= 4500 Pay CARD → PAYING
   t= 5500 TookTooLong discarded (its state was left)
   t= 6200 TookTooLong discarded (its state was left)
   t= 6900 TookTooLong discarded (its state was left)
   t= 7500 TookTooLong PAYING
   t= 7510 Unsure<unknown:Cancelled>(a2#1) PAYING → UNSURE
   t= 9010 CheckTick UNSURE → PAYING
   t= 9210 Busy<Busy>(a2#2) PAYING → WAITING
   t= 9710 RetryNow WAITING → PAYING
   t= 9910 Busy<Busy>(a2#3) PAYING → WAITING
   t=10410 RetryNow WAITING → PAYING
   t=10610 Busy<Busy>(a2#4) PAYING → CARD
   t=12010 TookTooLong discarded (its state was left)
   t=12710 TookTooLong discarded (its state was left)
   t=13410 TookTooLong discarded (its state was left)
   server truth: charges=2 keys=["a1","a1","a1","a1","a2","a2","a2","a2"]
   PASS old rule: the card is charged twice (reproduces correctness C3)

P3 timeout racing the ending: NEW (.pending until the ending's turn; cancel never rewrites a settled ending)
   t=    0 Pay CARD → PAYING
   t= 3020 TookTooLong PAYING
   t= 3020   Payments.charge cancel: nothing unsettled (no-op, evidence)
   t= 3020 Paid<success>(a1#1) PAYING → DONE
   server truth: charges=1; screen: DONE ""
   PASS the real ending wins: DONE, charged once

P3 timeout racing the ending: OLD (.pending false at settlement)
   t=    0 Pay CARD → PAYING
   t= 3020 TookTooLong PAYING → CARD
   t= 3020 Paid<success>(a1#1) [late] CARD
   server truth: charges=1; screen: CARD "That took too long. You were not charged."
   PASS old rule: 'You were not charged' shown, but the card was charged

P3b timeout before the ending: cancel → unknown(Cancelled) → same Attempt again
   t=    0 Pay CARD → PAYING
   t= 3000 TookTooLong PAYING
   t= 3010 Unsure<unknown:Cancelled>(a1#1) PAYING → UNSURE
   t= 4510 CheckTick UNSURE → PAYING
   t= 4710 Unsure<unknown:StillUnknown>(a1#2) PAYING → UNSURE
   t= 6210 CheckTick UNSURE → PAYING
   t= 6410 Paid<success>(a1#3) PAYING → DONE
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
   t= 1000 Saved<success>(a1#1) [late] DOC.EDITING
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
   t=  200   Docs.save start declined silently (legacy)
   t= 1000 Saved<success>(a1#1) [late] DOC.SAVING
   server truth: puts=1; final state DOC.SAVING
   PASS old rule: SAVING waits forever (reproduces correctness C5)

P6 retry mapping: NEW (pay.retry(): same Attempt, same outcomes, fresh wire key after a definite failure)
   t=    0 Pay CARD → PAYING
   t=  200 Busy<Busy>(a1#1) PAYING → WAITING
   t= 2200 RetryNow WAITING → PAYING
   t= 2700 Paid<success>(a1#2) PAYING → DONE
   t= 3000 TookTooLong discarded (its state was left)
   t= 5200 TookTooLong discarded (its state was left)
   server truth: charges=1 keys=["a1","a1~1"]
   PASS Busy(a1#1) → WAITING 2 s (from Retry-After) → retry → Paid(a1#2), mapped by the same outcomes

P6 retry mapping: OLD wire key (the Attempt id again: the server replays its cached 503)
   t=    0 Pay CARD → PAYING
   t=  200 Busy<Busy>(a1#1) PAYING → WAITING
   t= 2200 RetryNow WAITING → PAYING
   t= 2400 Busy<Busy>(a1#2) PAYING → WAITING
   t= 3000 TookTooLong discarded (its state was left)
   t= 4400 RetryNow WAITING → PAYING
   t= 4600 Busy<Busy>(a1#3) PAYING → WAITING
   t= 5200 TookTooLong discarded (its state was left)
   t= 6600 RetryNow WAITING → PAYING
   t= 6800 Busy<Busy>(a1#4) PAYING → CARD
   t= 7400 TookTooLong discarded (its state was left)
   t= 9600 TookTooLong discarded (its state was left)
   server truth: charges=0 keys=["a1","a1","a1","a1"]
   PASS old key: the cached failure comes back every time (reproduces correctness C12)

P8 cancel then clean-up: OLD (discard by ref: whatever is there now)
   t=    0 Pick IDLE → UPLOADING
   t=  500 Cancel UPLOADING
   t=  510 UploadUnsure<unknown:Cancelled>(a1#1) UPLOADING → CLEANING
   t=  610 Discarded<success>(a2#1) CLEANING → CANCELLED
   server truth: files=1 refused=0; final state CANCELLED
   PASS old clean-up: the file lands after the discard (reproduces correctness C8)

P8 cancel then clean-up: NEW (discard by the Attempt's key; the server refuses a later arrival)
   t=    0 Pick IDLE → UPLOADING
   t=  500 Cancel UPLOADING
   t=  510 UploadUnsure<unknown:Cancelled>(a1#1) UPLOADING → CLEANING
   t=  610 Discarded<success>(a2#1) CLEANING → CANCELLED
   server truth: files=0 refused=1; final state CANCELLED
   PASS no orphan: the upload that lands at 2 s is refused

P16 latest coalescing: Toggle at 0, 50, 100 ms; each request takes 300 ms
   t=    0 Toggle READY
   t=   50 Toggle READY
   t=  100 Toggle READY
   t=  100 LikeSkipped<NotSent>(a2#1,superseded) READY
   t=  300 LikeSynced<success>(a1#1,superseded) READY
   t=  600 LikeSynced<success>(a3#1) READY
   server truth: requests=["a1:true","a3:true"] liked=true
   PASS two requests; the server ends at the last click

P4 compensation chain: leave mid-charge, the charge lands, refund, REFUNDED
   t=    0 Pay CARD → PAYING
   t=  300 Leave PAYING → LEFT
   t= 1000 Paid<success>(a1#1) [late] LEFT → REFUNDING
   t= 1300 Refunded<success>(a2#1) REFUNDING → REFUNDED
   server truth: charges=1 refunds=1
   PASS the refund started by a late turn finishes (v4 rule 6 forbade it)

P11 NotSent is producible: cancel while the Attempt's storage ack is pending (50 ms)
   t=    0 Pick IDLE → UPLOADING
   t=   20 Cancel UPLOADING
   t=   30 UploadNotSent<NotSent>(a1#1) UPLOADING → CANCELLED
   server truth: files=0; final state CANCELLED
   PASS NotSent → UploadNotSent: nothing left the device, no clean-up needed

all stories pass
```

Reading the traces: `t=15020` is the first turn after a held mailbox (the main thread was busy from 14.990 s); "discarded"
lines are timers of activations already left (Machines O5). In P3 the cancel finds the send settled and changes
nothing, so the real success is delivered. In P6 the second send uses `a1~1` because the first ended in a definite
failure, so the server's cached 503 cannot answer it.

Not spiked: `flow check` (rules 3 and 8), keyed schedules, read calls, `serialize`, persistence and restore, the
`RequestResolver` batch, `LateMayNotLeave` (implemented in the runtime, not exercised by a Story).

### 7.2 The rewrites

> **Older than sections 3–4,** like the spike, and not re-ported: they read `pay.at(…)` where the design now has
> `pay.pending` and `pay.retryCount`, use `attempt.idempotencyKey` where rule 7 now uses `attempt.id`, and rely on the implicit `reject` guard where the design now needs an explicit
> `pay.idle(key)` on each transition that should be refused. Adding those guards adds about one line per such
> transition to the counts below.

[rewrites/](rewrites/) holds definition and machine for five cases, in the syntax of section 3. The operations files are
unchanged except the wire key (rule 7), `latest` on likes and key records in auth. Counts are definition + machine
without blank and comment lines; characters exclude whitespace and comments. "First draft" is this proposal's earlier
rewrite with derived events (no author events, no mappings), kept for comparison.

| Case | Lines: build → first draft → now | Characters: build → first draft → now | Internal events | `!` | INVENTED |
| --- | --- | --- | --- | --- | --- |
| payments `checkout` (E1–E3) | 246 → 136 → 163 | 7,727 → 5,286 → 5,859 | 20 → 6 → 17 | 2 → 0 → 0 | 1 → 0 → 0 |
| payments `booking` (F1) | 276 → 157 → 178 | 11,071 → 7,483 → 8,385 | 25 → 6 → 23 | 14 → 5 → 5 | 6 → 0 → 0 |
| auth `signin` | 206 → 121 → 132 | 6,163 → 5,351 → 5,581 | 10 → 3 → 9 | 0 → 0 → 0 | 3 → 1 → 1 |
| editing `list` (B1, B2) | 317 → 147 → 173 | 12,062 → 8,425 → 9,293 | 13 → 2 → 15 | 11 → 0 → 0 | 1 → 0 → 0 |
| lifecycle `m1.save` | 118 → 59 → 72 | 4,016 → 2,631 → 2,854 | 5 → 1 → 4 | 1 → 0 → 0 | 3 → 0 → 0 |
| **total** | **1,163 → 620 → 718** | **41,039 → 29,176 → 31,972** | **73 → 18 → 68** | **28 → 5 → 5** | **14 → 1 → 1** |

Against the builds, the revision is 38% shorter in lines and 22% in characters; against the first draft, the mappings
and event declarations add 98 lines (+16%) and 2,796 characters (+10%). The event count returns almost to the builds'
(68 against 73): the mapping syntax keeps one declared event per distinct ending. What is gone is the plumbing around
them: no `attempt` field in any event, no Attempt in memory, no `abandoned` table, `NotSent` only where it can occur,
no `!pending` guard, and handlers written once for current and late.

- The five `!` left in `booking` are on memory set on entry to HELD (`holdId`, `expiresAt`) or in the charge's
  success turn (`paymentId`): v4 has no state-scoped memory. None is on an Attempt.
- The one INVENTED is the builder's: `Flow.state` without traits (a v4 gap).
- Behaviour changes, all deliberate: `signin` keeps one timer per locked challenge (keyed schedule); `list` coalesces
  likes with `latest` and reconciles each unsure row on its own timer; `m1.save` drops its SAVING state ("saving" is
  `save.pending(s, key)`) and writes each handler once; the `booking` confirm and charge give-ups can no longer refund
  a real booking or say "not charged" after an unknown send.

## 8. Coverage

### 8.1 Requirements

| R | Met by | Shown |
| --- | --- | --- |
| R1 start from a user action, same-turn values | `pay` in `actions`; rule 10 | spike P16, `m1.save` |
| R2 stable identity, the idempotency key | `attempt.id`, random per write and the same for every send of it (rule 7); lanes persist (rule 9) | P6, P3b |
| R3 new write vs the same again | `pay` vs `pay.retry(key)`; a start replaces the lane's current Attempt, so a replaced write cannot be resent | checkout E3 |
| R4 independent writes per key | keyed transactions: one lane per key; `like.pending(s, { id })` | `list`, types 10 |
| R5 one per key, a defined decline | rule 4: a busy `reject` lane ends the write `NotSent { why: "Rejected" }`; `pay.idle(key)` refuses the transition when the author wants that | P5 (spike older: it shows the implicit denial) |
| R6 latest-wins coalescing | `latest`, `superseded` | P16 |
| R7 order per key, dependent creates | `serialize` (unchanged); the dependent write starts in the create's success handler with the server's id | `list` |
| R8 one ending reaches the machine | rules 1, 5, 8; a decline is a denial, not a write | P5, P11 |
| R9 typed, exhaustive, only possible endings | rule 1 (types: exhaustive tags, `NotSent` optional), rule 8 (`flow check`) | types 4, 5 |
| R10 an ending is about the write | rule 6 | P2 |
| R11 success that is not completion | guards on the mapped payload | `checkout` (`requires_action`) |
| R12 per-item batch results | one commit per item, batched in the adapter (3.14) | not spiked |
| R13 the ending reaches the activation current when handled | rule 2 | P1 |
| R14 "still working" | a schedule on the owner state | `checkout` |
| R15 soft stop waiting | leave the owner; the late event still counts | P1 |
| R16 hard abort | schedule + `pay.cancel` → `unknown(Cancelled)` | P3b |
| R17 a deadline races a write | rules 9, 12; FIFO mailbox | P3 |
| R18 time per key | keyed schedules (rule 11) | `signin`, `list`; not spiked |
| R19 server-dictated delays | the error's field → mapped payload → memory → schedule | P6 |
| R20 visible retry, budget, leave stops it, fresh budget | CALL/WAIT (3.6); after a definite failure a new write, budget in memory; after an unknown `pay.retry`, budget `pay.retryCount` (3.8) | P6; budget reset is a recipe |
| R21 invisible transport retries | `Effect.retry` inside one send (3.1) | — |
| R22 reconcile an unknown | `pay.retry(key)`, or a read call | P2, P3b |
| R23 interpret with history | `attempt.mayHaveApplied` | 3.1 |
| R24 same write after a sub-flow; a modified write is new | retry (fresh wire key after a definite failure); a new start | P6 |
| R25 leaving does not cancel; the ending updates elsewhere | rule 2; ancestor handlers | P5, `m1.save` |
| R26 compensation after leaving can finish | rule 3 | P4 |
| R27 a late result never takes the user out of live work | rule 3 (`LateMayNotLeave`) | implemented, not exercised |
| R28 cancel in every case; clean-up not racing | rule 12; clean-up keyed by the Attempt | P3, P8, P11 |
| R29 writes while the page closes | **scoped out** (P19) | — |
| R30 reload mid-write | lanes persist; `Restored` endings routed by rule 2 | not spiked |
| R31 poll a long job | a read call + a schedule | `checkout` READING |
| R32 truth on another channel | an ordinary event; the call's real ending arrives later and is handled late | recipe |
| R33 per-key reads for views and guards | `pay.pending`, `pay.retryCount`, `pay.idle` (rule 9); the last ending through its own event's handler | types 10, 11 |
| R34 Stories mock through services and produce every ending | fixtures; `NotSent` via cancel-before-ack and `latest`; truth asserted | all Stories |
| R35 statically analysable | commit values and their `outcomes`; owners from transitions; rules 3, 8 | not spiked |
| R36 errors carry information | no flags on errors; Flow reads no status | 3.1 |
| R37 typed end to end, inferred | mapper inputs from the commit's Effect; payload checked against the event | types 1–9 |
| R38 the same path with a fixture | the Stories | all Stories |

### 8.2 Problems

| P | Answer | Status |
| --- | --- | --- |
| P1 routed at settlement | rule 2: mapped and owner tested at admission | resolved, spike P1 |
| P2 failure on a re-send treated as definite | rule 6 (`StillUnknown`); OP amendment 1 | resolved, spike P2 |
| P3 `.pending` false early; cancel undefined | rules 9 and 12 | resolved, spike P3, P3b |
| P4 late rule forbids compensation | rule 3; v4 rule 12's fence error removed | resolved, spike P4 |
| P5 silent decline | rule 4: the decline is an ending, so no state waits forever | resolved; spike P5 shows the earlier implicit denial |
| P6 retry has no mapping | `pay.retry(key)` uses `pay`'s `outcomes`; owned by its transition | resolved, spike P6 |
| P7 unmapped late unknown dropped; copied tables | no `abandoned`: one mapping, two handler locations (rule 2); rule 8 makes late `success`/`unknown` handling a `flow check` error | resolved (check not spiked); open 2 |
| P8 cancel final while the request runs | rule 12 (pending until the fiber exits); clean-up keyed by `attempt.id` with a server tombstone | resolved in part: the server half is a contract Flow can only state; spike P8 |
| P9 the Attempt relayed by hand | the lane keeps the current Attempt; `pay.retry(key)`; budgets read `pay.retryCount` | resolved: no `!` on Attempts in the rewrites |
| P10 event plumbing | kept by the owner's choice of syntax; reduced: no `attempt` fields, no `abandoned` copies, `NotSent` only where it occurs, several endings to one event | reduced, not removed (7.2) |
| P11 `NotSent` everywhere, untestable | rule 8; producible | resolved, spike P11, P16 |
| P12 the visible retry recipe | CALL/WAIT, two states and about six lines; no `armOn` | resolved |
| P13 selects read the pre-turn snapshot | rule 10 | resolved, spike P16; open 4 |
| P14 schedule memory, `armOn` scope | rule 11 | resolved (spike P6 arms from the Busy turn's memory); open 4 |
| P15 no per-key time | keyed schedules; `now` in guards stays out (Machines O4: `check` must not depend on the clock) | resolved, not spiked; open 4 |
| P16 no coalescing; dependent writes | `latest`; the dependent write from the create's success handler | resolved, spike P16 |
| P17 per-item results in a success value | one commit per item, Effect `RequestResolver` in the adapter | resolved by design, not spiked |
| P18 polling as a transaction | resource call values (3.12) | resolved, not spiked |
| P19 page-exit flush | **scoped out.** `pagehide` gives no time for an async turn and Persistence O6's acknowledgement. Server-side alternative: send at once with a server-side delay (`sendAt`) and undo as `DELETE` by the Attempt's key; autosave sends small debounced writes so nothing waits for exit | scoped out |
| P20 Stories cannot assert truth | fixture truth read by a checkpoint (3.15); every ending producible | resolved in the spike; Story API spelling open (8) |
| P21 cached failure on a re-send | rule 7: after a definite failure, a new write with a new id | resolved; spike P6 shows the earlier derived key |
| P22 contradictions | `Flow.uncertain` kept and enforced on `unknown:` targets (types 6); cancel-before-invocation is `NotSent`, declared against Operations O3/O7; `Timeout` removed from OP | resolved |
| P23 no `Effect.retry`; scalar keys | 3.1 shows both; the lane reads take the key record, so its shape matters | resolved |

## 9. Alternatives considered

Each was tested against a failure sequence from the builds.

- **`outcomes`/`abandoned`, chosen at settlement** (CP). Sign-in: `[StopWaiting, CodeWrong]` queued; `CodeWrong` was
  mapped as in-state and arrives in ENTERING: the strike is lost (spike P1, old). Rejected.
- **Both tables, chosen at admission** (correctness C1's direction). It fixes P1, but checkout's `abandoned` mapped
  only `success`, so an unknown after Leave is dropped (P7), and 3 of 5 builds copied `outcomes` into `abandoned`
  with drifting handlers (m1: 12 duplicated lines). One mapping with two handler locations gives the same answer.
  Rejected.
- **Derived events instead of mappings** (`pay.success`, `pay.Busy`, no author events; the first draft of this
  proposal). Fewer lines and no parallel payload declaration, but the owner chose author-named events and mappings.
  Not taken.
- **Endings as inline transitions under the call.** Rejected by the owner; not revisited.
- **Failure stays definite per write; give the author `mayHaveApplied` only.** Checkout: the builder classified 429
  lock as `Busy`; after an unknown send the give-up says "not charged" and Pay charges again (spike P2, old). The safe
  default must be Flow's. Rejected.
- **Flow treats 409/429 "in progress" as unknown.** Flow would read statuses. Rejected.
- **An implicit guard from `reject`** (this proposal's first revision): a start on a busy lane denies the whole
  transition, `InFlight`, in turns and in `check()`. It denies more than the write: an autosave whose `Edit` both
  updates the text and starts a `reject` save would refuse the keystroke while a save is in flight, and a game action
  that also starts a write would refuse the movement. A lane must not block a transition's other effects, and a hidden
  guard breaks locality. Rejected for rule 4: the decline is an ending (`NotSent { why: "Rejected" }`), and refusing
  the transition is the explicit `pay.idle(key)`, so `check()` still disables the button where the author asks. The
  cost the first revision avoided (Save entering SAVING and coming back on `NotSent`) is what `idle` is for, and
  `flow check` warns when a state-changing transition has neither.
- **A readable record `{ pending, attempt, sends, last }`** (this proposal's first revision). The builds only ever read
  "is it busy" and "how many tries"; `attempt` and `last` duplicated the mapper and the ending's own handler. Replaced
  by `pay.pending` and `pay.retryCount` (3.5).
- **Retry on the descriptor with an Attempt argument** (CP 3.3, 3.7). Five builds wrote five spellings and two had no
  mapping at all (specification D-1). The commit value knows its mapping. Rejected.
- **Keep the call pending until "the server finished" after a cancel** (lifecycle 3). No browser API reports it
  (section 2). Rejected; the clean-up is keyed by the Attempt instead.
- **Transitive late turns** (v4 rule 6). Booking: the late `Paid` starts the refund; `Refunded` must leave REFUNDING
  and may not. Rejected (spike P4).
- **A Flow-derived wire key** (`${id}~n` after each definite failure; this proposal's first revision). It was safe in
  both failure sequences, but Flow would choose a key format the server must understand, and whether a server stores
  failures is a fact about that server. Rejected for rule 7.
- **A fresh random key on every send.** A re-send after an unknown would look like a new payment and charge twice.
  Rejected.
- **The Attempt id for every send, re-sending after a definite failure.** Step-up: a 403 stored under the key is
  replayed to every re-send (spike P6, old). Rule 7 keeps the id per write but tries a definite failure again as a new
  write, so nothing stored can be replayed.
- **A lane per commit value.** Two values of one transaction could each have a write in flight for the same key, so
  `pay` and `payWithSaved` could both charge one intent. Rejected; the lane remembers its starter instead (rule 9).
- **A `flow check` warning on two commit values of one transaction.** Unnecessary once `retry` uses the starter's
  `outcomes`. Rejected.
- **Other names for the count:** `sends` (the first revision), `attempts` (reads as "writes"; `attempt` is the write),
  `attemptCount` (the same ambiguity), `sendCount`, `tryCount` ("try" and "attempt" are synonyms). `retryCount` won:
  retry budgets are what it is for, and 0 on the first send reads naturally.
- **`now` in guards for lockouts.** `check(snapshot, event)` would depend on the clock. Keyed schedules keep `check`
  pure. Rejected.
- **Polling as a transaction** (jobs G1). Each GET mints an Attempt and has an `unknown` channel a read cannot have.
  Rejected for resource call values.
- **Per-item results in the success value** (jobs P1). Per-item unknowns get no cache rule. Rejected for one commit
  per item.

## 10. Open questions

Left for the owner and out of scope for this proposal; nothing here is decided. Settled answers move to section 11.

**The design**

1. **One behaviour for every memory read** (D12). A turn has several memory views: the pre-turn snapshot (guards,
   mappers), the source-updated memory (`resetOn`, `input`), the final memory (selects, rule 10) and the committed
   memory (schedules, rule 11). Can they converge on one rule, and which? A review must answer this before rules 10
   and 11 are applied.
**Scope: left out of this proposal**

2. **A send that must finish while the page closes** (undo send, P19): out of scope; the server-side alternative is
    a server delay (`sendAt`) with undo as a `DELETE` by the Attempt's id.
3. **Per-item batch results** (3.14): one write per item, batched below the commit with Effect's `RequestResolver`;
    not spiked.
4. **Writes that stream** (LLM generation, upload progress): deferred; to be designed from their browser sources.
5. **`writes` and `optimistic`** (Operations O3/O5): not redesigned here; options of the commit value, applied to
    every send of it?
6. **Persisted endings.** A persisted actor's saved ending needs the transaction's success Schema (`result`), as
    persisted resources do (Operations O1).
7. **Randomness** for jitter in backoff (Machines O3 mentions seeded test randomness but no source in a turn).

**Found here, belonging to v4**

8. **The machine signature.** `machine(def, (h) => body)` loses TypeScript's excess-property check on handler keys
    (found by the spike), so a handler for an event that does not exist is not a type error. Change v4's signature, or
    rely on `flow check`?

## 11. Decisions

Settled by the owner. Each records the choice, why it wins, what it commits the design to, and what was rejected.

- **D1 Endings map to author-declared events through `outcomes`.** `success:`, `failure:` (exhaustive by tag) and
  `unknown:` map onto events the definition declares, with mappers `(value, { input, attempt, superseded })`. Author
  names read as the domain (`Declined`, `Unsure`) and several endings may share one event. Consequence: one declared
  event and one mapping line per distinct ending. Rejected: derived events (`pay.Busy`), a `calls` definition
  category, and endings as inline transitions under the call.
- **D2 No `abandoned`.** An ending that arrives after its owner state was left routes the same mapped event from the
  nearest surviving ancestor (rule 2). One mapping serves the user who stayed and the one who left. Consequence: the
  "after leaving" reaction is a handler on an ancestor. Rejected: a second mapping table, which builds copied and let
  drift.
- **D3 `Flow.uncertain` is kept.** `unknown:` may target only an event marked `Flow.uncertain`, so the property sits
  on the event it describes. Rejected: dropping the marker.
- **D4 The commit value is the handle.** `O.x.commit(select, { outcomes })` returns an inert object: listed in
  `actions` it starts a write, and its members are `retry`, `cancel` (actions), `idle` (a guard) and `pending`,
  `retryCount` (reads). Starting is static: only from `actions`, conditional starts as alternatives. Consequence: a
  re-send can never miss its mapping. Rejected: `O.x.retry(attempt)` on the descriptor, which five builds spelled
  five ways.
- **D5 Declines are endings; refusing the transition is explicit.** Under `reject`, a busy lane refuses only the
  write and ends `NotSent { why: "Rejected" }`; the transition still runs. `pay.idle(key)` is the explicit guard, the
  guard form of `!pending` with the code `InFlight`. Concurrency is the transaction's required choice, so a button
  that should send every press uses `allow` or `serialize`. Consequence: a network lane never blocks a transition's
  other effects. Rejected: an implicit guard, which would refuse an autosave's keystroke while a save is in flight.
- **D6 The machine reads a lane through `pending` and `retryCount`.** `retryCount` is how many times the current
  write was sent again (0 on its first send). The write itself reaches the machine through the mapper, and the last
  ending through its own event's handler. Rejected: a readable record `{ pending, attempt, sends, last }`, and the
  names `sends`, `attempts`, `attemptCount`, `sendCount`, `tryCount`.
- **D7 Keys are optional.** A transaction without `key` has one lane per actor and its members take no key. Rejected:
  making keys mandatory.
- **D8 The idempotency key is `attempt.id`, and a definite failure is tried again as a new write.** Flow mints the id,
  random, per write; the commit author puts it on the wire. `pay.retry` re-sends the same write after an unknown so the
  server dedups; after a definite failure the machine starts a new write with a new id, so a server that stores
  failures cannot replay one. Consequence: a budget across definite failures lives in memory. Rejected:
  `attempt.idempotencyKey` derived by Flow (`${id}~n`), and a fresh key on every send (a re-send after an unknown
  would charge twice).
- **D9 Two commit values of one transaction share a lane, and the lane remembers its starter.** `retry` on any of
  them re-sends through the `outcomes` of the value that started the write. Consequence: `reject` still guarantees
  one write in flight per key. Rejected: a lane per commit value (two charges for one intent), and a `flow check`
  warning.
- **D10 `StillUnknown` has no author override.** A definite failure after an unknown send of the same write stays
  `unknown`; a server that replays its original decline is confirmed by a read. Rejected: an override, which would put
  configuration on the error.
- **D11 A settled lane is evicted.** A lane with nothing pending and no current Attempt (after a success) is removed;
  reading it gives `pending` false and `retryCount` 0, as a fresh lane does, so eviction cannot be observed. A lane
  holding a failed or unknown Attempt is kept, because `retry` needs it. Consequence: memory stays bounded for keyed
  transactions with unbounded keys, with no new option. Rejected: a required `max` like `.each` (one more setting, and
  a defined behaviour past it), and keeping every lane (unbounded).
- **D12 The machine-wide rules stay in this proposal, marked for review.** Rules 10 (selects read the turn's final
  memory) and 11 (schedules read committed memory; `armOn` anywhere on the active path) and keyed schedules (3.13)
  change every machine, not only calls. They are kept here so the calls design reads as one piece, and each is marked
  "needs review". The review's aim: every memory read in a turn behaves the same way, rather than the four views a turn
  has today (open question 1). Rejected: a separate Machines proposal now, before the review shows what the one
  behaviour should be.
- **D13 Every late event must be handled.** An ending that arrives after its owner state was left, from any channel,
  needs a handler at a strict ancestor of the owner; `{ target: "self" }` is the explicit ignore, and a missing one is a
  `flow check` error. Flow cannot tell which late failures matter: in sign-in, a late `WrongCode` is a strike, and
  dropping it would let a guesser submit, press Back and guess again without limit. Consequence: one line per late
  event the author chooses to ignore. Rejected: late failures optional and dropped with evidence (the brute-force hole
  is invisible), and requiring handlers only where the current handler writes memory (less predictable).
- **D14 Amendments to other documents stay in this proposal, grouped by target.** Section 6.5 lists every change to
  Operations, Machines, proposal-v4, the outcome proposal, Testing and Persistence, with where it is defined here, so
  each owner reviews their part and the later `.plan` edits are mechanical. Consequence: one document for one design.
  Rejected: moving each group into the document it amends (a calls change reviewed in four places), and a partial
  split.
