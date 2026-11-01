# What the Flow State runtime prototype should be

Status: **everything here is proposed.** Nothing is decided until you say so. Written 2026-11-01 against `machine-fragments/machine-design.md` as it stood that evening; another agent was editing its samples, so I cite sections and rule numbers, not line numbers.

How to read the evidence marks:

- **[measured]**: I ran it tonight (Effect 4.0.5, Node 24, this MacBook, esbuild minify, gzip -9).
- **[read]**: I read it in this repo.
- **[verified]**: I checked an outside claim against a source, listed at the end.
- **[memory]**: from memory, not checked. Do not lean on it without checking.
- **[estimate]** and **[bet]**: my judgement.

No sketch here has been compiled.

---

## 1. Verdict

**Build one deterministic state machine per Runtime, not one per actor.** A single function takes the whole Runtime's state and one input, and returns the new state, what to publish and what to do:

```ts
step(world, input, now, ids) => { world, publications, commands, evidence }   // NEW, all internal
```

A thin Effect driver runs the commands and feeds completions back in as inputs. Actors are records inside `world`. Their mailboxes are logical queues inside `world`. There is one run loop.

**The unit of work is the atomic transition of the world, which I will call a step. The turn is not the unit. It is one kind of step, and not even an atomic one.** The floated hypothesis `step(actorState, input)` is right in shape and wrong in signature, and the difference matters a great deal. A turn reads and writes things no actor owns: rule 28 joins record queues in the same publication as the memory patch; rule 35 declines based on queues other actors share; rule 21's lanes are the Runtime's. Rule 27 publishes with no turn at all. And 2.5 commits step 1 even when steps 2 to 6 reject, so one "turn" is two transactions. Section 3.5 goes through each case.

What I would build, beyond that one sentence:

| Choice | Pick | Confidence |
| --- | --- | --- |
| One sequencer per Runtime, world-shaped state | yes | high, about 80% |
| Pure step as the prototype's form (not mutation with a journal) | yes, may become mutable inside later | medium, about 70% |
| The write lane, session and store-effect tables stored as data | yes | high, about 80% |
| User closures kept as closures, no code generation | yes | high, about 85% |
| Int ids in the compiled form | only for nodes, and for reasons of clarity not speed | medium, about 60% |
| Effect fibers per actor | no | high, but **not on performance grounds**: they measured cheap |
| 6,500 lines for the runtime | I do not believe it for the whole design | about 20% as written, about 60% with the cuts in 5.5 |

The main risk in this recommendation: it moves the concurrency bugs into the driver, and the rules say almost nothing about the driver (only rule 25 is primarily about it). A pure core can be proven beautifully correct about a world that the driver is quietly lying to.

The largest thing I found is not about architecture. **The 72 rules are a delta, not the system.** They amend `.plan` files that still hold Runtime O5's context waves, Operations O2's resources, EntityDomains O1's store and answers, and Persistence O3's captures, none of which the rules restate. Part of "there's just a lot" is that there is more than the design file shows. Budget accordingly.

---

## 2. What this thing formally is

**My answer: a globally asynchronous, locally synchronous system. Each actor reacts in one synchronous instant, in the sense of the synchronous languages. Between instants, actors and the world communicate asynchronously through queues. All of it runs in shared memory under one sequencer.** The word "actor" in the design is misleading, and I will show why. GALS is an existing term for this [memory].

I go through the models you listed. Each entry says what fits, where it fails, and which decision it changes. Models that change no decision get one line.

### Fits, and changes decisions

**Synchronous languages (Esterel, Lustre).** This is the closest fit to the turn, and I think it has not been named in the design. In 2.5 a transition, its raises, notifies, exits, resets and leaves all happen in one instant. Parts do not see each other's writes. There is one state changer and memory keys must be disjoint (rule 12, 2.5 step 5). That is single-assignment within an instant.

Rule 22's "before for decisions, after for effects" is the discipline Lustre's `pre` gives you [memory]: decisions read the previous instant, so no decision can depend on itself. Esterel's hard problem is causality cycles, a signal whose presence depends on itself; a program is valid only if a write-before-read order exists that neither deadlocks nor allows nondeterminism [verified]. The design rejects that whole class by decree: anything that feeds a decision reads before.

The pending reset (rule 1) is the textbook way out of the one cycle left. A part writes a key a `resetOn` watches; that cannot be seen in this instant, so it is delayed to the next. "The lag is exactly one snapshot" is a unit delay.

*What this changes.* (a) The turn is not a loop to a fixpoint; it is a walk followed by a merge. No microsteps, no iteration. (b) Evaluation inside a turn is a stratification, and it should be written as one (3.3). (c) Static checks of rule 12 are the analogue of constructiveness analysis, which is why "pruning reads only state tokens" is a sound restriction rather than a weakness. *Where it fails.* No reaction to absence, no dataflow clocks, no bounded-time guarantee, since closures run inside the instant.

**Statecharts with run-to-completion, and where they differ.** Hierarchy, leaf-up handler search and exit-deepest, enter-outermost order are statecharts. But SCXML's macrostep is a series of microsteps: raised events go to an internal queue and are drained one microstep at a time, each seeing the last one's effects, and only then is an external event taken [verified]. **Your turn is not that.** Raises are resolved in one walk over one before-state, and only one state change is allowed. So do not reach for an SCXML interpreter or XState's algorithm as a base; it will fight rule 22. SCXML's conflict rule (descendant source wins, then document order) is also not yours: you refuse (`InvalidTurn`).

What SCXML does share is that `<invoke>` runs after the macrostep completes [verified], which is your "invoked after the turn, whatever its outcome".

**Erlang `gen_statem`.** The real prior art for three mechanisms. `next_event` inserts events before anything already queued, and the docs recommend the type `internal` for them [verified]: that is your pending reset and adoption deliveries at the head of the mailbox. State-enter calls run before any event is delivered to the new state and cannot change state [verified]: compare `whenAbandoned`, which cannot target. Its zero-time timeout is enqueued rather than started as a timer, so it runs before external events not yet received but after those queued [verified]: compare your 0 ms `Flow.entry` schedule.

*What it changes.* Head insertion is a known, safe primitive; keep it as one operation on a mailbox. Also, `gen_statem` shows what you chose not to do: `postpone` retries an event after a state change [verified], while you park endings on a lane and hand them to an incarnation. That is more machinery, and it is justified only because lanes outlive actors.

*Where it fails.* A `gen_statem` is shared-nothing.

**Sans-IO cores, and The Elm Architecture.** A sans-IO library has no I/O and no flow control; synchronous functions in, results out, and the caller moves the bytes [verified]. TEA's `update : msg -> model -> (model, Cmd msg)` is the same idea for applications [memory], and it is your hypothesis almost exactly. TEA gives two things I would take:

1. **One global model and one update.** Elm has no per-component update loop. That is the shape your atomic-cut requirement needs.
2. **`subscriptions : model -> Sub`** [memory]. Long-running work is a function of state, and the runtime diffs. Your `activities`, `when`, `keys`, `restartOn`, `.each` and `subscribe.each` are all this: after each turn, compute what should exist from after memory and after lanes, diff against what does. **A single reconcile pass replaces per-rule arm and cancel code**, and rule 23's "armed when the key first appears, cancelled when it leaves" becomes a diff, not a procedure.

*Where it fails.* Sans-IO protocols do not call user code. Yours calls closures all through step. Elm's `Cmd` has no cancellation, no ordering across commands, no awaited release and no notion of a call that outlives its owner. Those are exactly your hard cases, and each one becomes a reified wait state (3.5).

**Deterministic simulation (FoundationDB).** Three ingredients, as usually described: single-threaded pseudo-concurrency, simulated implementations of all external communication, and determinism; physical interfaces are replaced by shims and the epoll loop by a time-based one, and time advances only when the ready queue drains [verified, secondary sources only: a slide deck and third-party ports, not FoundationDB's own docs]. Stories are this already: one scheduler, fakes for the world, `advance`, `settle`.

*What it changes.* Two things. Determinism must cover `attempt.id` and jitter, so step takes an id source and a seeded random (Machines O3 already says "seeded test randomness"; open item 12 asks where it comes from; this answers it). And the most valuable fault injection is **adversarial completion order at the driver boundary**, which is where section 7's strategy lives.

*Where it fails.* FoundationDB owns the whole process. You do not own the adapter's promises, which is why rule 61 needs a hop-counting drain and four stated false-pass cases. A pure core cannot remove those.

### Fits partly

**Actors.** Identity, mailbox, one at a time: yes. Shared-nothing: no. Rule 28's atomic actor-and-store publication, rule 27's store-at-settlement, Runtime O4's "every publication is one complete cut", and lanes that outlive actors (rule 44) are all shared-memory transactions. **If you take the actor model seriously you need a lock over the store, and then the concurrency is fake.** That is the argument against architecture B.

**Algebraic effects with handlers.** Commands are operations and the driver is the handler. Swapping handlers looks like how to do Stories. But rule 62 and Runtime C1 say otherwise: fixtures replace services, never the kernel. The swap sits *under* `commit`, at the Layer. And a turn never suspends, so there is no continuation to capture. *What it changes:* the sim driver in section 7 is an internal test tool and must never be how Stories run.

**Event sourcing.** `run.evidence` looks like a log but is derived: state is not a fold of evidence. An input log would be a fold of the world, given the same definitions and closures. *What it changes:* almost nothing for persistence (Persistence O4: restore never replays). It gives a cheap debugging tool: log inputs, replay a bug. Maybe 30 lines. Not now.

**Incremental computation.** Only in two small places: reconcile as a keyed diff, and context waves as glitch-free propagation. Self-adjusting computation machinery [memory] would be overkill. But see 8.3: the old runtimes spent up to 30% of their lines on what is, in a single world, a topological walk.

### Does not fit

**Durable-execution replay (Temporal).** Temporal re-executes workflow code against recorded history, which is why changing the command sequence breaks running workflows and requires patches [verified]. You chose the opposite: state is explicit, restore does not replay (Persistence O4), and parked endings map through *current* `outcomes` at delivery (OD22). You pay for versioning in Schema decode and `orphaned` rather than in determinism. This is a real advantage of your design. Nothing to take, except that "at least once plus an idempotency key" is the same bargain as `attempt.id`.

**React's scheduler.** Interruptible render is not needed: a turn is sync and short. Two practical facts do matter. `useSyncExternalStore` requires immutable cached snapshots [verified], which favours a world of immutable values. And a store mutated during a transition forces the update to blocking [verified], so a stream of `progress` tokens through `useSyncExternalStore` always costs blocking renders: notify React per drain, not per publication. Also, a very long drain should be able to yield to the host; React's work loop is the prior art for that [memory].

---

## 3. The real hard problem

The hard problem is not the turn algorithm. 2.5 is long but mechanical. **The hard problem is that the design's facts live in four places with four different write rules, and one publication must show them consistently.**

### 3.1 What state exists, and who owns it

| State | Owner | Who may write | When visible | Rule |
| --- | --- | --- | --- | --- |
| Active leaf, activation ids | actor | its turn, step 6 | turn's publication | 7, 14 |
| Memory, slices, incarnations, reset values, frozen slices | actor | its turn | turn's publication | 1, 9 |
| Schedules (armed, `dueAt`, per-key) | actor | its turn; a firing is an input | as rows | 23 |
| One-off read lanes | actor or incarnation | turns; Runtime steps | rows | 42, 52 |
| Mailbox, pending resets, adoption queue | actor | anything queues; head insertion | `inspection.work` | 1, 54 |
| **Write lanes** (state, Attempt, `W`, subject, releasing mark, parked endings) | **Runtime** | binding incarnation's turns, **or** Runtime steps | rows, listing | 21, 44, 51, 53, 60 |
| **Store** (records, predictions, record queues, marks, `unconfirmed`, answers) | **Runtime** | starting turn **and** settlement **and** pushes and repairs | store revision | 26–32 |
| **Session** (T1 variables, `buf`, `Q`, `inFlight`) | Runtime, per placement | Runtime steps, no turn | row | 68–70 |
| **Bookmark** | Flow-private partition of the slice | admission (step 1), step 5, end of turn, Runtime `settle` | never by guards; Inspection | 71, T3 |
| `Feed.callback` queue (T6) | **adapter side** | any JS callback, outside everything | never directly | T6 |
| Persistence state (acks, last capture) | Runtime | driver completions | Inspection | 38, 46 |
| Commit fiber, session fiber, scopes, sleeps, real `AbortController` | **Effect** | Effect | never | 24, 25 |
| Evidence log, `seq` | Runtime | every step | records | 64 |
| Server truth, wire | the world | fakes | checkpoint reads | 62 |

Three things stand out.

**The bookmark has four writers** and writes through Denied turns (T3). It is the most irregular piece of state in the system. Remember that when you get to 5.4.

**The driver's world has real facts the core can only believe.** "On the wire" is a belief. Whether a request was actually issued is not observable; 2.7.2 says so plainly.

**T6 cannot be inside any step.** An `emit` runs on a WebSocket callback, not in a fiber or a turn. So the claim "all state is in the world" is false, and any architecture must say which state stays out. I would keep T6, scopes, fibers and real sleeps out, and nothing else.

### 3.2 When things are observable

There is one observation point: **a publication**. It is a cut of memory, lane rows and store revision (2.5 step 6, Runtime O4). There are at least six causes:

1. a turn commits;
2. a domain settlement (rule 27), no turn;
3. a Runtime step: invocation, a storage refusal, an unbound ending, dispose;
4. `progress(p)`, no turn (T8);
5. a session cell that changes the row (T1), no turn;
6. a store push or repair, no turn.

Every committed publication is a frame with exactly one cause (rule 64). So the observable history of a Runtime is **one totally ordered list of publications**, and nothing in the design works if two of them interleave. The system's real clock is that list, which is why I want one sequencer.

The window between settlement and admission is deliberately visible: "a record can read confirmed while the lane row still reads `pending`" (2.5). That is not a glitch. It is the design's one intentional inconsistency, and a story names it with `{ at: { settled: O.x } }`.

### 3.3 The turn is stratified, and this should be stated once

Rule 22 and 2.5 hide a strict evaluation order. Writing it out:

| Stratum | Computes | Reads | Can it refuse the turn? |
| --- | --- | --- | --- |
| 0 Admit | lane cell of the ending, bookmark cell, promotion, map, owner test | pre-turn | no: **this always commits** |
| 1 Select source | alternatives, source patch | before; pre-turn lanes + ending | decline falls to ancestor |
| 2 Reset | `resetOn`, new incarnations, `input` | before-walk | no |
| 3 Walk | raises, children, notifies, exits, fixed target, leaving | before, or initial for new incarnations | yes |
| 4 After memory | apply patches, list repair | patches | list repair never refuses |
| 5 Effect reads | commit selects, key selects, `optimistic`, schedule fns | after memory; pre-turn lanes | yes (`InvalidTurn`) |
| 6 After lanes | member cells in action order, releasing marks, store joins and predictions | stratum 5 | declines are endings, not refusal |
| 7 Reconcile | `keys`, `when`, placement selects, `restartOn` | after memory, after lanes | yes (`InvalidTurn`, rule 22) |
| 8 Commit | exits, entries, freeze, arm, `resetOn` re-check, `filled`, publish | all | no |
| 9 After | invoke what the acks and queues allow | | no |

This is acyclic, which I checked by hand against rule 22 and 2.5 only; I did not find a counterexample but did not prove it. Note stratum 5 and 7 can throw inside closures, but 6 has already applied member cells in memory. In a pure step that does not matter: discard. In a mutating implementation it needs a rollback. Point for pure.

This table should be the outline of the turn's source file: one function per stratum, in order.

### 3.4 The invariants, derived from the rules

| # | Invariant | From |
| --- | --- | --- |
| I1 | Every publication is one complete cut | Runtime O4, 2.5 step 6, Persistence O3 |
| I2 | Memory changes only in a committed turn | rule 71's "stays true", Machines O3 |
| I3 | A lane's status changes only in its binding incarnation's turn or a Runtime step | 2.7.13 |
| I4 | Every minted Attempt has exactly one ending (delivered, parked or declared evidence), within one Runtime | 17, 8 |
| I5 | Nothing newer is sent on a holding lane while an unknown is unresolved | OD5, 21 |
| I6 | Store effects do not depend on routing or binding | 27 |
| I7 | At most one write in flight per record; invocation requires heading every joined queue | 28, 29, ED:639 |
| I8 | A persisted Attempt's first invocation follows its one acknowledgement; lane and predicted keys are captured together | 38, O6 |
| I9 | `pending` holds from the starting publication until the ending's admission | 2.7.12 |
| I10 | `check(s, e)` agrees with handling and has no effects | 2.5 |
| I11 | Delivery order at adoption: parked, then `Restored`, then external; pending reset first | 44, 54 |
| I12 | One session per (incarnation, path, operation, key), and it waits for a releasing predecessor per (actor, operation, key) | 68, 70 |
| I13 | One interruption, one `missed` | T1 `notice` |
| I14 | Same inputs, same clock, same seed: same publications | Machines O3, 61 |
| I15 | A "cannot occur" cell never fires | 2.10.15 |

I1, I4 and I14 are the three that decide the architecture. Each is a property over all actors at once.

### 3.5 The hypothesis, attacked

`step(actorState, input) => { actorState, publication, commands }`. Each case below says what breaks and what survives.

**Ordering across actors. It breaks.** Rule 28 is the plain counterexample. Actor A's commit, in step 5, checks every record queue's bound (rule 35), joins them all or none, and computes a prediction over the record as it now stands, replayed over predictions of other actors. With `actorState` alone this cannot run. You either pass the store in, which makes the signature a lie, or ask the store and wait, which breaks "one publication".

**The design does not specify the order of turns between actors in one Runtime.** I searched: 2.10.17.5 orders sleeps by actor creation and says "tabs take turns one at a time", and Runtime O4 says per-actor FIFO. Nothing orders two actors in the same tab with both ready, yet rule 61 and I14 require a fixed answer. **This is a real gap**, and Story outcomes depend on it. Recommendation in Q2.

**Awaited release. It holds, at a price.** T1's `Releasing` waits for a scope to close or 5 s; T9 makes the successor wait. In Effect this is one line (`Fiber.interrupt`, `Effect.timeout`). In a pure step it is a state, a command, an input and a timer. That is defunctionalizing the fiber. I count about 15 suspension points the core must reify: ack wait, capture wait, record-queue wait, wire, cancel-in-flight, predecessor release, connect, page read, backoff, page retry, healthy, idle, pull credit, bootstrap, dispose bound. **The saving grace is that the design already wrote almost all of these as table states**, because the models forced it. Reifying is not new work; the tables exist. The fiber form would throw them away and re-derive them. This is the strongest argument for the core and I did not expect it.

**Entity queues shared across actors. It breaks the signature, not the idea.** Same as ordering. And rule 29's stated limit lets one actor's held lane stall another actor's write through a record queue. In a world-shaped core this is a data query; Inspection lists it from the same value.

**Mid-turn captures. It holds, better than the alternatives, with two catches.** "Captured" means three things in the design: `optimistic` reading after memory, captured with the Attempt, even if the start waits (rule 36); persistence captures seeing only whole publications (Persistence O3); and the releasing mark being captured no later than the actor record (2.9.3).

With immutable worlds, capture means keeping a reference. "Never part of a turn" is free. A persisted Attempt keeps its Attempt record in the world. The catches: (a) minting `attempt.id` mid-turn needs an id source and `check()` must mint nothing, so ids are an argument; (b) **Persistence O3 says a scope is saved atomically, and O6 requires an ack per Attempt, so naively every persisted click encodes the whole scope, up to 16 MiB.** I think this is a real performance bug in the combination of those clauses, in any architecture. See 5.4.

**Frames during a settle. It holds if the step reports each publication at once.** A settle may run many steps; each commit is a frame with `now`, truth and `seq`. The driver appends after each step. Truth is read by the executor at that moment; a fake handler is synchronous (2.10.17.2). But **purity buys nothing for the settle itself.** 2.10.2's drain exists because adapters run on Effect and promises. It sits in the driver and executor and stays as hard as the design says.

**Streaming progress with no turn. It breaks "the turn", not "the step".** `progress(p)` is a step with no actor turn, publishing one row. So are `settle` at the queue head (T3) and T1 session cells. Mapper reads of `prog[a]` at admission (T8) work only because progress steps apply on arrival and endings queue, so ordering falls out of "steps apply now, turns wait".

So there are **two classes of input: those applied at once, and those queued for a turn.** The hypothesis has only one.

**Effect fibers holding state outside the step. It holds where you draw the line honestly.** What stays out: the real request, the `AbortSignal`, adapter queues (T6), Effect `Scope`s and running finalizers, `Effect.cached` and semaphores in services, and anything in a service Layer. Who interrupted a fiber (the classifier reads `Cause.interruptors`) has to be read in the driver, so **classification belongs in the driver with the fact from the world passed in**; rule 18 belongs in the core. The danger is drift: core says `on wire`, the fiber is dead with no completion. That is the failure this architecture invites. The defence: every forked command goes through one wrapper that guarantees one completion input, in an uninterruptible finalizer. That wrapper is about 40 lines and the most important code in the system.

**Cases you did not list.**

- **A turn is not atomic.** 2.5 commits step 1 even if the rest is `Denied`, `Unhandled` or `InvalidTurn`: "an ending admitted in a Denied or Unhandled turn counts as delivered." So `step` is `admit` (always commits) then `plan` (may reject) then `commit`. And `check()` is exactly `plan` on a snapshot. That split is natural; it just is not "one step".
- **`check()` takes a snapshot, not internal state.** So a snapshot must reach everything a plan reads: private memory, activations, lanes, store. Either snapshots are huge or each holds a hidden reference to its world. With immutable worlds the hidden reference costs nothing. In any mutable design this is hard.
- **Closures can throw or diverge** in step. Pure in signature, not in fact. A guard with `Date.now()` silently breaks I14; nothing can stop it.
- **Reentrancy.** A subscriber calls `send` during publication. Notification must happen after the step returns, and the send must queue.

### 3.6 So what is the unit?

"Unit of work" conflates five questions. They have five answers:

| Question | Unit | Size |
| --- | --- | --- |
| What is atomic? | **step**: one input on one world | one function call |
| What can be observed? | **publication** | at most one per step |
| What can be refused? | **turn body** (strata 1–8) | part of one step |
| What is ordered per actor? | **mailbox item** | one turn |
| What does a test see? | **step cut** (a Story's step, not this step) | a settle: many of the above |

The name collision is unfortunate: a Story step and a runtime step are different things. Call the runtime's a **transition** if you prefer; I use step here because it is the word you floated.

---

## 4. Architectures

### 4.0 The source, common to all

Where the data comes from: `fetch`, through a service whose Layer is the swap point. Flow is not a network library. The same source for every sketch, based on 2.7.3 and 2.11.2.

```ts
// checkout.contracts.ts
class PayApi extends Context.Service<PayApi, {                          // user-defined: PayApi. Production wraps fetch(url, { signal })
  readonly confirm: (i: { intentId: string }, o: { idempotencyKey: string; signal: AbortSignal }) =>
    Effect.Effect<{ ok: boolean; status: string; code?: string }, NoResponse>
}>()("app/PayApi") {}

export const pay = transaction({                                        // existing: transaction
  id: "Checkout.pay",
  input: { intentId: Schema.String },
  output: Schema.Struct({ status: Schema.String }),
  key: [],                                                              // existing: key. One lane
  concurrency: "reject",                                                // existing: concurrency, "reject"
  commit: (input, { attempt, signal }) => Effect.gen(function* () {     // existing: commit; attempt, signal
    const api = yield* PayApi
    const res = yield* api.confirm(input, { idempotencyKey: attempt.id, signal }).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))         // existing: Outcome.unknown. fetch rejected: it may have landed
    if (!res.ok) return yield* Outcome.failure(new Declined({ code: res.code ?? "generic" }))  // user-defined: Declined
    return { status: res.status }
  }),
})

export const room = stream({                                            // existing: stream
  id: "Chat.room", input: { roomId: Schema.String }, output: Message, key: ["roomId"],  // user-defined: Message
  delivers: "every",                                                    // existing: delivers
  position: "cursor",                                                   // existing: position
  subscribe: ({ roomId }, { from }) => Stream.unwrap(Effect.map(ChatSocket, (c) => c.room(roomId, from))),  // user-defined: ChatSocket
  reconnect: { while: (e) => e._tag === "ChatDropped" },                // existing: reconnect
  idleTime: "45 seconds",                                               // existing: idleTime
})

// checkout.definition.ts
export const Checkout = definition({                                    // existing: definition
  id: "Checkout",
  states: { CARD: {}, PAYING: {}, UNSURE: {}, DONE: {} },
  events: { Pay: {} },
  internalEvents: { Paid: { status: Schema.String }, Declined: {}, TryLater: {}, Unsure: Flow.uncertain({}), CheckTick: {} },  // existing: Flow.uncertain
  memory: { intentId: Flow.input(Schema.String), tries: Flow.initial(Schema.Int, 0) },  // existing: Flow.input, Flow.initial
  traits: { reconcile: Ticker },                                        // user-defined fragment, below
  operations: ({ E }) => ({                                             // existing: operations
    pay: pay.outcomes({                                                 // existing: outcomes
      success: E.Paid.from((v) => ({ status: v.status })),
      failure: { Declined: E.Declined, NotSent: E.TryLater },
      unknown: E.Unsure,
    }),
  }),
})

// ticker.fragment.ts
export const Ticker = trait({                                           // existing: trait
  id: "Ticker", callbacks: { onTick: Flow.Callback({}) },
  internalEvents: { Due: {} },
}, ({ E, callbacks }) => ({
  schedules: { due: { schedule: "5 seconds", send: E.Due } },
  on: { Due: { target: "self", notify: [callbacks.onTick] } },          // existing: notify
}))

// checkout.machine.ts
export const CheckoutMachine = machine(Checkout, ({ S, O, E }) => ({    // existing: machine
  default: S.CARD,
  traits: { reconcile: { callbacks: { onTick: [{ guard: [S.UNSURE, O.pay.retryable({ times: 6 })], target: S.PAYING, actions: [O.pay.retry] }, { target: "self" }] } } },
  on: {
    Paid: S.DONE,                                                       // handled at the root: current or late (rule 20)
    Declined: S.CARD, TryLater: S.CARD,
    Unsure: S.UNSURE,
  },
  states: {
    CARD: { on: { Pay: { target: S.PAYING, guard: [O.pay.idle], actions: [O.pay.commit(({ memory }) => ({ intentId: memory.intentId }))] } } },  // existing: idle, commit
    PAYING: {}, UNSURE: {}, DONE: {},
  },
}))
```

**The path**, used by each architecture: `Pay`, the commit runs, `fetch` rejects, the send is classified `unknown`, the lane goes `Held`, `Unsure` moves to `UNSURE`, `Ticker` fires, `retry` re-sends the same id.

### 4.A The world step (recommended)

Pure step, thin driver, one run loop, tables as data, closures as closures.

```ts
// All NEW and internal; nothing below appears in user code.

// ── Compiled form. Every field is produced by compile(definition, machineBody); see section 6.
type Compiled = {
  id: string
  nodes: { parent: Int32Array; depth: Int32Array; name: string[]; default: Int32Array }   // state and placement nodes
  on: Map<number, Map<string, Alternative[]>>                     // node id → event tag → alternatives
  ops: Op[]                                                       // operations, flat, each with its placement node
}
type Alternative = {
  target: number | "self"
  tokens: number[]                                                // state tokens: readable by tools
  guards: Array<(g: GuardInput) => true | Denial>                 // closures
  patch?: (u: UpdateInput) => object
  members: Member[]                                               // { op, verb, select? }: data with closures in slots
  raises: Raise[]; notifies: Notify[]
}

// ── The world.
type World = {
  actors: ReadonlyMap<ActorKey, ActorRec>                         // state, memory, incarnations, mailbox, read lanes
  lanes: ReadonlyMap<LaneKey, Lane>                               // Runtime-owned: rule 21
  store: Store                                                    // records, queues, marks: persistent map
  sessions: ReadonlyMap<SessionKey, Session>                      // T1 vars
  admission: "open" | "held"                                      // together()
  seq: number; rev: number
}

// ── Two classes of input.
type Input =
  | { k: "send"; actor: ActorKey; event: Ev }                     // queues
  | { k: "fired"; timer: TimerId }                                // queues
  | { k: "settled"; attempt: AttemptId; send: SendEnding }        // applies now (store), then queues the ending
  | { k: "invoked"; attempt: AttemptId }                          // applies now
  | { k: "acked"; attempt: AttemptId; ok: boolean }               // applies now
  | { k: "progress"; attempt: AttemptId; p: unknown }             // applies now (T8)
  | { k: "signal"; session: SessionKey; s: Feed }                 // applies now (T1)
  | { k: "turn"; actor: ActorKey }                                // the loop's own: take one mailbox item

type Command =
  | { k: "invoke"; attempt: Attempt; op: OpId }
  | { k: "interrupt"; attempt: AttemptId }
  | { k: "arm"; timer: TimerId; at: number } | { k: "disarm"; timer: TimerId }
  | { k: "connect"; session: SessionKey; from: unknown } | { k: "pull"; session: SessionKey } | { k: "close"; session: SessionKey }
  | { k: "capture"; records: LaneRec[]; attempt?: AttemptId }

// ── The lane table: data. Cell labels are what `lane` records and coverage name.
const HOLDING: Record<Row, Record<"Idle" | "InFlight" | "Held", Cell>> = {
  unknown:   { Idle: never, InFlight: { next: "Held", do: ["deliver"] },         Held: never },
  retry:     { Idle: ev("NothingToResend"), InFlight: ev("InFlight"), Held: { next: "InFlight", do: ["resend"] } },
  // and 14 more rows, 48 cells, as written in 2.7.13
}

// ── The path. Settlement first (rules 18, 27).
const onSettled = (w: World, i: Settled): Out => {
  const a = attemptOf(w, i.attempt)
  const ending = attemptEnding(a, i.send)                         // rule 18: StillUnknown from the send history
  const w1 = isDomain(a) ? storeApply(w, a, ending) : w           // rule 30's table; publishes if it changed
  return enqueue(w1, bindingOf(w1, a), { k: "ending", a: a.id, ending })  // lane untouched: pending stays true
}

// ── Then admission and the turn.
const onTurn = (w: World, actor: ActorKey, now: number, ids: Ids): Out => {
  const item = headOf(w, actor)
  const adm = admit(w, actor, item)                               // stratum 0: the cell → Held; mapped E.Unsure; owner test. Always kept
  const plan = planTurn(adm.world, actor, adm.event, adm.from, now, ids)  // strata 1–7. Pure. This is check()
  return plan.ok
    ? commit(adm.world, plan)                                     // stratum 8. Reconcile produces arm, disarm, connect, close
    : published(adm.world, plan.verdict)                          // the ending stays delivered, the turn's members are dropped
}

// ── The driver: everything that touches Effect. Stream drop arrives here too.
const invoke = (c: Invoke) => Effect.gen(function* () {
  const fiber = yield* Effect.forkIn(
    ops[c.op].commit(c.attempt.input, ctxOf(c.attempt)).pipe(     // existing: commit
      Effect.onExit((exit) => Effect.sync(() =>                   // exactly one completion, or I4 is a lie
        input({ k: "settled", attempt: c.attempt.id, send: classify(exit, c.attempt) })))),
    scope)
  fibers.set(c.attempt.id, fiber)
})

const session = (c: Connect) => ops[c.op].subscribe(c.input, { from: c.from }).pipe(
  Stream.runForEach((x) => credit(c.session).pipe(                // one at a time: rule 69, T4
    Effect.andThen(Effect.sync(() => input({ k: "signal", session: c.session, s: x }))))),
  Effect.onExit((exit) => Effect.sync(() => input({ k: "signal", session: c.session, s: endOf(exit) }))))
  // fetch dropped: the stream fails ChatDropped → T1's "stream fails e" → lose(e) → Waiting, drop = e, arm backoff

// ── The loop. Sync when idle, so send() has published by the time it returns.
const pump = () => {
  if (running) return
  running = true
  while (inbox.length > 0 || runnable(world)) {
    const i = inbox.shift() ?? nextTurn(world)                    // Q2: which actor next
    const o = step(world, i, clock.now(), ids)
    world = o.world
    for (const p of o.publications) frames.push(p)                // Stories see each one
    for (const c of o.commands) exec(c)                           // may call input() synchronously: it queues
  }
  running = false
  notifySubscribers()                                             // per drain: React gets the latest
}
```

**How it handles the hard cases.** Atomic cuts: one value. `together`: `admission: "held"`, which stops `turn` inputs while settlements apply. Rollback: drop the value. Rule 60's marks after every member: stratum 6. Reload: decode records into a world, then queue deliveries. `check()`: call `planTurn`. Cross-actor order: the loop's `nextTurn`.

**Lines.** Per-part in section 8. Core plus driver about 5,800 to 10,500 for everything in the runtime, about 3,000 to 4,000 for the first slice [estimate]. Evidence for scale: the server-calls spike's whole runtime is 481 dense lines, and the lane model 407 [read].

**Performance.** A turn allocates new records along touched paths. Baseline: a spread-and-return step on a small object took about 6 ns, a queue hop through Effect about 15 µs [measured]. In UI work, closures and React dominate. The real cost is the store: copying a 10,000-entry `Map` per prediction is not acceptable, so it needs a persistent map. Effect's `HashMap` alone is 7.2 KB gz if nothing else pulled it in [measured]; a 150-line own structure is an option. Turn cost on a desk-sized world is not measured.

**How it fails.** Driver and core disagree, silently: state says on the wire, no completion ever comes. A closure breaks determinism. World types bloat into a god object. Agents rebuild Effect in data (a mini-scheduler inside the core). Every wait state must also be correct at dispose, which multiplies procedures.

**Stories.** Stay as designed, on the production path. Publications come straight from the loop. `inspection.work` is a pure read of the world. `together`, `advance` and `suspended` are small. The drain stays hard.
**Inspection.** Pure function of a world. Best of all options. Snapshot and `check()` keep a hidden world reference.
**Persistence.** Capture is a reference; encode happens later. "Whole publications only" is free.
**SSR.** A world can be run to quiet on the server and encoded; `DehydrateCommitInFlight` is a query. Bounded settling is a driver concern.

### 4.B Effect fibers per actor and per session

The idiomatic Effect shape, and largely what `flow-state-rewrite` did. Each actor is a fiber over a `Queue`. Sessions own their state in the fiber. Lifetimes are `Scope`s.

```ts
// NEW, internal. Same source as 4.0. No compiled form beyond the closures: state lives in Refs.
const makeActor = (m: Machine, id: ActorKey) => Effect.gen(function* () {
  const mailbox = yield* Queue.bounded<Item>(1024)                // Runtime O4
  const memory = yield* Ref.make(initial(m))
  const fibers = yield* FiberMap.make<AttemptId>()

  const startCommit = (a: Attempt) => FiberMap.run(fibers, a.id,
    ops[a.op].commit(a.input, ctxOf(a)).pipe(                     // existing: commit
      Effect.exit,
      Effect.flatMap((exit) => runtimeLock.withPermits(1)(Effect.gen(function* () {    // the whole-Runtime lock
        const ending = attemptEnding(a, classify(exit, a))        // rule 18; fetch rejected → unknown
        yield* store.apply(a, ending)                             // rule 27: store first, one publication
        yield* Queue.offer(mailbox, { k: "ending", a: a.id, ending })
      })))))

  const loop = Effect.forever(Effect.gen(function* () {
    const item = yield* Queue.take(mailbox)
    yield* runtimeLock.withPermits(1)(turn(m, memory, item))      // the atomic cut needs this, and it serializes everything
  }))
  yield* Effect.forkScoped(loop)
})

// Session: looks wonderful until you read T1.
const session = (c: SessionCfg) => Effect.gen(function* () {
  yield* predecessorReleased(c)                                   // T9: one await
  yield* ops[c.op].subscribe(c.input, { from: yield* bookmark(c) }).pipe(
    Stream.tap((x) => deliver(c, x)),
    Stream.retry(reconnectSchedule(c)))                           // a drop: Effect handles backoff. But flaps, stalls, `healthy`,
                                                                  // `owed`, `noted` and regInConn are read and reset across retries,
                                                                  // so they end up in Refs and the Stream.retry goes away.
}).pipe(Effect.timeoutOption("5 seconds"))                        // Releasing with ReleaseOverdue: nice
```

**Hard cases.** Awaited release and cancel are short and honest; `Fiber.interrupt` returning when finalizers finish is exactly what T9 wants. Atomic cuts need a global lock, which means all the concurrency is fake and the fibers cost lines without giving parallelism. Rule 60, parking, adoption and lanes that outlive actors mean lanes cannot live in actor fibers anyway. Inter-actor order is whatever the Effect scheduler happens to do. I14 becomes a claim about scheduler internals.

**Lines.** 11,000 to 18,000 [estimate]. The evidence is direct: `src/runtime` has 15,330 lines and `src/runtime-next` 11,104 non-test lines [measured], with **no occurrence of `whenAbandoned`, `resetOn`, `resumable`, `record queue`, `parked` or `bookmark` in either** [measured by grep]. They hold neither fragments, nor record queues, nor bookmarks. Weaker models wrote them, so part of that is not inherent. But `actor-engine.ts` alone is 2,540 lines, and `runtime-next` split the same concerns into dozens of files without shrinking.

**Performance.** I expected this to lose here and it does not. A parked fiber is about 400 bytes; a queue with a `take` loop about 2.5 KB; creating one takes about 1.7 µs; a hop about 15 µs [measured, Node only, not a careful benchmark]. **A thousand actors is 2.5 MB and nobody will notice 15 µs per event. Do not reject fibers for speed.** Bundle: the same Effect modules either way, because the driver needs them.

**How it fails.** Race bugs only some interleaving shows, which no test can explore, because the scheduler is not yours to steer. State spread across `Ref`s, so inspection needs a parallel registry.

**Stories.** Settling must wait on every actor's fiber, and "tabs take turns" needs a gate in each. Exploration of interleavings is impossible. **Inspection.** A registry kept in sync by hand, which I believe is why `evidence.ts` reached 1,459 lines. **Persistence.** Capture must quiesce everything; Runtime O5's "waits for the wave to settle" is a symptom. **SSR.** Fine, as Effect is good at scopes.

### 4.C Central scheduler with mutable work records

A work loop in the React-fiber or FoundationDB sense. State is a mutable object graph with typed arrays. Work is explicit records with priorities. Rollback uses an undo journal. It shares A's sequencer but not its purity.

```ts
// NEW, internal. Compiled form: flat, integer ids everywhere.
type C = {
  nodeParent: Int32Array; altStart: Int32Array; altEventTag: Int32Array; altTarget: Int32Array
  guards: Array<Guard>; patches: Array<Patch>                      // closures referenced by index
}
const enum K { Settle = 0, Invoke = 1, Progress = 2, Signal = 3, Turn = 4 }  // priority order: Runtime steps before turns
type Work = { k: K; actor: number; a: number; payload: unknown }   // a work record

const laneState = new Uint8Array(MAX_LANES)                        // 0 Idle, 1 InFlight, 2 Held
const journal: Array<() => void> = []                              // undo log for the turn body

const work = (u: Work) => {
  switch (u.k) {
    case K.Settle: {                                               // fetch rejected, classified unknown
      const ending = attemptEnding(attempts[u.a], u.payload as SendEnding)
      if (domain[attempts[u.a].op]) storeApply(u.a, ending)        // mutates, then publishes
      queue.push({ k: K.Turn, actor: attempts[u.a].actor, a: u.a, payload: ending })
      return
    }
    case K.Turn: {
      admit(u)                                                     // laneState[lane] = 2. Not journaled: always kept
      const mark = journal.length
      if (!planAndApply(u)) { while (journal.length > mark) journal.pop()!(); publishVerdict(u); return }
      publish(u.actor)                                             // copy out a frozen snapshot
    }
  }
}
const loop = () => { const end = now() + 5; while (queue.size > 0) { work(queue.pop()); if (now() > end) return yieldToHost(loop) } }
```

**Hard cases.** Same as A where sequencing matters. `check()` must run the plan then roll back, or plan on a copy: **`check(snapshot, event)` against an old snapshot cannot use mutable state at all**, so a snapshot must carry a real copy. That is the hard one. Frames need copies too.

**Lines.** 7,000 to 11,000 [estimate]: A's, plus a journal and copy-out, minus some.

**Performance.** Best on paper, least allocation. Irrelevant for tens of turns per second; it might matter for a store with many records under high push rates.

**How it fails.** A missed journal entry corrupts state quietly. Copy-out bugs break I1. BFS needs a state hash and undo. Integer tables are unreadable to agents and to you at 1 am.

**Stories, Inspection.** Publish-time copies; frames are the expensive part, since 2.10.6 keeps 10,000. **Persistence.** Capture must copy synchronously at publication. **SSR.** Fine.

I would hold this as an *optimization of A*: same `step` interface, mutable inside, if measurements demand it. That is why A's signature matters more than its implementation.

### 4.D Generated code

Two forms that are very different. **D1** generates a step function for each user machine at build time. **D2** generates Flow's own kernel transitions from its tables at Flow's build time.

```ts
// D1. A bundler plugin reads machine definitions and emits this. NEW, generated, not written by anyone.
export const step_Checkout = (a: ActorRec, ev: Ev, w: World) => {
  switch (a.leaf) {
    case 0 /* CARD */:
      if (ev._tag === "Pay") {
        const denied = idle(w, a, OP_PAY)                          // [O.pay.idle]
        if (denied !== true) return declined(denied)
        return { leaf: 1, members: [commit(OP_PAY, closure_12)] }  // closures cannot be generated: they stay imported by index
      }
      break
    case 2 /* UNSURE */: /* the Ticker callback, inlined from the fragment */ break
  }
  return root_Checkout(a, ev, w)                                   // Paid, Unsure and friends
}

// D2. The source is the table; the generator emits a switch, a test row per cell and the docs table.
// tables/lane.table.ts, NEW:
export const laneTable = table({ rows: ["commit", "retry", "unknown"], states: ["Idle", "InFlight", "Held"], cells: {
  "unknown.InFlight": { next: "Held", do: ["deliver"] },           // the fetch path lands here
  "retry.Held": { next: "InFlight", do: ["resend"] },
} })
// generated lane.gen.ts, test/lane.gen.test.ts, docs/lane.gen.md
```

**Hard cases.** Generation does nothing for concurrency, ordering or waits. It sits on top of A or C.

**Lines.** D1: generator 1,500 to 3,000 plus a runtime 5,000 to 8,000, and it still needs an interpreter for `check`, Inspection and dev [estimate]. D2: 200 to 400 for the generator, and it might *save* lines in tests.

**Performance.** Fastest dispatch. Dispatch is not the bottleneck.

**How it fails.** D1: a plugin in every user's build, HMR, source maps, Next.js, and `new Function` blocked by CSP [memory]. The definition stops being a plain value, which is a large change for agents and tools. D2: generator drift, generated code nobody reads.

**Stories, Inspection, persistence, SSR.** D1 needs a second representation for tools, directly against "one graph". D2 no effect.

**Verdict.** No to D1. D2 is unnecessary at first: an interpreter over the same table gives every benefit without a build step. Revisit if a cell's interpretation grows branches.

### 4.E Everything is a machine (self-hosting)

The most attractive idea on paper. Write lanes, sessions and maybe the record queue are themselves Flow machines, run by a tiny kernel. One kernel; evidence, Inspection and Stories apply uniformly; you dogfood. XState's spawned actors point this way [memory].

```ts
// lane.internal.ts, NEW: the write lane as an internal definition
const Lane = definition({
  id: "flow/lane",
  states: { Idle: {}, InFlight: {}, Held: {} },
  events: { Commit: {}, Retry: {}, Cancel: {}, Ended: { channel: Schema.String } },
  memory: { attempt: Schema.NullOr(AttemptSchema), waiting: Schema.Array(AttemptSchema) },
})
const LaneMachine = machine(Lane, ({ S }) => ({
  default: S.Idle,
  states: {
    Idle: { on: { Commit: { target: S.InFlight, updateMemory: mint } } },
    InFlight: { on: {
      Ended: [
        { guard: [isUnknown], target: S.Held, actions: [deliver] },   // fetch rejected: the hold
        { target: S.Idle, actions: [deliver, promote] },
      ],
    } },
    Held: { on: { Retry: { target: S.InFlight, actions: [invoke] }, Cancel: { target: S.Idle, updateMemory: release, actions: [promote] } } },
  },
}))
```

**Hard cases.** This hits the wall immediately. 2.5 step 5 applies lane cells **inside the actor's turn, before publication, with pre-turn lanes visible to guards and after lanes visible to `keys` and `when`**. A lane that is an actor has its own turn. So either the actor's turn synchronously nests the lane's turn (then it is a function, not an actor) or you lose the atomic cut. The same holds for record queues (rule 28). The session (T1) could really be a machine: it has no such requirement beyond the row.

**Lines.** Kernel 2,500 to 4,000; lanes and sessions as definitions 1,000 to 2,000; a nesting exception to everything; 6,000 to 9,000 total [estimate].

**Performance.** One turn per lane change, multiplied; evidence noise.

**How it fails.** Circular bootstrapping. A bug in the kernel looks like a bug in lanes. `flow check` and Stories would see internal machines unless hidden, and every "hidden" is a special case.

**Verdict.** No, except keep one fact: **T1 as data run by a small table interpreter gets most of the same uniformity**, which is what A does.

### 4.6 Compared

| | A world step | B fibers | C work records | D1 generated | E self-hosted |
| --- | --- | --- | --- | --- | --- |
| Atomic cut | free | global lock | copy at publish | as host | broken or nested |
| Inter-actor order | one choice in the loop | scheduler | one choice | as host | as kernel |
| Awaited release | reified, already tabled | one line | reified | as host | reified |
| `check` on an old snapshot | free | needs a copy | needs a copy | as host | free-ish |
| Explore interleavings | direct BFS | impossible | with undo | as host | direct |
| Driver risk | **high** | low | high | high | high |
| Runtime lines [estimate] | 5,800–10,500 | 11,000–18,000 | 7,000–11,000 | 6,500–11,000 | 6,000–9,000 |
| Readable at a glance | medium | high locally, low globally | low | low | medium |

Honest counterargument to A: **Effect is the point of this library, and A uses it only at the edge.** An Effect-native reader will find `pump` odd. And B's sessions read better than any T1 table. If you weigh reading at a glance above explorability, you could do A for actors, lanes and store, and keep sessions as fibers with local state (call it A′). I reject A′ for now because T1's variables must publish rows, cross turns and write the bookmark. But it is my second choice, and a first-slice finding could move me.

---

## 5. How the decisions merge in

This is the question you stressed: "there's just a lot". My main claim: **it is less than it looks, because most rules are not code, and it is more than it looks, because of what the rules do not contain.**

### 5.1 The counts

75 items: rules 1–72 and N1–N3. Each is assigned to its primary home; many have a secondary.

| Category | Meaning | Count |
| --- | --- | --- |
| **Laws** | invariants over any step; a property test, not a code path | **7** |
| **Tables** | become data; an interpreter runs them | **13** |
| **Procedures** | real algorithm code in the core | **21** |
| **Driver** | code at the Effect boundary | **1** |
| **Compile-time only** | types, `compile`, or `flow check`; nothing in the running core, or one line | **20** |
| **Tooling** | Story executor, reads over records | **7** |
| **Vanish** | a shape, a convention or a restatement | **6** |

**Only 21 of 75 rules need dedicated core procedures**, and 13 more share one interpreter. 26 never touch the runtime prototype at all (compile-time and vanish). That is the good news.

Bad news: of the 21, about nine (1, 9, 14, 44, 51, 52, 53, 54, 60-adjacent) describe one tangled subject: *which incarnation owns what, and what happens when it goes away*. That one subject is the real size of this system. And 1 driver rule against 21 procedures tells you **the driver is the least specified part of the design.**

### 5.2 Every rule

| Rule | Subject | Lands in | Note |
| --- | --- | --- | --- |
| 1 | placement, freeze, reset | Procedure: `incarnations.ts`; strata 2, 8 | The heaviest rule. Resists (5.4) |
| 2 | three sender lists | Compile: types; one tag set for `InvalidEvent` | |
| 3 | I/O opt-in | Compile: types | |
| 4 | host cannot reach in | Compile: types | |
| 5 | ports filled | Compile: types, and `compile` throws | |
| 6 | callbacks, exits, `whenAbandoned` | Procedure: stratum 3 | |
| 7 | one turn | **Law** | "Compile" there means nothing static; it is a runtime walk |
| 8 | deliveries never lost | **Law**; totality in `flow check` | Test-mode violation on an unhandled delivery |
| 9 | `.each` | Procedure: final list, repair, incarnations | |
| 10 | nesting hides | Compile: summaries | |
| 11 | tested alone | Tooling: stand-in host | |
| 12 | construction errors, defects | Compile; runtime part is `InvalidTurn` in the plan | |
| 13 | endings map to events | **Table**: compiled `outcomes` | Closures in slots |
| 14 | owner, current, late | Procedure: `admit`, about 40 lines | One function, three answers |
| 15 | late turns | Procedure: small check in strata 1, 3 | |
| 16 | declines are endings | **Table**: lane cells | |
| 17 | every commit ends once | **Law**, and the driver's wrapper | The most important property test |
| 18 | Attempt's ending | Procedure: pure function, 15 lines | |
| 19 | key is the Attempt's id | Vanish: a field | Flow does nothing else |
| 20 | required handling | Compile: `flow check` | |
| 21 | write lane | **Table**: 2.7.13 | |
| 22 | before and after | **Law**; it is the stratification | Test by read tracking |
| 23 | schedules | Procedure: reconcile | |
| 24 | cancel | **Table**, with `interrupt` in the driver | |
| 25 | no timeout; classify outside | **Driver** | The only one |
| N1 | keyed lists | Vanish: row shape | |
| N2 | per-call reference | Compile: types; addressable is a table fact | |
| N3 | existence explicit | Vanish: restates 8, 9, 17, 53, 70 | |
| 26 | one split | Compile: types | |
| 27 | settlement vs admission | **Law**, and it splits the input types | Shapes the core |
| 28 | start publishes with turn | **Law** | The counterexample to per-actor step |
| 29 | actor first, then queue | Procedure: store | Includes the rebase; see 5.5 |
| 30 | store follows ending | **Table**: 2.8.6 | |
| 31 | retry same request | **Table**: `retry.Held`, plus a store join | |
| 32 | what clears `uncertain` | Procedure: store | |
| 33 | no temp ids | Vanish: a convention | No code |
| 34 | key of a domain write | Compile: warning | |
| 35 | overflow is an ending | **Table** | Decision reads shared queues |
| 36 | callback reads | Procedure: one capture | |
| 37 | reads carry confirmed data | Procedure: store read | |
| 38 | lanes and keys persist together | **Law** | Cost issue in 5.4 |
| 39 | contracts | Compile: `compile` output | |
| 40 | operations | Compile: `compile` output; `SharedContract` | |
| 41 | verbs and placements | Compile, and reconcile acts on the result | |
| 42 | reads | Procedure: replace-latest | |
| 43 | key-less addressing | Procedure: resolver | Will not survive as written |
| 44 | hold outlives actor | Procedure: adoption | |
| 45 | every hold has an owner | Compile: `UnresolvedHold` | About 200 lines by itself [estimate from `audit.ts`, 213 lines] |
| 46 | lane persistence | Procedure: encode, decode, restore cells | |
| 47 | mapped events from endings only | Compile | |
| 48 | scope in v1 | Compile | |
| 49 | fragments declare operations | Vanish: flattening makes them ordinary | |
| 50 | only the fragment acts | Compile: types | |
| 51 | subject path | Procedure: a field and a comparison | Plus migration; see 5.5 |
| 52 | reads and incarnations; freeze | Procedure | Exception to an exception |
| 53 | parking | Procedure | |
| 54 | adoption order | Procedure: mailbox head | |
| 55 | adopted handled inside | Compile | |
| 56 | host of a holding placement | Compile | |
| 57 | summaries | Compile | |
| 58 | Story walks | Tooling: a list of tests | |
| 59 | fragment rows | Procedure: row projection | |
| 60 | release on leave | **Table**: 2.9.3 | Stratum 6 |
| 61 | every step settles | Tooling, with hooks in the driver | Not touched by the core |
| 62 | world is fakes | Tooling | |
| 63 | Story is data | Tooling | |
| 64 | own cut | Tooling; publications from the loop | |
| 65 | one address | Tooling | |
| 66 | the owner decides | Vanish: a principle | |
| 67 | kinds | **Table**: selects `every` or `latest` | |
| 68 | session table | **Table**: T1 | |
| 69 | delivery | **Table**: T4, credit crosses into the driver | |
| 70 | ownership | Procedure | |
| 71 | bookmark | **Table**: T3 | Four writers; see 5.4 |
| 72 | `listen` | **Table** and a predicate: T7 | |

### 5.3 The design's tables

| Table | Lands in | Form | Cells [read] |
| --- | --- | --- | --- |
| 2.5 what reads what | turn source file | the stratification | |
| 2.7.1 classifier | driver | code | 8 branches |
| 2.7.1 Flow's reasons | core types | union | |
| 2.7.8, 2.7.13 per policy | core | data | 5 rows |
| 2.7.12 timing | test checklist | not code | |
| **2.7.13 holding** | core | **data** | 48, 33 reachable |
| 2.7.13 flags | core | functions of state | 5 |
| **2.7.13 `cancel`, `allow`** | core | **data** | about 39 |
| **2.7.13 `Held (parked)`** | core | **data** | 8 |
| 2.7.14 `UnresolvedHold` | `flow check` | algorithm | not runtime |
| **2.8.5 `NotSent` vs store** | core | **data** | 8 rows |
| **2.8.6 ending vs store** | core | **data** | 5 rows |
| 2.9.2 lifecycle | test checklist | derived | |
| 2.9.3 delta | core | conditions on the lane table | |
| **2.9.3 releasing** | core | **data** | 15 |
| **T1 session** | core | **data, cells call named procedures** | about 150 |
| **T2 registration** | core | **data, ordered rows** | 7 |
| T3 bookmark | core | code | 11 |
| T4 delivery | core | code | small |
| **T5 `latest`** | core | **data** | about 12 |
| T6 `Feed.callback` | **driver**, adapter side | code | about 15 |
| T7 `listen` | core | a predicate | |
| T8 progress | core | code, 4 lines | 8 |
| T9 lifecycle | test checklist | derived | |
| 2.10.2 engines | docs | not code | |
| 2.10.6 reads, record kinds | tooling, types | code | 21 kinds |
| 2.10.15 reach | test plan | not code | |
| 2.10.17.1 steps | executor | code | |
| **2.10.17.2 call endpoint** | executor | **data** | 56, 26 defined |
| **2.10.17.3 stream endpoint** | executor | **data** | 108, 83 defined |
| **2.10.17.4 stand-in host** | executor | **data** | 28 |
| 2.10.17.5 order | executor | a comparator | |
| **2.10.17.6 storage** | executor | **data** | 58 |

Ten tables become core data: 2.7.13's three, the per-policy table, the two store tables, releasing, T1, T2, T5. Four become executor data. One goes to the driver. The rest are code or checklists.

**Why data, again.** Three payoffs. A `lane` record names its cell automatically, so coverage (2.10.14) is free. A mutation test can flip any cell at test time (section 7). And a reviewer can read cells. The risk is the interpreter growing "if" branches to serve odd cells, which means the table lied. Track how many cells need a special procedure.

### 5.4 Rules that resist the model

**Rule 1, `resetOn`.** Three evaluation points (before-walk, re-check at commit, on restore) and a follow-up turn. It is the only cycle-breaker in the design, and the before-walk stratum exists only for it and `input`. It is sound, but it is costly per use.

**Rule 22's five views.** Before, before-walk, initial, after, after lanes. Fine in code. Agents will get one wrong and every test will still pass, since a mapper reading before versus after only differs in a turn that writes that key. It needs read-tracking in test mode.

**Rule 27, two commits.** Input classes and the ending queue exist because of it. It is a good rule; it is why "the turn" cannot be the unit.

**Rules 44, 53, 54, adoption.** Turns that no event caused. They need a "synthetic mailbox head", and their order relative to pending resets and the starting turn's raises is intricate. The lane model covers it only with memory-free handlers and three leaves [read].

**Rule 61.** Not in the core, and not fixable by any architecture. Its `K` is a timing constant in a system that claims no timing dependence; the design states honestly that long chains are cut. "Earliest orders by the step where a fiber parked" relies on `currentOpCount`, marked untested in 2.10.1.

**Rule 69's credit.** One delivery at a time crosses the core-driver boundary per value: a permit for every stream item. Measured cost is small; complexity is real, since T4's `inFlight` and the fiber's pull must never disagree.

**Rule 71, the bookmark.** Runtime behaviour is inferred from **whether a user's memory field is empty at the end of a turn**. Every other rule treats memory as opaque. S15 already says a fourth High here means fallback.

**Persistence O3 with O6 and rule 38.** Not one rule, a combination. A scope saves atomically and every persisted Attempt needs an ack first. Unless lane records can be saved apart from the scope with their own atomicity, a click encodes up to 16 MiB before its request may leave. 2.7.13 says lanes are separate records, but O3's atomic scope has not been amended to say how the two commit together. Nobody has measured it.

### 5.5 Rules whose cost suggests a question

Costs are [estimate]. Corpus counts are [measured] by grep over `dispatch-desk` and `checkout`, **which were written to hit coverage targets rather than from need, so even these counts overstate demand.** They also were never run against Flow.

| What | Rules | Cost | Corpus use | Suggestion |
| --- | --- | --- | --- | --- |
| `basedOn` rebase along the record queue | OD19 Q32, 29 | 100–200 lines, and the core rewrites a queued input | **0 uses** | Cut from the prototype; ask |
| `.resumable()` freeze and thaw | 1, 52, T9, 2.9.2 | 200–400 lines; exceptions in 42 and 46 | 9 hits | Out of the first slice; then decide |
| `concurrency: "allow"` and `"cancel"` | 2.7.13's second table, `HeldThisTurn`, `Held (parked)`, N2 | 150–300 lines, about 47 cells | 3 and 4 hits; 2.7.13 itself says no case in sections 5, 8, 9 uses them | Implement last; `cancel` is the likelier survivor |
| `O.x.bookmark` | T1, T3 | 50 lines, more in tests | **0 uses** | Needed only for SSR. Defer with SSR |
| Migration by key equality | 2.9.4, 46 | 50–100 lines, subtle | not exercised | Cut: send to `orphaned` |
| Local-identity adoption | 2.7.13, OD20 | 50–100 lines, and it surprises | | Ask (Q11) |
| `latest` streams | T5, 67 | 100–200 lines | 2 hits | Keep, later |
| `listen` coverage | T7, 72 | 100–200 lines | word collides, not countable | After the store works |
| Story `suspended`, `nth`, `duplicate` | 2.10 | 100–200 lines | rare by the design's own tiers | Late |
| Context waves | Runtime O5 | see 8.3 | `onContext`: **1 hit** | **Keep the semantics, implement simply, and check whether apps need more than plain provider select** |

### 5.6 Which of the rules I think will not survive contact with code

These are [bet]s, and I would like to be held to them after round 2.

1. **Rule 43's "then the lane's addressable one"** (about 75%). `[O.x.cancel, O.x.cancel]` means two different Attempts on one line, with no visible cue. 2.7.16 already admits the typing may not work. I expect: key-less names the ending's own Attempt, full stop.
2. **Rule 71 as `filled`, cleared and wiped by emptiness** (about 45% it falls to trimmed v2). 2.11.8 has seven exceptions, four writers in T3, and silent loss cases the design itself lists. Your own S15 trigger is the right one; I think it fires.
3. **Local actor identity by `Equal` on input, oldest orphan first** (about 60%). A fresh wizard adopting a stranger's hold, which the design states as a limit, will look like a bug to the first person who hits it.
4. **2.9.4's adoption across versions by key equality** (about 70%). Too subtle for what it buys. `orphaned` is a fine answer.
5. **Rule 52's persisted `Interrupted`** (about 60%), and with it possibly the freeze semantics around lookups. An exception to rule 42 for one combination of features.
6. **Rule 61's attribution** (about 60%): "naming its owner and the step it parked at". The settle will probably survive; naming will degrade to "something is parked".
7. **The rebase in rule 29** (about 50%). Zero corpus uses; it requires the core to know version semantics.
8. **Rule 7's wording** (about 90%, and minor): nothing compiles into one transition; it is a walk at runtime. Rule 12's static part is what compiles.
9. **Rule 38's one capture, as one whole-scope write** (about 60%). It will become a per-record write with a manifest, or Persistence O3's atomicity will weaken.
10. **The row sets per policy** (about 40%). Different row shapes per concurrency make N1 harder and typing harder. A single row shape with some always-zero fields may win.

The ones I expected to doubt but now do not: rule 14's owner test (small, clear), rule 16 (one of the design's best), rule 18, rule 21's table (the lane model and its 21 killed mutants give real confidence, within its stated limits), and rule 27.

### 5.7 What the rules do not contain

This is a list of things the runtime must do that are mainly in `.plan` files. I read their outlines, not every line, and read Runtime and parts of Machines and Persistence in full.

- **Runtime O1–O7**: app closure, bootstrap order, retain, `ensure`, context waves, dispose, quarantine.
- **Operations O2, O4, O5, O6, O7**: resources, `staleTime`, `gcTime`, shared requests, placeholders, resource lanes.
- **EntityDomains O1–O5**: records, the normalized store, answers, repair and repair slots, conditions, merge 5's analysis. EntityDomains O1 alone is about 1,500 words, against 400 for Operations O2 [measured by `wc`]. Rules 26–38 amend it.
- **Persistence O1–O7**, **ServerRendering O1–O7**, **LazyFeatures**, **React O1–O5**, **Inspection O1–O6**, **Diagnostics**.

NEXT.md says the `.plan` changes for streams and Stories are still owed. So **the runtime's real spec is the plans as amended by a design that says which parts it amends.** Some plan sentences are already contradicted: Machines O3 "denied events publish nothing" against 2.5's kept ending; Runtime O3 "no outcome from an old incarnation" is stated as amended in 2.7.13. An agent reading only the design will miss the store; one reading the plans will implement the old behaviour.

**I would write one short document before round 1: the runtime's contract, the rules plus plan clauses in force, as a checklist.** Not a new design. An index. Otherwise round 1 will spend its findings rediscovering this.

---

## 6. The compiled form

### 6.1 What the runtime needs

Only what this list requires. Everything else (summaries, `R`, names for tools) stays out of the runtime's path.

| Need | Field | Source in the definition |
| --- | --- | --- |
| Tree and LCA | parent, depth, default, per node | `states`, `default`, placements |
| Selection | alternatives per node and event | `on`, fillings, schedule triggers |
| State tokens as data | `tokens` per alternative | guard array elements |
| Parts | `raises`, `notifies`, exits, `whenAbandoned` | transitions, fillings |
| Lifetime | per placement: kind, `each` field, `max`, `by`, `resetOn`, `resumable` | trait and subroutine placement |
| Memory start | input fields, constants, computed | `Flow.input`, `Flow.initial` |
| Operations | contract id, kind, key fields, concurrency, policy table ref, mapping, verb, `fills` | `operations`, contracts |
| Placements | activities with `select`, `when` | `activities` |
| Schedules | duration or fn, `armOn`, `disarmOn`, `keys`, `restartOn`, `send` | `schedules` |
| Codecs | event, memory, key, output, position Schemas | Schemas |
| Function | `commit`, `lookup`, `subscribe`, `catchUp`, `reconnect` | contracts, kept opaque |

**Flatten fragments at compile time.** One node per placement, as rule 9 already says for analysis. Rule 49 then vanishes and the walk is uniform. At runtime only incarnation slices and subject paths remember fragments. Rule 10 stays a `flow check` property; flattening does not violate it because nothing reads through it.

### 6.2 Flat arrays or an object graph

A compromise I would not defend strongly: integer ids for nodes, because path tests and exit and entry sets become trivial and allocation-free. Plain objects for alternatives. Maps keyed by tag. **Never persist an id**: rule 46 and 2.9.4 already require lane records to name no instance path, and any integer in a saved record breaks across versions. The world's actor records store names at the save boundary. There is no performance argument here: a definition has at most hundreds of nodes. If reading at a glance suffers, use names and strings; correctness does not depend on this.

### 6.3 How not to invent a format no definition can produce

This is your concern, and it is the right one. "Runtime first with compiled data" has one failure: hand-written compiled literals that drift, with fields nothing can produce. Then the runtime passes tests against a format that real code will never produce, and you are back to two designs.

**Proposal: no hand-written compiled data anywhere, from day one.**

1. Write a tiny **untyped compiler** in round 0: `compile(definition, machineBody)`, accepting the design's actual literal syntax, with `any` everywhere and no checks beyond crashing. 300 to 500 lines. It accepts the literal and the `({ S, E, O }) => …` callback using `Proxy`-free plain token objects.
2. **Every test machine is written in the real syntax** and goes through it. So the code in 4.0 runs. A test machine is copy-paste compatible with the desk, modulo imports.
3. Each field of `Compiled` has a provenance comment, and a review rejects a field whose source is a test helper.
4. Round 0 must compile three real machines, chosen to be awkward: sign-in (3.1, subroutines and history), the board with a nested writing trait (2.9.6), and chat (2.11.2).

The price is that the prototype has a throwaway front end. It is tiny and I think worth it. It also tests the design's literal syntax against a parser early, which nothing has done. Effect's Schema AST is the prior art for "typed values with a runtime data form" [memory]; I would not go further than plain data.

### 6.4 Effect types and the R channel

**The core is erased.** It sees `unknown` payloads and opaque functions. All of `R` is resolved once, by `Layer` at Runtime construction; a compiled `commit` is `(input, ctx) => Effect<A, E, never>` after providing context. `Feed.callback` reads the session kind through a `Context.Reference` per 2.11.4, which stays in the driver. **The core should have almost no generics.** The rewrite's type-heavy runtime files are 15 to 25% type-like lines by a crude grep [measured], and they make the code slower to read and do little for the core's correctness.

### 6.5 What the prototype leaves unvalidated

Say this plainly at each round, because it is the whole of the risk you take by going inside-out:

- **Every typing claim.** `Fragment.O`, branded members, key-less members in handlers, `E` first in `operations`, tuple keys, rule 13's exhaustive `failure`, `fills` naming a field, the "11 compile-error claims" that fired only on stand-ins, `resetOn` order (section 7 items 4, 13, 18, 20). If `Fragment.O` cannot be typed, the API changes, and that can change the compiled form. **So run a type spike beside the runtime rounds, not after them.** B13 in NEXT.md is the same idea.
- **`R`.** A missing service dies at invoke as a defect rather than a type error.
- **Every `flow check` guarantee.** Rules 20, 45, 55, 56 and 57 are compile-time promises the runtime relies on. With no check, an unhandled delivery just goes to `Unhandled`. So in test mode make rule 8 a violation at run time (an ending or firing ended `Unhandled` or `Denied`): this gives you the runtime half of the guarantee.
- **Author's unknown failure tag.** Rule 13 says exhaustive by types, so there is no table cell for an unmapped tag. The prototype needs a behaviour: treat as defect, and record it. That is a design gap, though small.
- **Static analysis of the real graph.** `compile` proves it can produce data, not that `flow graph` can.

---

## 7. Correctness strategy

### 7.1 Principle

**Production code is the model.** Today you have executable models because the real thing does not exist, and T1 says models are "design checks, not a second execution path". With a pure core, BFS over `step` is the real execution path, so W39's removal of public `model()` still stands: this is Flow's own test suite, not an API.

### 7.2 Layers

**Layer 1, cell tests.** Every lane, session and store cell, from its table. Trivial and mechanical. Agents can do this reliably, and it is not where the bugs are.

**Layer 2, exploration of the real core.** A `SimDriver` (test only) keeps commands as a set of pending completions. A search picks the next from: a pending completion, a due timer, a user event from a small alphabet, a reload. Check invariants I1–I15 at every step.

- Exhaustive where it can be: the existing models reach 1.31M states at 1.37 GB in 57 s [read]. The real core will be slower per state and larger, so I expect depth 5 to 6 at best with small alphabets [estimate]. **Run one search process at a time and cap it below 2 GB**; a state cap is a must.
- Needs a canonical state hash. With immutable worlds, a stable serialization, ignoring ids that only differ by name.
- Seeded random walks past the exhaustive depth, as in FoundationDB. Failing seed is the reproduction.

**Layer 3, table mutation.** Tables as data give this for free: for each cell, change its next state or verb at test time and require some test to fail. Your `mutations.py` habit, without Python or source edits, and much faster. A surviving mutant is a cell nothing tests, or an equivalent one that goes on a list. This is the check I most want, because it catches agents writing tests that assert nothing.

**Layer 4, driver conformance.** The dangerous layer. Tests against real Effect with the microtask scheduler:

- every forked command yields exactly one completion, under interruption at every yield point, disposal, a defect in a finalizer and a commit that never ends;
- a cancel racing a settled ending (2.7.13's "the real ending if it had already settled");
- SimDriver and the real driver give the same publications for the same scripts on non-racy cases. **This is what stops the two drifting apart.**

**Layer 5, Stories and `propertyTest`.** The design's top level, end to end. Reaches the cells 2.10.15 lists through production paths.

**Layer 6, oracles independent of the design.** The important distinction: **Stories are not oracles.** A Story has no judgement (SC1); its tests were written by whoever read the same tables. A true oracle is a statement about the world in terms that do not mention lanes:

- the fake server's truth: charged at most once per Attempt id, server ends at latest eligible commit (the lane model's invariant 3 with its F1 limit);
- a chat consumer's list holds every server message, or `missed` fired;
- no frame shows one issue twice.

Keep this list short and treat it as the crown jewels. The domain's EntityDomains O4 properties belong here.

### 7.3 The existing models

Read their RESULTS closely: they check designs under stated caps, with invented behaviour ("Behaviour I had to invent"), and "the model is small, and its author wrote the tables too" (section 7 item 23). So they raise confidence in tables, not in any implementation.

- **Port the invariants, not the code.** 18 lane invariants, I1–I27 for streams, 77 for the wire. Each becomes `(world) => violation | undefined`.
- **Reuse the alphabets** (`events.ts`).
- **Use the lane model once, as a differential**: same event sequences, compare cell labels. Round 1 only, then stop. It is short and `model.ts` is 407 lines. It catches misreadings of the table by the implementer. Do not build an ongoing second path; T1 is right about that.
- Streams and wire models are dense (`any`, one-letter names, the v3 model writes on a single line per function [read]), and v3 does not cover all of 2.11's current tables. Take their counterexample traces as regression scripts.

### 7.4 What survives a rewrite

You will throw prototypes away, so the checks must not depend on them. A check survives if it speaks only in the design's vocabulary.

| Artifact | Depends on | Survives? |
| --- | --- | --- |
| Tables as data files | the design | yes, move them |
| Invariants over publications and evidence | evidence shape | yes, if evidence shape is the contract |
| Story data forms (2.10.1) | the design | yes: JSON-like |
| Oracles | world and fake truth | yes |
| Counterexample traces | input alphabet | yes |
| Machines in real syntax | the design | yes |
| Unit tests of internal functions | the code | **no, and do not write many** |

**Proposal: a `conformance/` folder that is carried between rounds and is the only code that carries.** Everything else starts empty. Each round's first act is to fail all of it. Every review finding becomes one of: a decision, a conformance test or a stated limit. "Finding with no witness" is not allowed. That is how findings carry over when code does not.

### 7.5 Where this does not help

Nothing here tests real browsers, real SDKs, real `fetch` cancellation semantics, real IndexedDB under a tab crash, or real React. Rule 61 states four kinds of false pass. The settle ran only as a minimum on Bun, Node and Chromium, and not at all on Firefox or Safari (2.10.2). A prototype that passes everything has still not met the world.

---

## 8. Size and efficiency

### 8.1 Is 6,500 believable?

Per part, in TypeScript, excluding tests and generous blank-line habits [estimate]. "Low" assumes the cuts in 5.5 and disciplined code. "High" is the whole design with ordinary agent code. My reasoning: model or spike line counts [read], times 1.5 to 3 for real types, evidence and error paths.

| Part | Low | High | Anchor |
| --- | --- | --- | --- |
| Compiled form and loader | 300 | 500 | |
| Turn: strata, select, walk, commit | 700 | 1,200 | spike's whole runtime: 481 dense |
| Incarnations: `.each`, reset, freeze, `whenAbandoned` | 500 | 900 | |
| Schedules and reconcile | 200 | 350 | |
| Write lanes: tables, rows, members | 400 | 700 | lane model 407 |
| Parking, adoption, subject, release | 300 | 500 | `system.ts` 314 |
| Resources, reads, cache | 500 | 1,000 | `operation/resource.ts` 355, no cache runtime |
| Entity store | 800 | 1,600 | entity spike 1,019 is analysis-heavy; 2.8 alone is large |
| Streams T1–T5, T7, T8 | 600 | 1,000 | stream model 637 |
| Context | 100 | 250 | see 8.3 |
| Persistence | 300 | 600 | |
| SSR | 150 | 350 | |
| Lazy | 50 | 150 | |
| Publication, snapshot, rows, inspection view | 300 | 500 | |
| Evidence | 150 | 300 | old: 1,289–1,636 |
| Driver, with T6 | 500 | 900 | |
| **Runtime** | **5,800** | **10,500** | |

**6,500 is believable only near the low column.** 8,000 is my median. Stay under 6,500 by leaving out SSR, lazy, freeze, `allow`, rebase and `listen`, which is fine for a prototype but is not the shipped system.

Now "10,000 shipped":

| Part | Low | High |
| --- | --- | --- |
| Runtime | 5,800 | 10,500 |
| Definition, machine, fragment API with types | 1,500 | 3,000 |
| `flow check` and analysis | 1,000 | 2,000 |
| Stories and `Fake` | 2,500 | 4,500 |
| React | 300 | 500 |
| Inspection output, CLI | 300 | 800 |
| **Total** | **11,400** | **21,300** |

Anchor for the second row: `definition`, `machine`, `operation` and `public` in the rewrite total 8,745 lines today [measured]. Anchor for Stories: 94 new words, five wire tables with about 150 defined cells, two rank orders, tabs, reads over 21 record kinds.

**So 10,000 shipped is not believable with this design. 15,000 as a stop line is a real constraint and will bite: you hit it around the median.** Rather than one number I suggest three independent budgets:

- core + driver: 8,000, stop at 10,000;
- Stories and `Fake`: 3,000, stop at 4,500;
- types, API, `flow check`: measured later, because the prototype does not include them.

If the core hits its stop line, cut design, not comments.

### 8.2 What took the lines in the old runtimes

From `packages/flow-state-rewrite/src` [measured]:

| | `runtime` | `runtime-next` |
| --- | --- | --- |
| Non-test lines | 15,330 | 11,104 |
| Context | 2,812 (18%) | 3,313 (30%) |
| Evidence | 1,636 (11%) | 1,289 (12%) |
| Actor engine, admission, lifecycle | 6,657 (43%) | 4,442 (40%) |
| Fragments, record queues, bookmarks | **0** | **0** |

Sampling the largest files, by crude grep, about 15–25% of lines look like types and field declarations, and 3–7% mention diagnostics [measured]. I also saw:

- `actor-admission.ts`, 2,198 lines, spends a large share on `captureReflection`, `validateEnvelopeArrayLayout` and `UntrustedAdmissionValue`: **defending against hostile `Proxy` objects in event payloads.** Nothing in the design asks for it beyond Schema validation. It looks like an agent hardening reflex.
- `machine/admission.ts`, 1,205 lines, validating definitions at length.
- Two architectures, co-existing, with a `structural-copy.ts`.

**Lesson, treat with caution** because I sampled rather than read 27,000 lines: lines went to *distributing state* (context coordinators, fences, leases, directories) and *defence*, not to the design's semantics. That is both good news for the budget and a warning about what agents do by default.

### 8.3 Context, specifically

`context-wave.ts` alone is 1,347 lines. Runtime O5 requires one update per wave computed from latest snapshots, diamonds included, and capture must not see a half wave.

In a world step: after a commit, walk the consumers in topological order, compute selectors from the one immutable world, compare with `Equal`, and enqueue events in the same step. "No mix of new and stale" holds because there is only one world. Capture sees only worlds where the wave's events are queued. My estimate is 100 to 250 lines. **If right, one architecture choice removes most of a 3,000-line subsystem**; this is reasoned, not run. A check I have not done: reading `context-coordinator.ts` closely for a requirement this misses, such as selector defects keeping the last value (that is easy) or lineage (`lineage-trie.ts`, 494 lines, which I did not understand from a skim). Lineage may be a real requirement I am missing.

### 8.4 Effect's actual cost

Bundles, esbuild minify, ESM, browser [measured]:

| Imports | Minified | Gzip |
| --- | --- | --- |
| `Effect` only, `runFork` | 24.7 KB | 8.8 KB |
| + `Fiber`, `Queue`, `Deferred`, `Scope`, `Exit`, `Cause` | 34.1 KB | 12.0 KB |
| + `Layer`, `Context`, `Clock`, `Schedule` | 55.3 KB | 19.4 KB |
| `Effect`, `Stream`, `Queue` | 45.3 KB | 15.7 KB |
| `Effect`, `Schema` | 75.1 KB | 25.1 KB |
| All of the above | 101.2 KB | 33.9 KB |
| `HashMap` alone | 21.4 KB | 7.2 KB |

Effect 4 is impressive here. **Flow needs nearly all of row 6, whatever the architecture, because contracts use Stream and Schema**: call it 34 KB gz, which the app's own code would largely share.

Flow's own code: the old `dist/index.mjs` is 8,943 JS lines, 193 KB minified, 53 KB gz [measured; an Oct 20 build, so it does not match current source]. About 6 bytes gz per emitted line. So an 8,000-line TypeScript core is about 25 to 40 KB gz [estimate]. **A Flow app starts at roughly 60 to 75 KB gz.** Comparable to what you get adding a mid-size framework and a validation library. Acceptable for an app framework, a hard sell for a landing page. The core importing nothing from Effect but `Equal` and the like means core size does not grow Effect's share.

Fibers [measured, Node only, one run, not a careful benchmark]:

| | Cost |
| --- | --- |
| Parked fiber | about 400 B, 0.24 µs to fork |
| Queue plus `forever(take)` | about 2.5 KB, 1.7 µs to create |
| One `offer`, `take`, `map` hop | about 15 µs (with a yield every 100 messages) |
| `runFork(Effect.void)` | about 0.06 µs |
| Pure `step` with a small spread | about 6 ns |

The hop is 2,500 times a plain step and still irrelevant to one user's clicks. Only high-rate stream deliveries approach mattering: 1,000 messages per second is 1.5% of a core per hop. **"Effect fibers per session are not free" is true of semantics and not of cost.** Chromium was not measured, so assume a phone is 5 to 10 times slower [memory].

### 8.5 What would actually be slow

None of this is measured:

- capture per Attempt (5.4), by far the most likely real issue;
- publishing every actor on a store revision: Machines O8's "unchanged parts retain identity" must hold, or every `useSyncExternalStore` subscriber re-renders per settlement. Snapshot should be the actor's part plus a store revision reference, built lazily;
- frames: 2.10.6 says "Memory is unmeasured; measure before accepting";
- a long drain with no yield. Rule 61 forbids yielding in Stories, and EntityDomains O5 says "production has no cross-turn execution budget", so a 20,000-item repair can freeze a page. Add a time-budget yield in production through a scheduler hook, which in Stories is microtask-only;
- `K = 4096` hops per settle, at 0.72 ms in Chromium per the design, times every step, times `propertyTest`'s runs. 2.10.2 shows the cost is real for a 100,000-deadline `advance`.

---

## 9. How it will realistically go

### 9.1 Rounds

**Round 0, the contract** (no runtime). One index of rules and plan clauses in force, one tiny untyped `compile`, three real machines parsed, the conformance folder started. Will find that literals have holes. A small fraction of round 1's effort.

**Round 1, the thin slice.** My choice for what is in it, and why:

| In | Why |
| --- | --- |
| Two actors, one record, `latest` and `reject` writes with a domain prediction and record queue | Attacks the step signature at once. If per-actor could work, this shows it |
| Unknown → `Held` → `retry`; cancel on the wire | The classifier, rule 18, rule 24, the driver's wrapper |
| Settlement and admission as separate steps | Rule 27 is what shapes the core |
| One trait `.each` with `resetOn`, one writing trait with subject path | The incarnation tangle is the real size; find out early |
| Parking and adoption after a copy removal | The worst subject, on purpose |
| One `every` stream, no `catchUp`: drop, backoff, `missed` | Input classes, credit, T1's table form |
| Capture and `reload`, restored unknown | Immutable capture; O6 ack; measures a capture |
| Minimal Story executor: `send`, `advance`, `hold`, `release`, `drop`, `checkpoint`, `reload` | Stories drive it from day one, the settle meets real Effect |
| SimDriver BFS on the lane plus one machine | Tests whether production-as-model really works |

| Out | Why |
| --- | --- |
| Types, `flow check` | The whole approach |
| `.resumable()`, subroutines beyond a plain one, `allow`, `cancel`, `serialize`'s long queue | Added later, and they should be cheap if the shape is right |
| `catchUp`, `fills`, `latest`, `listen` | The bookmark is its own round |
| SSR, lazy, context | Late; context is checked by reasoning first |
| Answers, conditions, resources' cache | One record is enough to attack atomicity |

Size target: 3,000 to 4,000 lines, core and driver, plus up to 1,000 for executor. **Why not a Counter or a one-actor vertical slice?** Because they pass under every architecture and teach nothing. Your own rule, half a system, means the half with the interactions in it. A slice that can't fail doesn't test anything.

**Round 2, from scratch, one system.** Everything round 1 found, plus store answers, `catchUp` and the bookmark (here S15's fallback gets its real test), subroutines, more Stories, one desk feature converted for real. Expect the world's shape and evidence to change.

**Round 3, the rest of the runtime.** Freeze if kept, `cancel`, context, persistence for real, the `allow` decision.

**Round 4, the outer layers meet it.** A real typed front end replaces the stub; a real `flow check` reads compiled data; the desk and Checkout convert. This is where inside-out pays or doesn't.

**Round 5, and probably 6.** The rewrite after the outside meets the inside. SSR, lazy, React for real, browsers.

So **5 to 7 rounds**, each with a build, 2 or 3 reviews and a mapping of findings. Rounds, not dates, since it depends on usage limits. My gut figure for finishing in 4 rounds or fewer: under 15%.

### 9.2 What will go wrong

- **The driver will be underestimated.** Round 1's first serious bug: a missing completion after an interruption at the wrong moment, leaving a lane `InFlight` forever.
- **The world's type will become a god object.** You will wish for per-subsystem reducers; do that, with explicit reads of others.
- **Tests will pass because they were written with the code.** Mutation is the check.
- **Effect will surprise us.** `Fiber.interrupt` during a finalizer, `Effect.onExit` under the sync scheduler, ordering inside `together`, `Stream.runForEach` with credit. SA RV3 tested minimums, not Flow.
- **The tables will disagree with each other** when run together. Models checked them separately under stated caps; `system.ts` used memory-free handlers. Expect real contradictions between 2.7.13, 2.8.6, 2.9.3 and T3 at the boundaries. This is good: it is why you are doing this.
- **Performance fear will appear before performance problems.** Do not let agents optimize.

### 9.3 What is likely to force a rewrite

- The store's representation (persistent map or versioned mutable).
- How a closure's identity and a compiled reference relate, once persistence and HMR meet `orphaned`.
- Input classes turning out to be three, or ordering between "apply now" inputs and the mailbox being wrong for T8 or `settle`.
- Evidence shape, because tests depend on it.
- Any typing result that changes the literal syntax.
- Discovering that `publication` needs to cover more than one actor's turn for context.

### 9.4 Where agents will fake things

From this repo's history and the rewrite's code, I would watch for:

| Fake | How to catch it |
| --- | --- |
| Injecting an ending in a test (forbidden: W12) | Lint: tests may use only fakes and lifecycle steps |
| `if (isStory)` or a test seam in core | Lint: core imports nothing from Effect runtime modules; no such flag exists |
| `Held` as a boolean with a `status` field beside it | Lanes read only through table cells |
| "Cannot occur" cells implemented as no-ops | They must raise an issue (2.10.15), and BFS looks for it |
| Settling with `setTimeout` or sleeps | Sentinel from 2.10.2; a grep |
| Persistence stubbed to a `Map` with instant acks | `Fake.storage` holds and drops must reach every O6 path |
| Restoring by re-running | Persistence O4; check `initial` is not called |
| Tests that assert evidence words rather than behaviour | Oracles; mutation |
| Reporting "all cells covered" by tests that reach but do not check | "Coverage says reached, not checked" (2.10.14); mutation |
| Compiled literals by hand | No such file allowed (6.3) |
| Defensive code against impossible input | Review line budget; the `captureReflection` lesson |
| Long comments restating a table | Tables are data |
| Claiming verification from a partial run | `nub run verify` applies here too |

Use one Opus reviewer per round per AGENTS.md, and ask specifically: *name the feature here that is faked or a hack.* From-scratch agents get the problem and findings, not the previous code, so they do not inherit its assumptions.

### 9.5 What would make me abandon an approach

For **A**, in order:

1. The driver passes 1,500 lines or a third of core-plus-driver, without having done anything exotic. Then the core is not really absorbing the complexity.
2. A wait state keeps needing `Effect`-like combinators in the core: timeouts composing, racing, retrying. I would then be rebuilding Effect in data.
3. BFS on real code can't get past depth 4 under 2 GB even on a tiny alphabet. Then its main benefit is gone; drop to random walks and ask whether purity is still paying.
4. Turns on a desk-sized world exceed about 2 ms at the median after obvious fixes. Go to C's internals behind the same interface.
5. Agents can't keep the core's `step` tidy across two rounds.

If 1 and 2 both fire, go to A′ or B for sessions and keep the world for actors, lanes and the store.

For **the bookmark**: one more High, and S15's fallback applies, as you already decided.

For **the budget**: if core+driver is at 10,000 before round 3 is done, stop and cut design.

### 9.6 Three scenarios

**It goes well.** Round 1 lands at 3,500 lines. BFS finds two real table contradictions in days. Types spike goes fine on `Fragment.O`. The context claim holds. Round 2's rewrite is shorter than round 1's plus additions. Round 4 converts a desk feature with small changes. 5 rounds, core about 7,500, total about 14,000. `.resumable()`, `allow` and the rebase are cut, with no complaints. You have a checkable kernel and tables that are executable and coverage-counted.

**It goes badly.** The driver dominates; interruption and microtask scheduling give nondeterminism in Stories that takes rounds to chase. Round 2 finds the bookmark's fourth High; round 3 finds the store's answers need a real dependency structure. Typing `Fragment.O` fails in round 4 and reshapes fragments, so two rounds are lost. Reviews keep finding Highs because each finding is a new special case. 8+ rounds, 15,000 passed, you are tired and the prototype's lessons are the main output. Still useful, but not a product. The warning sign to watch: **Highs per round not dropping by round 3.**

**The design turns out too big.** I give this about 35 to 40%, and it would not be a failure of anything but scope. Signs: procedures for lifetimes keep growing; the rule count needs another round of amendments; agents can't hold it; no story can explain a hold to a new user. Then what is the kernel that keeps the design's value? My proposal:

| Keep | Drop or defer | Saves [estimate] |
| --- | --- | --- |
| Three channels, `Outcome`, Attempt, holds with `reject` and `latest` | `allow`, `cancel`, `serialize`'s queue | 300–500 |
| Late endings, rule 14, 15, 16, 17, 18 | key-less addressing beyond own Attempt | 50–100 |
| Fragments: traits and subroutines, `.each`, `resetOn` | `.resumable()`, operations in nested fragments | 300–600 |
| Runtime-owned lanes, adoption by the same identity | subject paths and `Held (parked)` for a fragment's lane; fragments own reads only | 300–500 |
| Domain store with predictions and queues | rebase, `many` keys, merge 5's richer conditions | 300–600 |
| `every` streams with reconnect | `fills`, `latest` as a separate table, `listen` coverage | 300–500 |
| Stories with the common tier | `suspended`, `nth`, `duplicate`, tabs beyond `reload` | 500–1,000 |

That is roughly 2,500 to 4,000 lines less, and it removes rules 48, 51, 52, 53's fragment half, 55, 56, 59, 60, and much of 2.9. Since **operations in fragments is the largest single source of case-by-case rules**, it is the first cut I would put to you if things get heavy. That cuts against recent work and against F1, F3 and F9, so I say it with hesitation and leave it as a question (Q7).

---

## 10. Questions for you

All proposed. Reply `Q1 A` style. Each is a real choice; my pick is marked.

### Round 1: the shape

**Q1. What is the unit?**

- A. The world step; the turn is one kind (**recommended**).
- B. The turn, per actor; shared things behind an interface called inside it.

```ts
// A                                                        // NEW, internal
step(world, { k: "settled", attempt, send }, now, ids)      // no turn; store and queue, one publication
step(world, { k: "turn", actor }, now, ids)                 // admit, plan, commit
// B                                                        // NEW, internal
step(actorState, ending, { store, lanes })                  // store is mutated or asked mid-turn; atomic cut by convention
```

Recommendation A: rule 28 and rule 27 cannot be stated in B's terms without a lock.

**Q2. In what order do two ready actors take turns? The design does not say.**

- A. One Runtime FIFO over all arrivals, tagged by actor; head insertions per actor stay at the head of that actor (**recommended**).
- B. Round-robin in actor creation order, each with its own FIFO.
- C. Drain one actor fully, then the next.

```ts
// A: arrival order: [a1, b1, a2]  → a1, b1, a2.   Actor-head insert x on a: a1, x, b1, a2
// B: a1, b1, a2  (here equal);  [a1, a2, b1] → a1, b1, a2
// C: [a1, b1, a2] → a1, a2, b1
```

A matches what a user would expect and is what you would get in production anyway. It needs a design amendment to 2.10.17.5.

**Q3. Does `send` run the turn before it returns?**

- A. Yes when the loop is idle; queues when called during a step (**recommended**).
- B. Always later, on a microtask or fiber.

```ts
// A                                                  // existing: send
actor.send(E.Typed({ text })); actor.getSnapshot().memory.text === text   // true
// B
actor.send(E.Typed({ text })); actor.getSnapshot().memory.text === text   // false until a later tick
```

A controlled text input that updates asynchronously loses the caret [memory]. B is what fibers give you. A costs reentrancy care.

**Q4. Sessions (T1): in the core, or fibers with local state?**

- A. In the core, as table data (**recommended**, about 65% confidence).
- B. Fibers with local `Ref`s; publish through steps.

`before` is the design's table as written; A keeps it executable and counted; B reads better but loses exploration of drop and reconnect orderings, and two state owners return.

### Round 2: scope of the first slice

**Q5. Budget.**

- A. Three budgets: core+driver 8,000 stop 10,000; Stories 3,000 stop 4,500; types, API and check measured later (**recommended**).
- B. Keep runtime 6,500, shipped 10,000, stop 15,000.

**Q6. First slice contents.** A. As in 9.1, including two actors, the store, a writing `.each`, parking, one stream, reload (**recommended**). B. Smaller: one actor, write lanes, schedules, Stories; store and fragments in round 2. B gives quicker confidence and does not test the things that decide the architecture.

**Q7. Which design items do I leave out of the prototype entirely, and raise for decision after round 2?**

- A. `basedOn` rebase, migration by key equality, `allow`, `.resumable()` (**recommended**: out now, not removed from the design).
- B. Add operations in nested or `resetOn` fragments, meaning subject paths are out too.
- C. Nothing: build all of it eventually in the order given.

```ts
// A: dropped from prototype                      // existing: all of these
.each({ of, max }) keeps writes                   // stays
T.resumable(), concurrency: "allow"               // not built yet
// B: also                                        // not built yet
whenAbandoned: [O.put.cancel]                     // existing, F9
```

**Q8. An index before round 1?**

- A. One short index of rules and `.plan` clauses in force (**recommended**), not a new design, read-only over both.
- B. First write the owed `.plan` amendments.
- C. Neither: let round 1 find it.

B is more correct but a lot of work against what is, by your own view, a design that code will now change. I would apply the plan changes after the prototype settles.

### Round 3: correctness

**Q9. Test machinery in the first slice.**

- A. Conformance folder, SimDriver BFS, table mutation, oracles from day one (**recommended**).
- B. Stories only, then add search in round 2.

Search in round 1 tests the thing that most justifies A. If it does not work, you should know first.

**Q10. A type spike beside the rounds?**

- A. Yes, small, separate, starting with `Fragment.O`, key-less members and `R` (**recommended**).
- B. No, wait for round 4.

A protects you against your inside-out bet's one known large risk. It costs tokens against a usage limit.

**Q11. Local actor lanes.** Under OD20 a remounted local actor with equal input adopts lanes; an input-free machine adopts any.

- A. Keep, as written.
- B. In the prototype, local lanes are not adopted: they stay as Runtime records that finish silently to evidence, and a hold on a local actor is just lost (**recommended for the prototype**).

```ts
// A: wizard unmounts holding a save; a new wizard mounts → receives unknown { Restored }, from a stranger's save
// B: new wizard is fresh; the old save lands as evidence. Stated limit, as G4 already states for reload
```

B contradicts your OD19 and OD20 for one case. It is a bet, not a claim, and easy to reverse.

---

## What I did not verify

- **Nothing compiled.** No sketch was type-checked. Some Effect API names in sketches are from reading the rewrite and running two benchmarks; others may be off.
- **The rules are read properly; other sections less so.** I read 2.4, 2.5, 2.7.1–2.7.2, 2.7.7–2.7.8, 2.7.12–2.7.15, 2.8.3–2.8.13, 2.9.1–2.9.5, 2.10 intro through 2.10.3, 2.10.6, 2.10.9–2.10.12, 2.10.14–2.10.17, 2.11 through its tables, and section 7. I skimmed or skipped 2.7.3–2.7.6 tails, 2.7.9–2.7.11, 2.8.1–2.8.2, 2.9.6, 2.10.4 (the fakes' text), 2.10.5, 2.10.18, 2.11.12–2.11.14, section 3, and most of the Decisions list.
- **`.plan` files.** Runtime in full; Machines O3, O8, part of O1; Persistence O2, O3, O4, part of O6; others by outline. The claims in 5.7 about their size rest on that.
- **The rewrite was sampled, not read.** Line counts and greps are exact; the claim about what lines were for is a judgement from file names, headers and samples. `lineage-trie.ts` and `context-coordinator.ts` may hold requirements my 100–250 estimate misses.
- **Corpus counts** are greps, including comments and tests, over code written for coverage and never run on Flow. `listen` and `history` counts collide with other words.
- **Every line estimate** is an estimate; nobody has built this. **Measurements** are one run on Node 24 on this machine. No Chromium, no phone, no real world in a turn benchmark.
- **The stratification in 3.3** is hand-checked for acyclicity against rule 22 and 2.5 only.
- **"No order between actors in a Runtime" is from targeted searches**, not a full read. 2.10.4 and the Stories records could say it. Check before amending anything.
- **Secondary sources** for FoundationDB; Esterel's causality from search summaries of papers, not the papers themselves; the Lustre and TEA details from memory.
- **Percentages are my judgement**, not calibrated numbers.

## Sources

Verified tonight, for the claims marked [verified]:

- [Erlang `gen_statem`](https://www.erlang.org/doc/apps/stdlib/gen_statem.html): `next_event`, `postpone`, state enter, zero-time timeouts.
- [W3C SCXML](https://www.w3.org/TR/scxml/): microstep, macrostep, internal queue, conflicts, `<invoke>` after the macrostep.
- [Writing I/O-free protocol implementations](https://sans-io.readthedocs.io/how-to-sans-io.html): sans-IO.
- [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore): immutable snapshots, blocking fallback.
- [Temporal versioning docs](https://docs.temporal.io/develop/python/workflows/versioning): replay, nondeterminism, patching.
- FoundationDB simulation, secondary: [slides](https://www.slideshare.net/slideshow/deterministic-simulation-testing/39333008), [HN quote](https://hn.nuxtjs.org/item/22382066), [a Go port's docs](https://pkg.go.dev/fdb.dev/pkg/dst).
- Esterel causality: [Tardieu and Edwards](https://www.cs.columbia.edu/~sedwards/papers/tardieu2005approximate.pdf), [Edwards's notes](https://www.cs.columbia.edu/~sedwards/classes/2002/w4995-02/esterel.pdf), [Uni Bamberg report](https://www.uni-bamberg.de/fileadmin/uni/fakultaeten/wiai_professuren/grundlagen_informatik/papersMM/report-13bc-ofu-final.pdf).
