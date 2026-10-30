# From-scratch experiment, output 1: new shapes

Status: brainstorm, written 2026-10-31 (open-items 20). **Nothing here is proposed, decided or checked against
the current design.** I did not read machine-design.md or any proposal. Sources read: principles.md,
reference/example-apps.md, merged/server-calls/requirements.md (R1-R38, P1-P23), merge-6-streams/brief.md (SR, FC),
open-items.md. Prior art is cited from memory and unverified. All code is invented syntax, not Flow's.

Citations: R = server-calls requirement, P = server-calls problem, SR/FC = streams requirement / failure case,
DG = streams design goal.

The recurring observation behind most ideas: the requirements list many separate things that look like one thing
seen from different sides. A write's `unknown`, a stream's "may have missed", a stale cache and a restored lane
are all "I do not know whether my picture is current". A write attempt, a timer, a stream session and an
optimistic row are all "an obligation with an identity that outlives a screen". Pending-ness, lockout, cooldown,
`Retry-After` and a seat hold are all "a deadline stored in state". The ideas below pull on those threads.

---

## A. Core model

### 1. Intent ledger: one durable table of obligations
**Idea.** Every write attempt, timer, stream session, optimistic mutation and hold is a row in one ledger owned by
the runtime: `{ id, kind, key, owner, status, deadline?, basis?, attempts[] }`. Machines do not "start" these;
they append intents and read rows. An ending is a ledger transition, committed atomically with the decision about
who hears it, not a message that is routed later.
```ts
const intent = ledger.open(Pay, { key: order.id, input })      // row appended, returns typed handle
state("Paying", { when: intent.settled, to: ({ verdict }) => verdict.match({ Done: "Paid", Unknown: "Unsure" }) })
```
**Addresses.** R2, R25, R26, R29, R30, R32 (a webhook is another writer of the same row), P1, P3, P7, P9, P19;
SR29, SR30, SR33.
**Unifies.** Attempt identity, `abandoned` vs `outcomes`, `.pending`, reload resume, compensation after leaving,
stream session ownership and release. P1 and P3 come from "settled" and "delivered" being two moments; in a ledger
there is one status column and the reader asks it.
**Risk.** Machine code becomes "read the table", which hides control flow from the statechart picture; the ledger
is a second source of truth beside the snapshot.
**Prior art.** Temporal's event history, outbox pattern, Datomic transaction entities, Replicache's pending mutations.

### 2. State is a fold over a durable event log
**Idea.** The only stored thing is the append-only log of inputs (events, service replies, clock ticks, transport
signals). Snapshot, persistence, reload, SSR transfer, tab handover, Inspection and Story playback are all "fold
the log up to here". Snapshots are a cache of the fold.
```ts
const actor = Flow.start(Checkout, { log: Log.indexedDb("checkout") })  // reload = refold
actor.at(logPosition).snapshot                                           // time travel for free
```
**Addresses.** R30, SR2 and SR31 (restore has no baseline because the log has all facts), SR32, SR34, R34, R37,
R38, P20.
**Unifies.** Persistence, SSR hydration, multi-tab handover, Stories and Inspection become one mechanism.
**Risk.** Log growth and migration: a changed machine cannot refold an old log. Needs checkpoints and a versioning
story. Determinism demands that every nondeterministic input (time, random, ids) goes into the log.
**Prior art.** Event sourcing, Redux DevTools, Elm time travel, Temporal replay, rr, Replicache.

### 3. Tri-state knowledge as the one uncertainty type
**Idea.** A single type `Know<A> = Known(A, basis) | Missed(range) | Unknown(since)` is what every async thing
returns about the outside world. A write ending is `Know<Result>`. A stream interruption is `Know<Gap>`. A cache
read is `Know<Value>` with age. A restored lane is `Unknown`. Combinators (`ifKnown`, `reconcile`) are shared.
```ts
match(feed.afterReconnect) { Known: ok, Missed: ({ range }) => repair(range), Unknown: () => repair(all) }
match(write.ending)        { Known: ({ value }) => done, Unknown: () => reconcile }
```
**Addresses.** R8-R10, R22, R23, SR5-SR8, SR10, SR20, SR21, SR25, FC4, FC5; P2, P7 (an unmapped Unknown cannot
exist because match must be total).
**Unifies.** "nothing missed / something missed / unknown" (SR5) and write `done / failed / unknown` (R10) are the
same three answers. One exhaustiveness rule and one `flow check` rule instead of two sets of keys.
**Risk.** Over-abstraction: writes and feeds repair differently, and a shared name may hide real differences. The
`basis` field (SR6) is new bookkeeping.
**Prior art.** Three-valued logic, Datomic `as-of` basis, Effect `Exit`, Jepsen's ok/fail/info for operations.

### 4. Two tiers: signals for data, statecharts for intent
**Idea.** Most screens are data bindings (Issue list: search, sort, filter, page, a resource). Make that a
dataflow of typed signals with combinators (`debounce`, `resetOn`), and keep statecharts for workflows (sign-in,
wizard, checkout). The two meet at one bridge: a signal can be an event source and a state can hold a signal.
```ts
const q = Query.of({ search: Signal.text().debounce("300 millis"), page: 1, sort, status })
  .resetOn(["search","sort","status"], "page")           // resets page to 1
const issues = O.Issues.list(q)                          // a live resource over the signal
```
**Addresses.** Issue list app; R14 (delay as a signal), R33, SR20-SR22, DG2 (code size), DG4 (common case cheap).
**Unifies.** Debounce, reset-page-on-filter, "derive resource key" would not need fragments or traits (these are
the `trait` examples in principles.md section 1: field, toggle, debounce, pagination).
**Risk.** Two models to learn; the line between "data" and "workflow" is blurry (a form is both). Static analysis
must cover signals too.
**Prior art.** Solid/Jotai/MobX, Reflex FRP, TanStack Query keys, XState actors beside atoms.

### 5. Reactive (eventless) transitions over derived state
**Idea.** Alongside event transitions, a state may declare `when(predicate)` transitions over snapshot-derived
values, including time-derived ones. The runtime re-evaluates affected predicates after each turn. Three wrong
codes means `when(attempts >= 3)`; no event is invented and no handler exists just to arm something.
```ts
state("Entering", { when: [{ if: s => s.wrong >= 3, to: "Locked" }] })
state("Locked", { until: s => s.lockedAt + 5*MIN, to: "Entering", set: { wrong: 0 } })
```
**Addresses.** Two-factor app (lockout, resend cooldown), open-items 1 (handler that exists only so a schedule
can arm), R18, R19, R20, P10 (internal events: 200 across 17 machines), P12, P14 (the memory read is the
post-turn snapshot, no ambiguity), P15.
**Unifies.** Timers, guards, counters and `armOn` collapse to "predicate over state and `now`".
**Risk.** Evaluation order, loops (a predicate that re-triggers itself) and "when" firing at a surprising moment;
statecharts people like events because they are explicit. Needs a cycle check.
**Prior art.** SCXML eventless transitions, XState `always`, Rete rules, Excel dependencies, TLA+ enabled actions.

### 6. Time lives in state as deadlines, never as timers
**Idea.** There are no timers. A deadline is a timestamp field in memory (`lockedUntil`, `holdExpiresAt`,
`retryAt`). One scheduler asks the snapshot "what is the earliest future instant at which any predicate may
change?" and wakes once. Server-dictated delays (`Retry-After`) just write a timestamp. Per-key schedules (R18)
are rows in a keyed map.
```ts
memory: { cooldownUntil: Map<Phone, Instant> }
guard: (s, e) => now() >= s.cooldownUntil.get(e.phone)      // `now()` is a tracked read
```
**Addresses.** R14-R20, P14, P15, SR23 (page waking: deadlines are compared to wall time, a sleeping laptop just
sees it passed), SR31 (deadlines survive reload automatically).
**Unifies.** Timers cancelled on exit, per-key timers, countdown display (a view reading `now` with a coarse
tick), restore-after-reload.
**Risk.** Tracked `now()` reads are a subtle reactive contract; clock skew; tests need a virtual clock service.
**Prior art.** Datomic `as-of`, Elm `Time.every` replaced by model fields, TLA+ time as variable, Temporal timers as durable state.

### 7. Statecharts as data, with no closures
**Idea.** A machine is a plain serialisable tree. Guards, actions and key selectors are expressions in a small
total language (or named, registered pure functions with declared reads/writes), not arbitrary JS closures. The
TypeScript builder produces the data; the library never executes unreviewable code in the decision path.
```ts
on("Submit", { guard: Expr.eq(path("code.length"), 6), set: { error: Expr.none }, to: "Checking" })
```
**Addresses.** R35, SR36, DG5, principles "truth is a compilation target", Inspection, `flow check`, `flow explain`,
SSR and handover (machines are JSON).
**Unifies.** Static analysis, Inspection and the CLI see exactly what runs; no gap between "analysable subset" and
"what authors write".
**Risk.** Authoring ergonomics and expressiveness (an expression language is a language). Escape hatch erodes the
guarantee. Typed errors get worse.
**Prior art.** SCXML, Datomic rules, CEL, JSON Logic, Cedar policies, XState JSON definitions.

---

## B. I/O and server calls

### 8. Commands as data, replies as typed unions (the Elm shape)
**Idea.** Machines never call anything. A transition returns `[nextState, commands]`; a command is a plain record
naming a contract entry and carrying input. The reply union is part of the command's type, so "ending" plumbing
is generated: no `internalEvents`, no mapper, no four-place rename. The interpreter is the only code touching
Effect.
```ts
on("Submit", ({ s }) => [s.to("Paying"), Pay({ order: s.order.id })])   // reply handled by a case table next to it
state("Paying", { reply: Pay, Done: "Paid", Unknown: "Unsure", Declined: ({ e }) => ["Entering", set(e.reason)] })
```
**Addresses.** P10 (200 internal events), P11, P6, P9 (the Attempt rides the command), R9, R37, R38, R34.
**Unifies.** Every external effect is one data shape; Stories interpret commands against fakes with no machinery.
**Risk.** Feels like Elm boilerplate; concurrency and cancellation semantics must live in the command, which
leads to idea 9.
**Prior art.** Elm `Cmd`, Redux-Loop, TEA, Free monads, Effect `Request`/`RequestResolver`.

### 9. Keyed lanes: one concurrency primitive
**Idea.** Replace "concurrency modes" per feature with one noun: a **lane**, an ordered keyed queue with a
discipline (`reject | replace | coalesce | serial | parallel`). Writes, polls, stream sessions and timers all
occupy lanes. `reject` is a lane that answers "NotAccepted" as an ending (P5), never silence.
```ts
lane(Toggle,  { key: row => row.id, discipline: "coalesce" })    // rapid toggles: latest wins
lane(Session, { key: c => c.id,     discipline: "replace" })     // new session releases old first (SR17)
```
**Addresses.** R4-R7, R14-R16, P5, P16, SR17, SR39 (many sessions behave like one, many times), FC7, open-items 5-8.
**Unifies.** Per-key serialisation, coalescing, "release before restart", duplicate-session handling and
"one write in flight per key".
**Risk.** Disciplines are a closed set; real apps want weird ones (drop-oldest-keep-two). Needs an escape hatch.
**Prior art.** Erlang process-per-key mailboxes, RxJS `exhaustMap/switchMap/concatMap`, Effect `Semaphore`/`Queue`,
ember-concurrency task modifiers.

### 10. Policy algebra: retry, lockout, cooldown, budget are one value
**Idea.** A `Policy` is a value built from combinators and evaluated against the ledger (idea 1) or a keyed
state cell. `retry(3, backoff.exp("1s"))`, `cooldown("30s").perKey`, `lockout(3, "5m")`,
`honour(retryAfter)`. The same policy produces the countdown a view reads.
```ts
const resend = policy.cooldown("30 seconds").per(c => c.challengeId)
const code   = policy.lockout({ strikes: 3, for: "5 minutes", on: "WrongCode" })
resend.remaining(s)  // view reads the countdown
```
**Addresses.** R18, R19, R20, R21, R33, P12 (25 lines per loop), P14, P15; two-factor and signup apps.
**Unifies.** Hand-written countdown machines, the visible retry recipe, `Retry-After` handling, per-key schedules.
**Risk.** Algebra of policies grows features; too declarative for odd app rules. The visible retry ("2 of 3")
must still be a real state to be analysable.
**Prior art.** Effect `Schedule`, Polly / resilience4j, Stripe idempotency retry guidance, Akka circuit breaker.

### 11. Contract-first: one declaration generates stub, adapter, fake, error union and checks
**Idea.** An endpoint declaration (input, output, typed errors, idempotency, position/kind for streams) is the
single source. From it: the client adapter, a server handler skeleton, a deterministic fake with the controls
Stories need (produce each ending), JSON schema for `flow check`, and the exhaustive-ending type.
```ts
const Pay = Endpoint.write("pay", { input, ok, fail: { Declined, Busy }, idempotent: "key", unknownOn: ["timeout"] })
Pay.fake.produce("Unknown")          // for Stories, generated
```
**Addresses.** R9, R35, R36, R37, R38, P11 (`NotSent` generated), P20, P23, SR15, SR34, SR35, open-items 13 (`fromRpc`).
**Unifies.** Real path, fixture path and Story path share one declaration (R37/R38 hold by construction).
**Risk.** Needs to meet people's existing backends (REST, GraphQL); the declaration must be thin enough to wrap
them. "Flow is not a network library" is a principle.
**Prior art.** tRPC, Effect RPC/HttpApi, OpenAPI, Smithy, Pact consumer contracts.

### 12. Durable step functions for multi-step writes (workflow-as-code)
**Idea.** A write saga (create, then 3DS challenge, then poll, then compensate) is written as one `Effect.gen`
body whose awaited steps are journaled. Reload replays the journal; the body continues where it was. Statecharts
decide *when to start* and *what the screen shows*; the saga decides *how the write proceeds*.
```ts
const checkout = durable("checkout", function* (order) {
  const pi = yield* step("charge", Pay(order))
  if (pi.requiresAction) yield* step("3ds", Challenge(pi))
  return yield* poll("status", Status(pi.id), backoff)
})
```
**Addresses.** R11, R22-R26, R30, R31 (polling is a step), P2, P7, P18, P19.
**Unifies.** Reconcile, compensate, poll, step-up and retry-after-sub-flow, which today need machine states.
**Risk.** Two workflow models (chart plus saga); determinism constraints on the body; UI progress must still
flow into the statechart (events from steps).
**Prior art.** Temporal, Azure Durable Functions, Restate, redux-saga, Effect Workflow.

### 13. Server-truth channels: one "completer" per intent
**Idea.** Any signal that proves a write's outcome (HTTP reply, stream ack, webhook, a poll, an entity update)
is a *completer* attached to the intent. The first to arrive wins; later ones are checked for conflict and logged.
The author names where truth can come from, not how to merge them.
```ts
Pay.completeVia(HttpReply, Feed.acks(o => o.orderId), Poll.every("2s", Status))
```
**Addresses.** R32, R31, R22, R23, SR29, P18, FC (stream ack completes a write).
**Unifies.** Poll-as-transaction vs poll-as-refetch confusion, ack streams, webhooks, reconcile-by-read.
**Risk.** Conflicting completers; ordering with `Unknown`; needs idea 1 to be natural.
**Prior art.** Sagas with event correlation, Stripe webhooks + client confirm, Temporal signals, CQRS read models.

---

## C. Streams and data

### 14. Feeds are tables: cursor, status, and gap are columns
**Idea.** Treat a stream as a replicated append-only table owned by Flow, with fixed columns (`pos`, `fact`) and a
fixed status record (`phase`, `basis`, `gaps`, `lastHeard`). The author declares the table's `kind` (facts or
state), position codec and a `subscribe(from)` adapter. Everything else (resume position, dedupe, ordering,
connection status, quiet-versus-dead) is derived, not written per app.
```ts
const Chat = Feed.facts("chat", { pos: Schema.Number, row: Message, subscribe: from => ws.messages(from) })
chat.rows; chat.status.phase; chat.status.gaps   // views read the same table everywhere
```
**Addresses.** SR1-SR4, SR9, SR12, SR20-SR22, SR39, FC1-FC6, open-items 15 (resume/dedupe wiring in every app),
DG2, DG3.
**Unifies.** "Wiring the author writes": position rule written twice (contract and machine), reconnect state kept
twice, status flags re-derived.
**Risk.** A table abstraction on top of SDK callbacks (Firestore, Pusher) may leak; state feeds are a table with
one row and may feel forced.
**Prior art.** Kafka consumer offsets, Phoenix LiveView streams, Replicache pull cursor, ElectricSQL shapes, Datomic log.

### 15. Gaps as intervals: loss is a range to repair, not a verdict
**Idea.** Instead of a per-reconnect verdict, keep the set of *known intervals* of the source's position space.
A reconnect that resumes proves one interval; a drop leaves an open interval `(lastPos, ?)`. The repair step is
"fill this interval" (catch-up read or snapshot). SR10's "every loss has an end" becomes "no open intervals".
```ts
feed.gaps          // [{ from: 120, to: unknown }]
feed.repairWith(Chat.page)   // fills intervals; each fill closes one
```
**Addresses.** SR5, SR9-SR12 (duplicates and reordering do not imply holes), SR14, SR21, SR24, FC4, FC5, FC8.
**Unifies.** Catch-up paging, resets/epochs (a new position space is a new interval set), "unknown after restore".
**Risk.** Position spaces with no order (opaque cursors) cannot form intervals; falls back to one big unknown gap.
**Prior art.** TCP selective ack, rsync, Merkle sync, CRDT version vectors, Kafka log segments, Matrix gaps in timelines.

### 16. Remote<A>: one cell for read, resource, stream and write result
**Idea.** Every server-backed value a view or guard sees is `Remote<A>`: `{ value, basis, status, age, pending }`,
where status is `live | stale | loading | failed`. A one-off read, a live resource, a state feed, a `listen`-covered
entity answer and the result of the last write are all the same cell with different producers.
```ts
const price = ctx.remote(Ticker, { symbol })          // state feed
price.status === "live" ? price.value : dim(price.value)   // SR22: one test everywhere
```
**Addresses.** R33, SR20-SR22, SR25, SR32, FC5, FC6, DG3, DG4.
**Unifies.** Freshness vocabulary (current, last-known, restored, covered-by-push) across resources, feeds,
entities and SSR.
**Risk.** One shape for very different lifecycles may become a bag of optional fields.
**Prior art.** React Query result object, Relay, SWR, Apollo `networkStatus`, Elm `RemoteData`.

### 17. Entities as a local relational store with a rebasing mutation log
**Idea.** Entity records live in a small client store. Optimistic writes are *pending mutations* kept in the log
and replayed on top of the latest server base (rebase), not patched in place. A rejected or unknown write simply
stops being replayed; screens never reconcile by hand.
```ts
Tickets.mutate(id, t => ({ ...t, status: "done" }), { via: Close })   // overlay until the ledger row settles
```
**Addresses.** Entity coherence (non-goal: sync engine), R12 (per-item cache rules), R26, R25 (a late ending
still updates the app), SR24, SR25, P17.
**Unifies.** Optimistic updates, rollback, per-item batch results, entity invalidation after writes.
**Risk.** Rebase needs pure mutators and bounded work; scope creep into a sync engine, which the owner excluded.
**Prior art.** Replicache rebase, Zero, TanStack DB optimistic transactions, Relay optimistic updaters, Git.

### 18. Process supervision for sessions
**Idea.** Each long-lived session (stream, upload, poll) is a supervised child with a strategy and a restart
*intensity* over a window (OTP `max_restarts` in `max_seconds`). Flapping servers (SR14) are "intensity
exceeded"; the supervisor escalates to the machine as one explicit event, never silently loops.
```ts
supervise(Chat, { restart: "transient", intensity: { max: 5, within: "1 minute" }, onGiveUp: "Offline" })
```
**Addresses.** SR13, SR14, SR16, SR17, SR33, R20, FC19, FC36, FC41, FC46, P7.
**Unifies.** Reconnect budget, health-over-time, "stall fails", and release-before-restart.
**Risk.** SR13 says Flow never reopens a session; supervision must stay "adapter reconnects inside a session,
Flow decides only about new sessions".
**Prior art.** Erlang/OTP supervisors, Akka, Kubernetes restart backoff, Phoenix channel rejoin.

---

## D. Testing and tooling

### 19. Simulation testing: adversarial worlds generated from contracts
**Idea.** Given contracts (idea 11) and the machine, `flow simulate` generates adversarial worlds: every ending
from each write, transport dropped at every step, duplicated and reordered frames, clock jumps. It checks
declared invariants ("never charge twice", "no fact delivered before its interruption answer"). Stories become
the minimised failing traces.
```ts
invariant("one charge per order", w => w.server.charges.filter(c => c.order == o).length <= 1)
// flow simulate --seed 41 --steps 500
```
**Addresses.** R9, R34, R35, SR8 (executable model of every (state, input) pair), SR35, SR36, P2, P20, DG5.
**Unifies.** The 81 failure cases become a standing property suite instead of hand-written Stories.
**Risk.** Writing invariants and a faithful fake server is the hard part; state explosion; flaky if nondeterminism
leaks (needs idea 2).
**Prior art.** FoundationDB simulation, Jepsen, QuickCheck state machines, TLA+/Stateright, Hypothesis stateful testing.

### 20. Record real sessions, replay as Stories
**Idea.** The log (idea 2) from a real run is exported as a Story: events, service replies, transport signals, clock.
Edit it (cut, assert, branch) rather than writing it. A demo is the same trace with prettier fixtures. Bug reports
are traces.
```
flow record --out signin.trace    # then:  Story.fromTrace("signin.trace").assert(state("SignedIn"))
```
**Addresses.** R34, R37, R38, SR34, SR35, P20, FC repro, agent UX (an agent can hand over a trace).
**Unifies.** Stories, demos, bug repros, golden tests and playback.
**Risk.** Traces rot when the machine changes; secrets in recordings; needs stable event identity.
**Prior art.** VCR/Polly cassettes, Cypress/Playwright codegen, Redux DevTools import/export, rr, Sentry replay.

### 21. Fake worlds as services with a "world" controller
**Idea.** Every external seam is an Effect service; a `World` object is the only controller for fakes: time,
network, server state and their failures (`world.net.drop()`, `world.server.charge("unknown")`). The same World
API drives unit Stories, browser demos and simulation (idea 19). Authors never write mock plumbing.
```ts
world.clock.advance("5 minutes"); world.net.drop({ code: 1006 }); world.server.pay.next("Unknown")
```
**Addresses.** R34, R38, SR34, SR35, P20, P11 (Stories can produce `NotSent`).
**Unifies.** Mocking style across writes, feeds and time.
**Risk.** Every service needs a fake; fidelity is the author's burden unless contracts generate it (idea 11).
**Prior art.** MSW, Mock Service Worker handlers, Effect `TestClock`/Layers, Stripe test mode, Storybook decorators.

### 22. Example-first authoring: sketch the chart from scenarios
**Idea.** For agent UX and readability: author writes 3-6 scenarios (Given/When/Then over the contract), and
`flow sketch` proposes the statechart skeleton plus the missing ones the checker finds (unhandled ending, loss,
race). Scenarios stay as Stories. The machine is then the minimal chart consistent with them.
```
scenario "third wrong code locks" { code.wrong x3 -> Locked; after 5m -> Entering(wrong=0) }
```
**Addresses.** R35, SR36, SR40 (likely mistakes fail loudly), DG2, DG5, principles agent UX.
**Unifies.** Specs, tests and docs, and gives agents a stable target to generate against.
**Risk.** Synthesis is hard; a generated chart may be unreadable. Safer variant: scenarios are checked against a
hand-written chart (model-checking), no synthesis.
**Prior art.** BDD/Cucumber, Alloy examples, program synthesis (Sketch), TLA+ model checking, XState model-based testing.

---

## Ranking: top 5 for removing complexity

1. **Intent ledger (1)**: one durable table of obligations ends the "settled versus delivered" class (P1, P3, P7),
   reload resume, abandonment and session ownership at once.
2. **Tri-state knowledge (3)**: write `unknown`, stream "may have missed" and stale/restored data are the same
   idea; one type and one exhaustiveness rule replace two parallel vocabularies.
3. **Keyed lanes (9)**: one concurrency noun covers per-key writes, coalescing, duplicate sessions and
   release-before-restart, replacing a family of mode words.
4. **Time as deadlines plus reactive transitions (5+6)**: lockouts, cooldowns, `Retry-After`, holds and countdowns
   become fields and predicates; the arm-only handlers and most internal events disappear.
5. **Feeds as tables (14)**: resume position, dedupe, ordering and connection status stop being per-app wiring
   (open-items 15) and become derived columns of one declared source.

Honourable mentions: commands as data (8) for killing event plumbing; log-as-truth (2) as the base that makes
1, 19 and 20 cheap; contract-first (11) for R37/R38 by construction.
