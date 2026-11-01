# Convergence 1: the runtime, designed once

Status: **everything here is proposed.** Written under the owner's delegation; nothing is decided until the owner says so. Evidence marks: **[ran]** I ran it on 2026-11-02 (Bun 1.4.2, Effect 4.0.5, this Mac, one process at a time), **[read]** I read the code or text, **[estimate]**, **[bet]**. Nothing here has been compiled. `D1`..`D24` are this document's proposed decisions; the suite cites them.

Source order: `machine-design.md`, then converted Checkout and desk code. `.plan` files only where the design is silent.

---

## 1. Walkthrough

A shopper presses Pay. The bytes come from `fetch`, inside the author's service. Flow is not a network library.

```ts
// adapters/shop-api.ts (user-defined, existing Checkout code): the real API
confirm: (i, { idempotencyKey }) => Effect.tryPromise({
  try: () => fetch("/api/confirm", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(i) }),
  catch: () => new NoResponse(),                       // user-defined: fetch rejected, the charge may have landed
})
// pay.contracts.ts (existing)                         // existing: transaction, key, concurrency, commit, Outcome
export const pay = transaction({
  id: "Checkout/pay", key: ["intentId"], concurrency: "reject",
  timeout: "60 seconds",                               // NEW: timeout (D8). Absent means none: `authenticate` waits on a person
  commit: (input, { attempt }) => ShopApi.use((api) => api.confirm(input, { idempotencyKey: attempt.id })).pipe(unknownWhenLost),
})
```

What happens, with no internal name in user code:

1. **Click.** `actor.send(PayRequested)` calls `pump`. The pump is idle, so the turn runs before `send` returns. One function, `step(world, input, env)`, takes the whole Runtime as a value and returns a new value, at most one publication and a list of commands. PAYING is entered, `pay` mints Attempt `a1`, the lane is `InFlight`, and all of it publishes as one cut. Nothing has been sent.
2. **Write-ahead.** The Attempt's lane record goes to storage as a `persist` command. The record says "waiting for ack". After every step, one pass asks of each dirty lane "what is this Attempt still waiting for?"
3. **Ack.** Storage answers. That input makes `a1` eligible, so the pass emits `invoke`. The driver does `Effect.runFork(commit)` and `fiber.addObserver(...)`. It also arms a core timer for `timeout`.
4. **The Wi-Fi dies.** `fetch` rejects; the commit fails with `Outcome.unknown`. The observer sends `{ k: "sent", attempt: a1, send: 1, exit }`. This input applies at once: rule 18 runs and the store (if any) is told. The ending joins the mail. The lane still reads `pending`.
5. **Admission.** The next turn admits the ending, the lane goes `Held`, the event `PayUnsure` moves the machine to UNSURE. A `timeout` that fires later carries a stale generation, so the core drops it with evidence. If the timer had won, `fetch`'s late answer is the one dropped: one ending per send, enforced in the core rather than by a driver latch (D5).
6. **Reconcile.** UNSURE's 3 s schedule asks the intent. `requires_payment_method` means nothing landed: `O.pay.retry` re-sends **the same id**. Stripe dedups.
7. **Reload at any point.** The lane record decodes, an acknowledged Attempt restores as `unknown { Restored }`, and the same handler runs. It is one path, not a recovery path beside the real one.

In a tab with two actors writing one record, one more thing is true: a write keeps its place in the record's queue from its first commit until it is resolved or released. A retry never rejoins. That one sentence is what removes the deadlock (D3).

**Reserved by Flow:** Attempt, lane, `Held`, `unknown`, `Restored`, `TimedOut`. **Chosen by the author:** `PayRequested`, `PayUnsure`, UNSURE, the service.

---

## 2. The shape in one screen

| Choice | Pick | Why it holds together |
| --- | --- | --- |
| Unit of atomicity | one `step` over one world | rules 27, 28, 35; review 2.2 confirmed |
| Unit of order | one Runtime-wide FIFO of mail (D1) | fills the turn-order gap; no per-actor scheduler exists to get wrong |
| Waits | in the core only if a rule makes them observable, else an ordinary Effect (D7) | answers "where does each wait live", review 2.7 |
| Async honesty | every command carries a generation; every input echoes it; the core drops mismatches (D5) | one mechanism replaces latches, connection ids, read ids, timer ids |
| Wake-ups | eligibility recomputed after every step over a dirty set (D4) | level-triggered, so no lost wake-up by construction |
| Record order | mint order, never re-sorted, never rejoined (D3) | the only variant in S1 with no cycle and no inversion, and what Query, DB and Replicache do |
| Optional parts | modules with data-declared hooks; contracts import them (D9) | F10; core never names entities or streams |
| Failure | a closure throwing is `InvalidTurn` from `Slot.at`; our own bug aborts the step and leaves the value (D10) | F6, and purity pays for it |

Four abstract consequences, because the rules below only make sense with them:

- **A stuck world is a defect to be proved absent.** S1 showed that I1-I15 pass on a deadlocked world. Section 6 therefore has liveness invariants, and every wait has a named sink.
- **Delivery from the driver is at-least-once; exactly-once lives in the core.** This reverses S2's frame, which put it in a driver latch. So a double completion is harmless and only a missing one matters, which reduces the wrapper to one obligation.
- **Everything an async input can say is a claim about a generation.** Reload bumps the boot id, so a claim from a dead process cannot even be expressed.
- **Time is an input.** `now`, ids, jitter and steppers come through `env`, and the input log replays them.

---

## 3. State ownership and the world

| State | Owner | Writers | In the world? |
| --- | --- | --- | --- |
| Leaf, activations, memory, incarnations, reset values | actor record | its turns | yes |
| Mail, follow-ups | Runtime | any step | yes (`mail`, `followUps`) |
| Write lanes, Attempts, send history, parked endings | Runtime | binding turn, or Runtime step | yes |
| Read lanes | actor | turn; completion | yes |
| Timers: `{ dueAt, gen, cause }` | Runtime | strata; firing | yes. The host timer handle is not |
| Store: records, predictions, queues, marks | `entities` module | turn, settlement, pushes | `ext.entities` |
| Session variables, bookmark | `streams` module | Runtime step, turn | `ext.streams`; bookmark in the slice |
| Persistence: unacked set, capture version | `persistence` module | completions | `ext.persistence` |
| `Schedule` steppers | driver, passed through `env` | `env` only | no (F4) |
| Fibers, abort controllers, sockets, `Feed.callback` queue, scopes | driver and adapters | Effect | no |
| Evidence, input log | loop | appended after a step | no. It is a sink, and replay never reads it |
| Server truth | the world | never Flow | no |

```ts
// world.ts. NEW, internal. All maps persistent (review 2.3: Map copy costs 2.4 ms at 50k records).
type World = {
  readonly boot: number                    // persisted, +1 on every start. Makes every id below unique across reloads (F8)
  readonly nextId: number                  // activations, generations. `${boot}:${n}`
  readonly nextMint: number                // Attempt mint order, restored as max(saved)+1 (D3)
  readonly clockSeq: number                // publication sequence
  readonly actors: PMap<ActorKey, ActorRec>
  readonly lanes: PMap<LaneKey, Lane>
  readonly timers: PMap<TimerKey, Timer>
  readonly mail: PQueue<Mail>              // one FIFO for the Runtime (D1)
  readonly followUps: PQueue<Mail>         // head insertions: pending resets, adoption deliveries
  readonly dirty: ReadonlySet<LaneKey>     // lanes whose eligibility must be rechecked (D4)
  readonly admission: "open" | "held"      // together()
  readonly ext: { readonly [m: ModuleId]: unknown }   // module slices; core never reads inside
}
type Lane = {
  readonly id: LaneKey; readonly state: "InFlight" | "Held"  // Idle is absence
  readonly head: Attempt; readonly waiting: readonly Attempt[]            // W
  readonly subject: string; readonly bound: boolean; readonly releasing: boolean
  readonly parked: readonly RawEnding[]
}
type Attempt = {
  readonly id: string; readonly mint: number; readonly op: OpId; readonly input: unknown
  readonly owner: ActivationId; readonly sends: number; readonly mayHaveApplied: boolean
  readonly wire: { readonly gen: number; readonly timeout?: TimerKey } | undefined
  readonly waits: { readonly ack: boolean; readonly capture: boolean }    // record queues are read through the seam
}
```

---

## 4. The step

### 4.1 Inputs

```ts
type Input =
  // Applied now, always before the next turn
  | { k: "sent"; attempt: AttemptId; send: number; exit: SendExit }      // a completion, fenced by `send`
  | { k: "timer"; timer: TimerKey; gen: number }                         // firing; `next` from a stepper if it has one
  | { k: "acked"; attempt: AttemptId; ok: boolean } | { k: "captured"; lane: LaneKey; version: number; ok: boolean }
  | { k: "progress"; attempt: AttemptId; send: number; p: unknown }
  | { k: "module"; m: ModuleId; input: unknown }                         // sessions, store pushes, repair answers
  // Queued as mail
  | { k: "send"; actor: ActorKey; event: Ev }
  // The loop's own
  | { k: "turn" } | { k: "dispose"; actor: ActorKey } | { k: "ensure"; actor: ActorKey; machine: MachineId; input: unknown }
type SendExit =                                                          // pure reading of Exit and whole Cause (2.7.1)
  | { t: "ok"; value: unknown } | { t: "unknown"; reason: unknown } | { t: "failure"; reason: unknown }
  | { t: "defect"; cause: unknown } | { t: "interrupted"; cause: unknown }
```

`neverInvoked` cannot happen on the wire: `runFork` starts synchronously [read: S2's note and `runForkWith`], so "before invocation" is decided wholly in the core. `Cancelled` versus `Interrupted` comes from whether the world recorded a cancel for this send, so the classifier stays pure and rule 25's "classify outside the fiber" holds trivially.

### 4.2 Strata

A loop iteration: drain the inbox one input per step; then one `turn`; repeat. `check()` is P1-P5 in `mode: "check"`.

| Stratum | Runs | Reads | Throws mean | Kept on refusal |
| --- | --- | --- | --- | --- |
| **F** Fence | drop stale generation, with evidence | world | never throws | yes |
| **N** Now | applied-now input: rule 18, module hooks `onSettled`, `onInput` | world | module defect, issue | yes |
| **A0** Admit | ending's lane cell, promotion, owner test, map | pre-turn | a mapper throw is `InvalidTurn` for the turn, the cell stays | **always** |
| **A1** Soft | modules' `admitSoft` (bookmark cell) | pre-turn | | on `Denied`, `Unhandled`; **not** `InvalidTurn` (F3.1) |
| **P1** Select | alternatives, source patch | before; pre-turn lanes + admitted ending | guard throw: `InvalidTurn` | no |
| **P2** Reset | `resetOn`, `input` | before-walk | `InvalidTurn` (D11) | no |
| **P3** Walk | raises, children, notifies, exits, leaving | before, initial | `InvalidTurn` or refusal | no |
| **P4** After | patches, list repair | patches | list repair never refuses | no |
| **P5** Effect reads | commit selects, key selects, `optimistic`, schedule fns; predictions in dry form (D11) | after memory; pre-turn lanes | `InvalidTurn` | no |
| **P6** After lanes | member cells in action order, releasing marks; module `onMember` | P5 | none, declines are endings | no |
| **P7** Reconcile | desired `keys`, `when`, placements, `restartOn`, **`resetOn` re-check** (moved, F3.2); edges `armOn`, `disarmOn`, `Flow.entry` are collected here too | after memory, after lanes | `InvalidTurn` | no |
| **C** Commit | exits, entries, timers, follow-ups, modules' `onCommit` | all | **cannot throw**: every closure already ran | n/a |
| **D** Dispatch | after **every** step: for each dirty lane, ask eligibility; emit `invoke` | world | no closure | n/a |
| **O** Output | one frame if anything visible changed; outbox | | | |

`check()` mints nothing, joins nothing and predicts in dry form, so a prediction that throws is `InvalidTurn` in both. I10 stays true except for what `check` cannot know: a record queue changed between the read and the send. Stated, narrow.

P5 reads pre-turn lanes while P7 reads after lanes, which rule 22 and 2.5 already require. Acyclicity was hand-checked by discussion 3.3 and re-checked by review 2.2; not run.

### 4.3 Turn order (D1)

The design does not say; review 2.9 confirmed the gap. **One Runtime FIFO over every mail item, by arrival.** A follow-up (pending reset, adoption delivery) inherits its cause's place, so it runs next, before any other actor. `a1, b1, a2` with a head insert `x` on `a` runs `a1, x, b1, a2`.

Consequences, reasoned through:

- Per-actor FIFO is implied. Story determinism needs no extra rule beyond rule 61's order of arrival. Amend 2.10.17.5 and P21.
- Fairness: an `every` session has one item in mail at a time (T4), so a flood takes one slot per cycle and cannot starve a click.
- A chain of turns is bounded by `bounds.followUps` per admitted item (64). Past it, `InvalidTurn` naming the chain. This is the `resetOn` oscillation below.
- Rule 61's "tabs take turns" is unaffected: each tab is a Runtime.

Rejected: round-robin per actor (a burst on one actor reorders against what a person did); drain-one-actor (starves).

### 4.4 Other system-level problems (not only deadlock)

| Class | Instance | Answer |
| --- | --- | --- |
| Deadlock | queue-lane cycle | D3 |
| **Wait with no sink** | never-answering storage; never-answering **forced repair** (rule 30 holds the queue until it settles) | every wait gets a bound or an owner: section 6's table. Repair bound D12 |
| **Livelock** | `resetOn` oscillation; A sends B sends A; 0 ms schedule re-arming; a synchronous commit re-triggering itself | follow-up bound; drain budget that yields to the host; test-mode issue `TurnStorm` (D13) |
| **Starvation** | a long drain freezes the page; EntityDomains O5 has no budget | production budget 8 ms, then a macrotask. Order is unchanged: budget affects when, never what. During a yield, `send` queues (review 2.3) |
| **Priority inversion** | a settled ending behind 1,000 items keeps a lane `pending`, so a promoted write waits | accepted: FIFO is bounded and nothing cycles. A row may read `pending` while the store is confirmed, which the design already names |
| **Lost command** | a synchronous throw in `exec` skips the rest of the list | every command runs in its own try; a start that throws becomes `{ k: "sent", exit: defect }` (D6) |
| **Reentrancy** | subscriber sends during notify; `addObserver` calls back at once if the fiber already exited [read `internal/effect.ts:560`]; a commit's synchronous body calls `send` | `input()` only appends while `running`; notify after the loop |
| **Torn read** | `getSnapshot` during a drain | world variable is assigned only after a step returns; a snapshot is a value with a hidden world reference |
| **Retention** | a kept snapshot pins a store version | bounded by persistent sharing; review 2.3 asks to measure; deferred to the browser round |
| **Clock jump** | wake from sleep fires everything at once; `idle` fires before a socket frame that is already queued | due timers fire ordered by `(dueAt, arm order)`; a recurring schedule computes next from `now`, one firing, no catch-up; a false `Silent` only reconnects and over-replays. Stated |
| **Boot race** | a lane record newer than its actor record | activation ids carry `boot`, so rule 14 cannot confuse them (F8). Lane record is truth |
| **Disposal hang** | `Scope.close` and `Fiber.interruptAll` wait forever on an uninterruptible fiber (S2, section 8) | dispose never awaits unbounded: a core timer ends it; survivors are evidence `AbandonedFiber` |
| **Two writers** | two tabs, one scope | stated limit, unchanged (2.7.13) |
| **Flood** | 1,024 repaired items are 1,024 turns | stays per rule 67; review's 40% bet that a batch form appears is open; measured at round 4 |

### 4.5 Why one queue instead of per-actor mailboxes

Inspection's `work` is a filter; Runtime O4's cap of 1,024 per actor is a counter. 1,000 actors cost nothing when idle. Reified `ActorRec.mailbox` would need a separate "who is next" anyway, and that structure would be the global order in disguise.

---

## 5. Driver, commands, and the wait criterion

```ts
type Command =
  | { k: "invoke"; attempt: AttemptId; send: number; op: OpId; input: unknown; ctx: { id: string; mayHaveApplied: boolean } }
  | { k: "interrupt"; attempt: AttemptId; send: number }
  | { k: "arm"; timer: TimerKey; gen: number; at: number } | { k: "disarm"; timer: TimerKey }
  | { k: "persist"; writes: ReadonlyArray<{ key: string; value: Encodable }>; then: PersistTicket }
  | { k: "module"; m: ModuleId; cmd: unknown }

// driver.ts. NEW, internal. The one obligation: at least one `sent` per invoke, whatever happens.
const invoke = (c: Invoke) => {
  let fiber
  try {
    fiber = Effect.runFork(ops[c.op].commit(c.input, ctxOf(c)), { scheduler })      // existing Effect API. Starts now [S2]
  } catch (cause) { return input({ k: "sent", attempt: c.attempt, send: c.send, exit: { t: "defect", cause } }) }
  fiber.addObserver((exit) => input({ k: "sent", attempt: c.attempt, send: c.send, exit: readExit(exit) }))
  fibers.set(keyOf(c), fiber)
}
```

**Picked: `runFork` + `addObserver` + a set the Runtime owns (shape B). This overrules S2's recommendation of C** (section 8). No `Scope` owns commits. Disposal: `interruptUnsafe` each, arm one core timer, finish on the timer or when the set empties.

**Loop.** Sync when idle. `pump` is the only loop:

```ts
const pump = () => {
  if (running) return; running = true
  try {
    while (inbox.length || runnable(world)) {
      const i = inbox.shift() ?? { k: "turn" as const }
      const out = safeStep(world, i, env)                  // D10: our bug aborts this step, world untouched, issue raised
      log.push(i, env.drawn()); world = out.world          // input log: F6
      frames.push(...out.frames); for (const c of out.commands) exec(c)
      if (budget.exceeded()) { host.later(pump); break }
    }
  } finally { running = false }
  notify()                                                 // per drain, never per publication
}
```

### The reification criterion (F4, F5; review 3.4 adopted, D7)

**A wait or value lives in the core only if a rule makes it observable: a guard, a row, Inspection, persistence, or a Story address. Otherwise it is an ordinary Effect in the driver.**

| Item | Where | Why |
| --- | --- | --- |
| Ack, capture, queue, wire, `W`, `Held` | core | rows, guards, restore |
| Operation timeout, release bound, dispose bound | core timer | outcome is a cell; must order against completions deterministically |
| T1 states and variables | core module | S5: the bookmark ties them to the slice; the row reads them |
| T1's connection, socket, abort | driver | not observable |
| `Schedule` stepper | driver, through `env` | a mutable closure; F4 |
| Bootstrap, shared read request, `Effect.cached` | driver | nothing reads inner states |
| Jitter randomness | `env.rng`, logged | I14 |

---

## 6. Invariants

### Safety

| # | Invariant | Mechanism |
| --- | --- | --- |
| S1 | Every publication is one complete cut | one value, assigned after `step` |
| S2 | Memory changes only in a committed turn | no other stratum writes it |
| S3 | A lane's status changes only in its binding turn or a Runtime step | table access only |
| S4 | **At most one ending is applied per send; at most one delivered per Attempt** | fence on `(attempt, send)` |
| S5 | No write to a record is sent while an older unresolved write to it exists, except a released one | D3 |
| S6 | No re-send carries a new id; no new id for an unresolved Attempt | rule 19 |
| S7 | A persisted Attempt's first `invoke` follows its ack, in world order | eligibility |
| S8 | Store effects do not depend on routing | N before A0 |
| S9 | `pending` from start until admission | cell |
| S10 | Restore never re-runs user `initial`, never replays history; a boot's ids never repeat | `boot` |
| S11 | Same inputs, `env` draws, closures: same publications | input-log replay as a check on every suite run |
| S12 | A "cannot occur" cell raises an issue; it is never a no-op | table interpreter |
| S13 | Queues of a record are sorted by mint; no join reorders | one `join` function |

### Liveness

**L1, the wait table.** Every non-terminal Attempt has exactly one kind of wait from this table, and each ends in a sink.

| Wait | On | Ends by | If it never comes |
| --- | --- | --- | --- |
| `W` | its lane's head | head resolved or released | head is older: L2 |
| queue | the entry ahead in a record | that entry resolved or released | ahead is older: L2 |
| ack | storage | `acked` | **`bounds.storage` (10 s): `NotSent { StorageRefused }`** (D14) |
| capture | storage | `captured` | same bound; re-send returns to `Held` |
| wire | the server | `sent` | `op.timeout`, else unbounded by choice, row shows `pending`. `authenticate` is the case |
| `Held` | machine or person | `retry`, `cancel` | `UnresolvedHold` at check time; unbound and blocking others: D15 |
| repair | a read | answer | **`bounds.repair` (30 s): queue releases, mark stays** (D12) |
| `Releasing` | scope close | close | 5 s |
| successor session | releasing predecessor | `Released` | above |
| dispose | all fibers | empty | bound |

**L2.** The wait-for graph over Attempts has no cycle: every `W` and queue edge points from higher mint to lower mint. Holds for joins at commit and no rejoin, no matter how many records or lanes. [S1: 0 cycles in the complete sweeps of `d`, 3 commits and 4 commits, both readings; ran again.] Proof is by the order, not by the model; streams, captures and adoption are in the wait table rather than in the graph, because they wait on the outside.

**L3.** A world with empty inbox, empty mail, no armed timer, nothing on the wire and no ack pending has **no** waiting Attempt: a non-`Held` waiting Attempt in that world is a bug. The suite asserts this after every step of every scenario and in the search. A `Held` head and those behind it are allowed only if Inspection names the owner.

**L4.** Every mail item is admitted in finite steps. FIFO, follow-up bound, and turn closures assumed to terminate (a diverging closure cannot be defended).

**L5.** Every invoked send produces a `sent` or a timeout's fence unless the commit neither ends nor has a timeout; then disposal still finishes (bound).

---

## 7. Compiled data, and how a module plugs in

```ts
// compiled.ts. NEW, internal. What compile(definition, machine) must produce; round 1 hand-writes it. String ids:
// reading at a glance beats nodes-as-ints, and no measured need says otherwise (discussion 6.2 was 60% on ints).
type At = { readonly definition: string; readonly path: string; readonly placement?: string }  // origin, F6. Never persisted
type Slot<F> = { readonly run: F; readonly at: At }

type Compiled = {
  readonly id: MachineId; readonly codec: { memory: Codec; events: Record<string, Codec> }
  readonly nodes: Readonly<Record<NodeId, Node>>; readonly root: NodeId
  readonly memory: { readonly input: readonly string[]; readonly initial: Slot<(input: unknown) => object> }
  readonly ops: Readonly<Record<OpId, Op>>
  readonly persisted: boolean
  readonly modules: readonly Module<any>[]            // only what its operations imported: F10
  readonly bounds?: Partial<Bounds>
}
type Node = {
  readonly id: NodeId; readonly parent?: NodeId; readonly ancestors: readonly NodeId[]; readonly default?: NodeId
  readonly on: Readonly<Record<EventTag, readonly Alternative[]>>
  readonly schedules: readonly ScheduleSpec[]
  readonly owns: readonly OpId[]                      // for rule 15
}
type Alternative = {
  readonly target: NodeId | "self"; readonly at: At
  readonly tokens: readonly TokenGuard[]              // data: { node } | { op; verb: "idle" | "retryable"; times?; key? }. flow check reads these
  readonly guards: readonly Slot<(g: GuardIn) => true | Denial>[]
  readonly patch?: Slot<(u: UpdateIn) => object>
  readonly members: readonly Member[]
  readonly raises?: readonly unknown[]                // empty in round 1: fragments
}
type Member =
  | { readonly op: OpId; readonly verb: "commit"; readonly input: Slot<(a: AfterIn) => unknown> }
  | { readonly op: OpId; readonly verb: "retry" | "cancel"; readonly key?: Slot<(a: AfterIn) => unknown> }
  | { readonly op: OpId; readonly verb: "lookup"; readonly input: Slot<(a: AfterIn) => unknown> }
type Op = {
  readonly id: OpId; readonly contract: string
  readonly kind: "write" | "read" | (string & {})     // anything else names a module
  readonly key: (input: unknown) => unknown           // Equal-keyed; codec below for persistence
  readonly concurrency: "reject" | "latest" | "serialize" | "cancel"
  readonly timeoutMs?: number                         // NEW: D8
  readonly commit: (input: unknown, ctx: CommitCtx) => Effect.Effect<unknown, unknown, never>   // R already provided
  readonly outcomes: {
    readonly success?: Mapped; readonly failure: Readonly<Record<string, Mapped>>   // tag to event; includes NotSent
    readonly unknown?: Mapped | Readonly<Record<string, Mapped>>
  }
  readonly codec: { input: Codec; output: Codec; key: Codec; errors: Codec }
  readonly domain?: unknown                           // opaque to core; entities module reads it
}
type Mapped = { readonly event: EventTag; readonly from?: Slot<(v: unknown) => object> }
type ScheduleSpec = {
  readonly id: string; readonly send: EventTag
  readonly schedule: { readonly ms: number } | Slot<(a: AfterIn) => number> | { readonly stepper: StepperId }
  readonly armOn: readonly (EventTag | "entry")[]; readonly disarmOn: readonly EventTag[]
  readonly keys?: Slot<(a: AfterIn) => readonly unknown[]>
}
type Bounds = { followUps: number; drainMs: number; storageMs: number; repairMs: number; releaseMs: number; disposeMs: number; unboundHoldYieldMs: number }
```

### The module seam (D9)

The core imports no module. A contract constructor imports its module, so an app with no `stream()` ships none of T1. `Compiled.modules` is the union, and the Runtime keeps `modules` sorted by a fixed `rank`, so order is data.

```ts
type Module<S> = {
  readonly id: ModuleId; readonly rank: number
  init(env: Env): S
  // N: applied-now
  onSettled?(s: S, x: { attempt: Attempt; op: Op; ending: AttemptEnding }, cx: Cx): Result<S>
  onInput?(s: S, input: unknown, cx: Cx): Result<S>
  // A1: admission, kept on Denied and Unhandled, not on InvalidTurn
  admitSoft?(s: S, item: Mail, cx: Cx): Result<S>
  // P6: a member whose op this module claims. Returns a verdict, as a lane cell does
  claims?(op: Op): boolean
  onMember?(s: S, m: MemberIn, cx: Cx): Result<S> & { readonly verdict: "ok" | { notSent: string } }
  // P7, C: reconcile and end of turn
  desired?(s: S, after: AfterView, cx: Cx): Result<S>
  onCommit?(s: S, c: CommitView, cx: Cx): Result<S>
  // D: may this Attempt go? Everything a module adds to eligibility is here
  blocksInvoke?(s: S, a: Attempt, cx: Cx): false | { readonly on: string }
  // Reads, capture, restore
  read?(s: S, ref: unknown): unknown
  capture?(s: S, dirty: unknown): ReadonlyArray<{ key: string; value: Encodable }>
  restore?(records: ReadonlyMap<string, unknown>, cx: Cx): S
}
type Result<S> = { readonly s: S; readonly commands?: readonly Command[]; readonly mail?: readonly Mail[]; readonly visible?: boolean; readonly dirty?: readonly LaneKey[] }
```

`step` folds hooks by rank. A hook returns a new slice, never touches `world` directly, and reads others only through `Cx.read(moduleId, ref)`. Driver half: `Module.driver?: (cmd, input) => void`, imported beside it. That keeps the seam the same size for three modules I checked against it on paper: entities (claims domain writes, `blocksInvoke` = queue head), streams (`claims` placement ops, `admitSoft` = bookmark, `onCommit` = `filled`), persistence (`blocksInvoke` = ack, `capture`). Context and SSR not checked.

### Entities behind a store seam (owner's scope, D16)

```ts
// entities/seam.ts. NEW. `entities` module implements it twice.
type Store<S> = {
  startWrite(s: S, w: { attempt: Attempt; prediction?: unknown; records: readonly RecordRef[] }): { s: S; verdict: "ok" | "overloaded"; visible: boolean }
  mayInvoke(s: S, attempt: AttemptId): boolean
  endWrite(s: S, attempt: AttemptId, ending: AttemptEnding): { s: S; repairs: readonly RecordRef[] }
  release(s: S, attempt: AttemptId): S
  read(s: S, ref: RecordRef): unknown
  apply(s: S, push: unknown): S                       // a server push or an engine's change arriving as an input
}
```

| Guarantee | Flow's store | Behind a sync engine (TanStack DB, Zero) |
| --- | --- | --- |
| Prediction and lane row in one publication (rule 28) | yes | **no.** `startWrite` becomes a command; DB's `applyMutations` keeps state in its collection and Replicache's `mutate` is async [read `db/src/transactions.ts:566`, `replicache/src/pending-mutations.ts`]. A later input publishes it: one frame of tear |
| Queue order across actors (rule 29) | mint order | the engine's: Replicache pushes oldest first with a server-checked `lastMutationID` [read `zero-cache/.../mutagen.ts:468-484`]. `mayInvoke` is always true |
| `unknown` and hold (rule 21) | yes, unchanged | yes. Lanes stay Flow's |
| `uncertain` marks (rule 32) | Flow's | engine reports; Zero's `lmidAdvanced` is the evidence a mutation applied [read `mutation-tracker.ts:282`]. Mapped, not equal |
| Repair, contested | Flow's | none: the engine rebases over pulls |
| Inspection reads store rows | yes | adapter only |

An engine-backed app gets write workflows, holds, retries and reload safety, and loses the atomic cut and record queue. **Stated, not hidden.** Not built until round 6; the seam is judged against `db` there.

### Size: per entry point (owner's scope)

Own code only, minified and gzipped; Effect measured apart by `bun build` in the suite's `SIZE` row. Discussion 8.4 puts Effect at 34 KB gz for the whole import set; a machine with no streams or schema-based persistence should do better and must report it.

| Entry point | Includes | Budget | Stop |
| --- | --- | --- | --- |
| `flow-state/core` | step, turn, lanes, reads, timers, driver | 14 KB | 18 KB |
| + `flow-state/persistence` | codec, capture, restore | +3 KB | +5 KB |
| + `flow-state/entities` | store, queue, predictions | +8 KB | +11 KB |
| + `flow-state/streams` | T1-T5, T8, T6 in driver | +7 KB | +10 KB |
| + `flow-state/fragments` | incarnations, parking, adoption | +6 KB | +9 KB |
| `flow-state/stories` | never in app bundles | no budget for apps | |

[estimate] at about 6 bytes gz per line (discussion 8.4). Check: `import { machine } from "flow-state/core"` must not include T1 strings, asserted by grep on the bundle.

---

## 8. What the spikes hold up to on re-reading and re-running

All three re-ran one at a time and printed what their `out.txt` says, timing aside. S1: 130 s, **1.65 GB peak RSS**. S5: 0.7 s. S2: **19 s** here.

| Claim | Verdict |
| --- | --- |
| S1: like-button deadlock real; `a` and `f` have cycles; review's fix is not free of them; `d` is clean | **Holds.** Recomputed. I add a proof by order (L2) |
| S1: peak 1.1 GB | **Wrong:** 1.65 GB. Still under 2 GB; the next sweep must watch it |
| S1 finding 4: `b1` has 64 cycles | **Wrong:** table and output say 32 |
| S1: sweep B complete for `a` and `d` | **Partly:** `a` under reading `y` hit the cap |
| S1 table: `d` hold-x 868 "more" than `a` | **Wrong in count** (`a` 874). True per state (2.6% vs 0.75%), which is what was meant |
| S1: "d keeps last intent, 0 lost" | **Only without release and late landing.** L1's check skips any trace holding a released Attempt, and a request cannot land late. I ran `d` with late landing added: retry-only 0 inversions; with `cancel` 10,146 inversion states; with a hold timeout 5,640 [ran, scratch copy, 3 commits, complete]. So the hold is what protects, as 2.7.14 says, and every release re-opens the stated limit |
| S1: timeout table, hold row "no" | **Conclusion for cycles stands, the table cannot show more:** its stuck metric excludes timeout moves by construction, so its counts cannot fall. Counting them: under `d`, a hold timeout frees **all** holds, 0 stuck [ran]. The table also never ran on `d`, the candidate |
| S2: A loses completions; B-E do not | **Holds** |
| S2: "dispose never finished" column is exactly the `uninterruptible-hang+inner` runs | **Wrong.** 60 = inner 30 + outer 30 [output, by arithmetic]. The outer timer completes the Attempt, and disposal still hangs in every shape. D6 |
| S2: C is best, 6 wrong against 30 | **Misleading.** C's 24 extra passes are interrupts landing before the fiber entered its uninterruptible region: timing, not correctness |
| S2: recommend C | **Overturned, B.** C needs a setup fiber plus `pollUnsafe` to fork from plain JS, and throws if that does not finish; what it buys is `Scope` ownership, the exact thing that hangs. With fences the Runtime tracks wires itself. B also costs a third [ran, noisy] |
| S2: latch in the driver | **Moved** to the core (D5) |
| S2: about 3 min | 19 s here. Irrelevant, noted |
| S5: A and B-sync match | **Holds on what ran.** Coverage is thin: 0 `Ended` in seeded runs, `stalls`, `Defect`, page failure, predecessor wait all absent |
| S5: `B-rand7` shows scheduling order does not matter | **Vacuous.** One fiber per session and one session: the ready set has about one task, nothing to shuffle |
| S5: `B-queued3` shows a fiber must write the world synchronously | **Weak.** It routes `settle` around the delivery queue, which T3 forbids. It shows that breaking T3 breaks T3. RESULTS itself says the blocking variant was not built |
| S5: "T1 as data" | **Not tested.** `stepA` is a procedural switch over plain state. What it shows: T1's *state* can live in a pure step at no cost in lines. I keep state-as-data with labelled cells in code, and reserve interpreted tables for uniform ones (D17) |
| S5: T2 row 6 reading | **Holds:** 2.11.10 says "With it, nothing extra". Written below. S5 did not model `stalls` |

Verdict on A vs fibers stands, for review 2.7's sharper reason: the bookmark, not these runs. If round 4 cuts `fills`, reopen.

---

## 9. Findings and what happened to them

| Finding | Outcome |
| --- | --- |
| **S1 record-queue deadlock** | Resolved: D3. Held entry keeps its place. Cross-actor waits grow, by design; bound on the abandoned case D15 |
| **S1 last intent across actors** | Resolved inside a Runtime except after a release, which stays OD20 F1's limit. Contested responses shrink to released cases |
| **S2 one completion** | Shape B, fence in core, D5, D6 |
| **S2 outer timer for disposal** | Core timer; dispose never awaits unbounded |
| **S2 timed-out writes as `unknown`** | D8. Late landing is safe under a retained hold [ran] |
| **S5 T1** | State in the step, code with labels, D17; handle in driver |
| **S5 T2 row 6** | "`stalls ≥ 3`: `notice(Lost)`, `Live`, no repair. Else `C`: `Repairing` from `p`, no notice. Else `notice(Unproven)`, `Live`" |
| **F1** | D3 |
| **F2** | D6 |
| **F3.1 admission** | A0/A1 split |
| **F3.2 `resetOn` re-check** | In P7; a throw is `InvalidTurn` (D11) |
| **F3.3 `check` vs prediction** | Dry prediction; I10 narrowed as in 4.2 |
| **F4 `Schedule`** | Stepper in `env`, first step at arm, next at firing, carried on the input. Rejected turn drops it. Round 1 needs only durations and functions |
| **F5 fair fight, reification** | Criterion adopted, D7. B\* is what this design is at the edge |
| **F6 origins** | `Slot.at` everywhere; an issue prints origin plus input; input log and replay in round 1 |
| **F7 conformance survives** | Section 12, stable interface. World invariants are disposable and per-round |
| **F8 storage** | Per-record keys; actor and lane records are separate writes; lane record is truth; `boot` removes the id problem; whole-scope write per click avoided. KV has no multi-key transaction [review read], so no cross-record atomicity is claimed. Persistence O3 amended narrowly. S3 still owed |
| **F9 estimates** | Section 13 budgets by part; a stop is a cut, not a soft line; driver trigger: over 35% of core plus driver, or a second lost completion |
| **F10 tree-shaking** | Module seam, per-entry budgets |
| **Input log** | Round 1, used by the suite on every run |
| **Turn order gap** | D1 |

### Decisions, each proposed

| # | Decision |
| --- | --- |
| D1 | One Runtime FIFO; follow-ups run next |
| D2 | `send` runs synchronously when idle (Q3 A); during a budget yield it queues |
| D3 | Queue order is mint order; joined at commit; a re-send never rejoins; an entry leaves only when resolved or released. `latest` replacement takes a new mint |
| D4 | Eligibility is recomputed after every step over dirty lanes |
| D5 | Generations on commands and inputs; core drops stale; exactly-once in core, at-least-once in driver |
| D6 | Driver: `runFork` + `addObserver`, each command isolated, disposal bounded and never awaits a scope |
| D7 | Reification criterion |
| D8 | `timeout` on operations, per send. Write: `unknown { TimedOut }` at the timer, then interrupt. Read: `failure { TimedOut }`. Absent means none. Timer starts at invocation, not at commit, so queue and ack do not count. A timeout never moves a waiting commit: S1 shows that drops the latest write |
| D9 | Module seam |
| D10 | A throw inside our own step aborts it; the value stays; issue; Runtime stays alive. In Stories it fails the run |
| D11 | A throw in `resetOn`, `input` or prediction is `InvalidTurn`, in `check` too (Q14 A) |
| D12 | Forced repair bounded at 30 s: queue released, mark stays, evidence |
| D13 | Follow-up bound; drain budget; `TurnStorm` in test mode |
| D14 | Storage bounded at 10 s: refused, as the table's existing row |
| D15 | An **unbound** hold with a waiter behind it yields after 5 min: `Released`, mark kept, parked `unknown { Abandoned }` for any later incarnation, evidence. Reason: under D3 a persisted unbound hold could otherwise block a record across reloads forever. Cost: re-opens late landing for this case only [ran: 5,640 inversion states with any hold release]. A bound lane never yields, so `pay` is untouched. Remedy stays a version precondition |
| D16 | Entities stay optional, in a module, behind `Store`; weaker guarantees stated |
| D17 | Interpreted table only where cells are uniform: lane, store, releasing. T1 and T3 are code with cell labels. So mutation of T1 is by a seeded fault list rather than free |
| D18 | **Cut `basedOn` rebase.** 0 uses across both apps [grep]; requires core to know version semantics. `basedOn` remains an ordinary input field. Rebase-less, two writes on one version may 412: the author's error path |
| D19 | **Cut `allow`.** 3 corpus uses (nudge, presence, roster), written for coverage. `presence` fits `cancel`; a nudge is `reject` with its own key. Re-raise only if round 6's desk conversion cannot write them. `cancel` stays, later: Checkout's `reserveShipping` is a real use |
| D20 | **Cut key-equality migration.** Goes to `orphaned` (2.9.4) |
| D21 | **Cut local-identity adoption.** A local actor's lanes are not adopted. On dispose a local lane's hold releases with a mark; a sent one finishes to evidence. Needed by D3: an unowned local hold would block a record |
| D22 | Key-less members name the ending's own Attempt only (rule 43's second clause cut) |
| D23 | Reads have no hold and no queue; replace-latest; a read's generation drops superseded answers |
| D24 | Fragments keep operations for now; 9.6's cut stays first in line if round 3 misses its budget |

### Rules broken, changed or cut

The runner reads this block. A test citing an id here must also cite the replacing decision.

```decisions-changed
rule:25      cut       D8     timeouts return as an operation property
rule:29      changed   D3     cross-actor wait lasts for any hold, not only a W entry at the head
rule:30      changed   D3,D12 unknown's queue release moves from "after repair" to "resolved or released"; repair is bounded
rule:31      changed   D3     a retry never rejoins
rule:43      changed   D22    key-less names the own Attempt only
rule:61      changed   D1     order is now stated; K untouched
sec:2.8.6.E7 changed   D3     "behind any newer write" removed; contested only after a release
sec:2.8.6.basedOn cut  D18
OD:5         changed   D15    one quiet-looking release, unbound and blocking only, with evidence
OD:6         changed   D15
OD:8         changed   D22
OD:19.Q32    cut       D18
OD:20        changed   D21    local adoption cut
OD:20.F9     cut       D19    allow
sec:2.9.4    changed   D20
sec:2.10.17.5 changed  D1
sec:2.7.1.Timeout changed D8  Flow has one now
T2:6         changed   D-T26  written out; no notice with catchUp
Persistence:O3 changed F8     per-record writes, no whole-scope atomicity
Machines:O5  changed   F4     Effect Schedule stepped by env
```

`D-T26` is this document's T2 row 6 text in the table above.

**Unchanged and good to go on:** rule 16, 17, 18, 19, 21's table, 22, 27, 28, 44, 53, 54. `.resumable()`, T5, T7, `serialize` keep their design, later rounds.

### Prior art taken (read only)

| Taken | From |
| --- | --- |
| A retry stays in place; the first unresolved blocks | `codebases/tanstack-query/packages/query-core/src/mutationCache.ts:123-180` (`canRun`); `codebases/db/packages/offline-transactions/src/executor/KeyScheduler.ts` (FIFO by `createdAt`, head blocks); `codebases/mono/packages/replicache/src/pending-mutations.ts` (oldest first, ids kept). Three independent systems picked D3's shape |
| Mint counter separate from a random id | `codebases/db/packages/db/src/transactions.ts:28,78` (`sequenceNumber`); DB's `createdAt` is a wall clock, not taken |
| Server-checked order and "already applied" as evidence | `codebases/mono/packages/zero-cache/src/services/mutagen/mutagen.ts:468-484`; `zero-client/src/client/mutation-tracker.ts:282-293` |
| Late result dropped by the owner, not the work | `tanstack-query/.../retryer.ts`, `xstate/packages/core/src/actors/promise.ts`, per S2; generalised to D5 |
| Handle outside the snapshot | `xstate/.../actors/observable.ts`, per S5 |
| Drain and defer after the work | `xstate/packages/core/src/createActor.ts:280-299` (`_deferred`); `alien-signals/src/index.ts:106-112,316` (batch depth, then flush); `pump`'s notify after the loop |
| `addObserver` fires at once if exited; `runFork` | `codebases/effect-v4/packages/effect/src/internal/effect.ts:560`; `Schedule.ts:369` (`toStep`) for F4 |
| Not taken: DB retries by a time-based `nextAttemptAt` inside the scheduler | Flow has no automatic retry; a re-send is the machine's |

---

## 10. Rounds

Each round starts with empty runtime code, carries only `conformance/`, and is built by writing its scenarios first (section 12). Stop line: Highs per round not falling by round 4 means cut design, per discussion 9.6. **Each stop is shippable as its column says.**

| Round | Adds | Must run (scenario ids in SCENARIOS.md) | Could ship as |
| --- | --- | --- | --- |
| **1** | sequencer, driver, one write lane kind, thin reads, timers, unknown, timeout, reload; Pay, hand-written | `PAY-*`, `SEARCH-PAY` | nothing yet: a proof |
| **2** | two+ actors, `latest`, entities module, mint-order queue, predictions, repair, D1, D12; **S4 on this runtime in Chromium** | `ORDER-*`, `STORE-*`, `Cart`, `SEARCH-LIKE`, Refunds; **`DRV-*` under a shuffling scheduler** | single-feature apps with server data |
| **3** | fragments: traits, `resetOn`, `.each`, subject path, parking, adoption, rebind, releasing, subroutine, D15 | `FRAG-*`, Pay with its real 3-D Secure subroutine and order summary, desk Comments | a real app without streams |
| **4** | streams module: T1-T4, T8, T9, bookmark. **S15's trigger assessed here** | `STREAM-*`, desk feed, presence, assistant; `SEARCH-SESSION` | add live data |
| **5** | `serialize`, `cancel`, T5, T7, resources and cache, answers, context, persistence on IndexedDB with **S3**, `.resumable()` decision | `POLICY-*`, `CACHE-*`, `PERSIST-*`, property tests | whole runtime surface |
| **6** | typed front end and `flow check` replace hand data; compile produces the format; convert Checkout and one desk feature end to end; engine seam against `db`; bundle budgets enforced | all carried, through real definitions; `ENGINE-*`, `SIZE-*` | library, beta |
| **7** | Stories executor as designed, SSR, lazy, React, real browsers including Safari and Firefox | Checkout's and desk's own Stories, `BROWSER-*`, `HOSTILE-*` at full size | v1 |

[bet] 15% finishing in fewer rounds; rounds may repeat. A round ends when its questions are answered in writing, even if some tests are red, each red being a recorded finding.

---

## 11. Round 1, exactly

**Goal.** A real runtime a builder could continue from, running Checkout's `pay` flow from hand-written compiled data, under its suite.

**Order.** (1) Write `conformance/` runner, `Harness` types, the Pay fixture and the 14 scenarios plus one search. (2) Run: all red, record it. (3) Build until green. (4) Reviewer (Opus) checks each test against its citation and names anything faked.

**In.**

- `step`, all strata that have content; `pump`, `input`, `exec`; D1, D4, D5, D6, D10, D13.
- One write lane kind: `reject` only, cells from 2.7.13 as a data table: commit, retry, cancel, idle, retryable, invoked, storage refused, success, failure, unknown, interrupt, restore, Runtime disposal.
- Timers: Duration and function; `armOn`, `Flow.entry`; no `keys`.
- Thin read lane (D23) for `intent` and `order`: no cache, no resources.
- `timeout` (D8). Persistence as a module against an in-memory `KeyValueStore`-shaped fake that can hold, refuse, or never answer. Boot id.
- `Slot.at`, issues, evidence naming cells, input log.

**The Pay fixture** (`conformance/fixtures/pay.compiled.ts`), flattened by hand from `references/checkout/features/Pay/pay.{contracts,definition,machine}.ts`. Differences, each a recorded gap:

- `traits.summary.callbacks.onPay` becomes external event `PayRequested { paymentMethodId }`, with the same two alternatives. `mayPay` and summary guards gone.
- `CHALLENGE` absent: `requires_action` falls through to the `Confirmed → CARD` alternative. 3-D Secure returns in round 3.
- `ADDRESS` absent; `Start` always takes the signed-in alternative; context `savedAddress` is a constant in the fixture.
- `CartDomain`, `O.cart.subscribe`, `O.place`'s `writes` absent. `Pay.void` and `placeOrder` kept: three write lanes of one kind.
- `pay` gets `timeoutMs: 60000` (D8, not in the converted code).
- `commit` fields call a `ShopApi`-shaped fake with the `unknownWhenLost` behaviour, through Effect. **Real Effect, not stubs.**

**Must not include.** Fragments, incarnations, `resetOn`, `.each`, parking outside reload, record queues, entities, predictions, streams, `latest`, `serialize`, `cancel`, `allow`, keyed schedules, Effect `Schedule`, resources, cache, context, SSR, React, a definition layer, type-level work, the Story DSL, BFS over world values, unit tests of internals, a persistent-map library unless measured, optimisation.

**Not done means failing.** Any of: a test seam in the core; an ending injected rather than coming from the fake through a fiber; `L3` asserted only at the end; a world-shaped assertion in a scenario.

**Budget:** table below. If core passes 1,600 lines for this scope, stop and report: the design is bigger than estimated.

**Questions it must answer in writing.** Is the `Harness` enough to say every expected result? Does the fence replace all latches? Does a pure step stay tidy with real Effect at its edge? Does the compiled format need a field nothing can produce? How long does `SEARCH-PAY` reach under 2 GB? What does `step` cost per turn?

---

## 12. The executable suite

**Test-first at acceptance level only.** No unit tests of internals during prototype rounds. They would die with each rewrite and raise the cost of throwing code away.

### Interface (stable; internals invisible)

```ts
// conformance/harness.ts. NEW. This is the whole contract between suite and any runtime.
type Harness = {
  start(cfg: { machines: Fixture[]; seed: number; storage?: StorageScript }): void
  do(step: Step): void                                  // runs, then settles: returns when nothing is runnable at this instant
  read: Reads
}
type Step =
  | { ensure: ActorRef; input?: unknown } | { dispose: ActorRef }
  | { send: ActorRef; event: string; payload?: unknown }
  | { advance: number }                                 // virtual clock. Fires due timers in order, settling between
  | { answer: RequestMatch; with: Answer }              // answers the oldest held request that matches
  | { reload: true }                                    // process dies; only storage survives; boots again
  | { storage: "ack" | "refuse" | "hang"; match?: string }
  | { fault: Fault }                                    // section "fault" below
  | { disposeRuntime: true }
type Answer = { ok: unknown } | { fail: { tag: string; [k: string]: unknown } } | { lost: true } | { lostButLanded: unknown }
            | { die: string } | { never: true } | { landLate: true }
type Fault = { interruptAt: "beforeStart" | number } | { throwIn: SlotPath; times?: number }
           | { reorderAnswers: readonly number[] } | { wake: { after: number } } | { duplicateCompletion: RequestMatch }
           | { schedulerShuffle: number }
type Reads = {
  state(a: ActorRef): string | undefined; memory(a: ActorRef): unknown
  row(a: ActorRef, op: string, key?: unknown): { pending: boolean; uncertain: boolean; waiting: boolean; retryCount: number } | undefined
  requests(): ReadonlyArray<{ op: string; input: unknown; idempotencyKey?: string; at: number; answered: boolean }>
  truth(): World0                                       // what the fake server believes
  frames(): ReadonlyArray<{ cause: string; at: number; seq: number }>
  issues(): ReadonlyArray<{ code: string; origin?: string; input?: unknown }>
  evidence(kind?: string): ReadonlyArray<Record<string, unknown>>     // cell names are the only internal vocabulary, from the design
  stored(): ReadonlyMap<string, unknown>; quiet(): { idle: boolean; waits: readonly string[] }
  replay(): { same: boolean; firstDiff?: unknown }      // re-runs the input log and compares publications
}
```

The adapter of each runtime implements it, about 100 lines. Fixtures are compiled data; a format change is a recorded finding and an edit in one place. Search is **stateless**: replays scripts from `start`, so it needs nothing about the world and survives rewrites (cost below). World-shaped invariants are allowed only in a round's own folder, are disposable, and are not the suite.

### Where, and how it stays out of the gate

```text
packages/flow-state-v3/prototypes/
  SCENARIOS.md                      source of truth for ids, kinds, citations
  conformance/
    main.ts                         bun packages/flow-state-v3/prototypes/conformance/main.ts --round 1 --runtime ../r1/adapter.ts
    harness.ts  report.ts  fixtures/  scenarios/*.scenario.ts  search/*.search.ts  expected-changes.log
  r1/                               thrown away next round; conformance/ is not
```

Checked: `vite.config.ts` has `test.include: ["packages/**/*.test.ts"]` [read, line 291], and `check` is `vp check packages/flow-state-rewrite` [read `package.json`]. So **no file in `conformance/` may be named `*.test.ts`**; `*.scenario.ts` and a `main.ts` under Bun run outside `vp test`, with no new dependency, and red never touches the repo's gate. README's rule 1 already says `main.ts`. I did not run `nub run verify`. `tsconfig` root references per CONVERSION.md's reading, not re-checked.

### Round order, and changing an expectation

1. Write that round's scenarios from their citations, not from code. The expected result is worked out by hand from the cited text.
2. Run. Each must fail for the stated reason, or say why it is already green. Save the output.
3. Build until green. Fit the code, not the test.
4. **An expected result changes only as a recorded finding.** Rules are suggestions and a test can encode a wrong rule, so this is allowed, in one way: a line in `conformance/expected-changes.log` with scenario id, old, new, reason, and the decision it changes, and a row in that round's `RESULTS.md`. A diff touching expectations with no log line fails the run.

Scenarios carry `kind`: `example`, `bounded` (exhaustive up to a stated cap; reports whether it completed) or `fault`. A truncated search reports `inconclusive`, never pass.

### Citations

Every scenario has `cites`, machine-readable: `rule:28`, `cell:lane.retry.Held`, `T1:Live.value`, `T2:6`, `OD:19`, `S15`, `sec:2.8.6.E7`, `D3`, `L2`. A scenario from outside the design still cites what it exercises, or says `no-decision`, **which is itself a finding** printed on every run. The runner prints two reports:

- **Decisions with no test:** rules 1-72 and N1-N3 (parsed from `machine-design.md` 2.4), every cell of the lane table, T1-T9 rows, and D1-D24, minus what scenarios of rounds so far cite. Grouped: not in this round's scope, or owed.
- **Tests whose decision was changed or broken:** any scenario citing an id in `decisions-changed` above without citing its replacement. Those are tests that encode an old rule.

Reviewers check each test against the text it cites, and the summary lists any test whose citation does not support its expectation.

### Expected cost per round [estimate]

| Item | Round 1 | Later rounds, each |
| --- | --- | --- |
| Runner, reports, parsing citations | 200 lines, once | small |
| `Harness` adapter | 100 lines | 100 lines, rewritten |
| Scenario scripts | 14 + 1 search: 400 lines | 10-25 new: 300-700 lines |
| Fixtures | 300 lines | +100-300, zero after round 6 |
| Wall time | under 1 min; search 30 s to 3 min | full suite under 5 min, one process |
| Tokens | about 20-30% of the round | about 15-25% |

Stateless search cost: depth 8 over about 9 actions at about 10 steps per script is under 200k replays at cap. Rewriting nothing but the adapter is what pays for it; if a round must edit more than 10% of old scenarios to keep them, the interface has failed and that is the round's top finding. Round 1's interface is unproven, which is why its suite is small.

---

## 13. Budgets per part

Lines of TypeScript without tests. Round 1 column is a target; "whole" low and stop are for all seven rounds at this document's cuts. [estimate] Review F9 warned these flatter; anchor against S5's 176 and the spike's 481 after round 1 and correct.

| Part | Round 1 | Whole | Stop |
| --- | --- | --- | --- |
| Step, loop, fence, strata A-O | 500 | 1,200 | 1,600 |
| Lane table and cells | 250 | 500 | 700 |
| Reads, timers, reconcile | 200 | 500 | 700 |
| Incarnations, parking, adoption | 0 | 1,000 | 1,400 |
| Entities module | 0 | 1,200 | 1,600 |
| Streams module, without driver | 0 | 900 | 1,200 |
| Persistence module | 150 | 400 | 600 |
| Context, resources, cache | 0 | 800 | 1,100 |
| Publication, rows, Inspection, evidence | 100 | 500 | 700 |
| Driver, including T6 and module halves | 300 | 1,000 | 1,500 |
| **Core + driver** | **1,500** | **8,000** | **10,000** |
| Suite | 700 | 3,000 | no stop |
| Typed front end, `flow check`, Stories | 0 | measured at round 6 | |

Trigger on the driver: over 35% of core plus driver, or more than one lost completion after round 2. A wait needing Effect-like combinators in the core twice means D7 is wrong for that wait: move it out.

---

## 14. What this does not verify

No runtime exists; nothing above has run except where marked. The stratification, module seam, L2's reach and turn order are by reasoning. S1's late-landing and hold-timeout numbers are my own patch to a scratch copy of its throwaway model, not committed, 3 commits, one reading; 4-commit not run. S3 and S4 unrun, so per-click persistence cost and phone performance are unknown. No browser, no real `fetch`, no real IndexedDB. No typing claim is tested: `Fragment.O`, key-less members and `R` stay a separate risk, B13. Parts of 2.4's rules were read through discussion's table and headings rather than in full (1, 9, 44-60 by heading and 2.9.3's table); 2.9.6, 2.10.4-2.10.5 and most of 2.11.12 not read. Clones: read the lines cited, plus test titles only; `xstate`, `solid`, `alien-signals` gave ordering context and no decision here. Bounds' numbers (5 min, 30 s, 10 s, 8 ms) are placeholders. Percentages are judgement.
