# Review 1 of the runtime architecture discussion

**Status: spent (2026-11-07),** with the discussion it reviews; the prototype rounds answered it. The original status
read: proposed. Advice to the coordinator and the owner. Nothing here is decided.

## Step 1: written before opening discussion.md, not revised afterward

Read at this point: machine-design.md header, 2.1, 2.4 (all rules), 2.5, 2.7.12, 2.7.13 to its policy table, 2.8.13, 2.11.11
(tables), and `Runtime.plan`. I had not opened `runtime-architecture/discussion.md`. I knew only what the brief says about it,
including that it floats "one deterministic step over the world" and five architectures A-E.

### 1.1 The core problem

The state machine is not the hard part. A turn is a rule evaluation on one thread, and a good implementer could write 2.5 in
a week. The hard part is this:

**Make atomic, ordered, inspectable decisions about long-lived external work, so that every fact about that work survives its
asker leaving, the page reloading, and the process dying, and no reader ever sees a torn state.**

Evidence from the design's own weight: 2.5 is about 130 lines. 2.7.13 is about 360 lines, and streams' tables are about 170 dense
ones. What the rules protect is rule 8 (no delivery lost), rule 17 (each commit ends once), rule 21 (the lane), rule 27
(settlement then admission), rule 38 (ack before invocation), rule 44 (a hold outlives its actor), and Runtime O4 (one cut).

Stated in another field's words, the design is a **small transactional system**:

| Design word | Database or distributed-systems word |
|---|---|
| turn | transaction, serial per actor |
| step 5 validate, `InvalidTurn` | abort, with no effects |
| "invoked after the turn" | transactional outbox |
| Persistence O6 ack before first send (rule 38) | write-ahead rule: log before the effect |
| `unknown`, `Held` | in-doubt participant holding a lock |
| `retry` with the same id | recovery by idempotent redo |
| restore row | crash recovery: analysis, then redo or in-doubt |
| parked ending | durable inbox |
| one publication, one cut | snapshot read view at a commit version |
| evidence list | the log |

And it also has a **second, different shape** that the first does not describe. Step 6 and rule 22's "after" reads are mostly
**desired state compared with actual state**: `keys`, `restartOn`, `when`, placement selects, `.each` membership, `resetOn` re-check and
`filled` are all functions of after memory and after lanes, diffed against what is running. That is a **reconciler**, the React
or Kubernetes controller shape, and it is level-triggered, while commits and endings are edge-triggered. A runtime that treats both
as "actions a step emits" will hide that distinction and grow case-by-case diff code in six places.

So I expect three subproblems, each with a different right form:

1. **Decide**: a synchronous reaction. It is Harel-style step semantics or Esterel's instantaneous reaction: causality, one state
   changer, refusal.
2. **Reconcile**: level-triggered, from a derived desired set.
3. **Protocols over time**: lanes, sessions, record queues, persistence acks. These are explicit tables with durable state.

Hypothesis to test against the plan: **the plan will over-focus on (1) because the brief pointed at a step, and under-describe (2) and
the recovery half of (3).**

### 1.2 The unit of work

Not "the turn". The design has at least these atomic transitions, and only the first is a turn:

- a turn (mailbox event, steps 1-6);
- a settlement (classify, rule 18, store effects, release queues, queue the ending; rule 27);
- a Runtime step (invocation, `retryCount`, storage refused, unbound ending, dispose; 2.7.12);
- session inputs (T1: `register`, `lose`, frames into `buf`, `settle` at the queue's head);
- persistence acknowledgement and capture;
- context waves (Runtime O5: one update per wave, glitch-free across a diamond).

My unit: **one synchronous transaction over Runtime state, ending in at most one published version, with its effects as an
outbox**. A turn is one kind of transaction. JavaScript gives you the isolation for free as long as no transaction yields, so a global
serial order costs nothing to obtain. It costs something only if it is expressed by copying.

Open points I expect to matter, each to be checked against the plan:

- **Between actors there may be no stated order.** The mailbox is per actor. Rule 61 (Stories) needs a deterministic settle, and Runtime
  O5 needs a wave order. If the order is an implementation accident it will be observable and will break replay.
- **Time and randomness are inputs.** `attempt.id` is random (rule 19), `now` is read in T1, and a function schedule reads time. A
  deterministic transaction must take these as inputs or be seeded.
- **Publication is not the transaction.** A burst of 1,000 `every` items is 1,000 turns (T4) and cannot be 1,000 React notifications.

### 1.3 Architectures I would consider

**X1. Tiny in-memory database: mutable tables, log, read views (from outside the state-machine tradition).** State is tables: `actors`,
`slices`, `lanes`, `attempts`, `sessions`, `timers`, `records`, `queues`. A transaction records its writes (redo or undo) and commits or
aborts. Rejection is abort, and `check()` is a transaction that always aborts. Inspection is a query. Persistence is checkpoint plus
log, and `flow explain` and Story frames read the log. Publication builds an immutable view only of rows changed, only when someone is subscribed.
Strength: no per-step copy, one mechanism for abort, `check`, evidence, persistence and restore. Weakness: mutation discipline is a
correctness hazard. A leaked mutable row is a torn read. An undo log is the sort of machinery that is clever until it has a bug, and
reproducing a failure needs the log rather than a value.

**X2. Pure reaction core plus a level-triggered reconciler.** `react(state, input) -> { state', outbox }` for edge-triggered facts
and `desired(state') -> { timers, sessions, copies }` for level-triggered ones; a driver diffs desired against actual. Immutable
values with structural sharing. Strength: the deterministic core is testable without Effect; schedules, placements and `.each` share one diff.
Weakness: "keyed schedule" and "session release" have ordering requirements (a session waits for a releasing predecessor; T9) that a
naive reconciler loses. The driver is where this bites.

**X3. One table interpreter; lanes and sessions are system machines.** The design already writes lanes, sessions, T4, T5 and T6 as
state-by-input tables. Make `lane` and `session` machines in a synchronous product with the user's machines: one interpreter, tables as
data. Strength: the normative tables and the code are the same artifact, which is checkable and small. Weakness: tables have
procedures and variables (T1's `lose` has many), and the "system machine" framing might force what is plain code into a table DSL.

**X4. Process per lane or session, with Effect fibers or generators as the machine form.** Each lane is a fiber looping over a queue. Natural for
interruption and scopes. I expect this to lose: program-counter state does not serialise, Inspection cannot read it, and rule 17's
restore row and rule 22's after-lanes require reads of state at a point in a turn. Keep it only for the outermost adapter (`Feed`,
commit bodies).

**X5. Keep less in the runtime.** Kernel: mailbox, step, publish, with lanes, store, sessions and persistence as optional modules
that register transitions. Bundle-splits naturally. Also: cut scope. `serialize`, `allow`, `cancel` are stated in 2.7.13 as having no worked
example. `.resumable()`, `subscribe.each` and `Feed.callback`'s fence each carry whole rule families. Whether each is worth its
cells is a question the architecture should force, not assume.

**X6. Datalog or a rule engine.** Tempting because the rules are rules, but too heavy to run on the main thread. Use only as a test
oracle: an independent executable model of the tables that the implementation is checked against. The repo's "lane model" suggests this already exists.

### 1.4 What I would pick, before seeing the plan

X2 with X3's table discipline for the protocols, with X1 as the fallback if measurement says copying hurts. A deterministic transaction
over a value, an outbox for edge effects, a desired set for level effects, and tables as data where a table is already normative.

### 1.5 The first slice I would demand

Not a turn. The hardest interleaving end to end, on a phone-sized CPU budget: **commit -> ack -> invoke -> settle -> store publish ->
late admission -> reload in doubt -> `unknown { Restored }` -> retry with the same id**, plus one `every` stream burst at 1,000 items for
the publication question. If that holds, the rest is table entry. If the first slice only runs turns, it proves the easy part.

### 1.6 Things I predict a plan will miss

1. The reconciler shape (above).
2. Recovery treated as a first-class path rather than an afterthought in a table row.
3. Publication coalescing and a tearing check against React concurrent rendering.
4. Source mapping from compiled data to author code in every error.
5. An independent oracle: if the runtime and `check()` and the model share the step, then a bug in the step is invisible to all three.
6. Whether the cost of a mistake in a fake or in a table can be seen at all: mutation testing of the tables.
7. Whether the design itself should be cut before any runtime is built.

---

## Step 2: the attack, written after reading discussion.md

Evidence marks as in the discussion: **[ran]** I ran it tonight (Node 24, Effect 4.0.5, one process, scripts in the session
scratchpad, not in the repo), **[read]** I read it in this repo, **[memory]**, **[estimate]**.

### 2.0 Verdict

**The recommendation stands: one sequencer, one world for actors, lanes and store, tables as data, closures as closures, Effect at
the edge.** I tried to break it on semantics and on cost and could not. The direction survives. Its evidence is weaker than it looks,
its most important code sketch is wrong, its comparison was tilted, and its first slice is too large to be a test.

**My Step 1 was partly wrong, and the plan is better than I predicted.** Of my seven predicted misses, the plan has
the reconciler (2 and 3.3), coalescing (2, 8.5), an independent oracle (7.2 layer 6), table mutation (7.2 layer 3) and the cut (9.6).
My hypothesis that it would over-focus on the step is false: section 3 opens by saying the hard problem is elsewhere. I arrived at the same core as the plan, but I had read the same brief, so that agreement is weak evidence.

| # | Objection | Severity | Against |
| --- | --- | --- | --- |
| F1 | A retry behind its own lane's queued commit waits forever, in the design's own like button. No model composes lane and record queue, and the plan's invariants have no liveness property | **High** (design) | rules 28, 31, 2.8.5, 2.8.6, I1-I15, 5.6's confidence |
| F2 | The completion wrapper, which the plan calls the most important code, loses the completion when interrupted before start | **High**, cheap fix | 3.5, 4.A `invoke`, I4 |
| F3 | "Admit always commits" is false, and "`check()` is exactly `plan`" is false | Medium | 3.3, 3.5, 4.A |
| F4 | An Effect `Schedule` is a mutable closure inside the "pure" step, and the plan's lint forbids what the step needs | Medium | 4.A, 9.4, Machines O5 |
| F5 | A vs B was not a fair fight. The table rows that decide it were chosen after the hypothesis | Medium | 4.B, 4.6 |
| F6 | Nothing on error messages, stack traces or origins | Medium | whole plan; AGENTS.md's third priority |
| F7 | The first slice is half a system, and the conformance folder depends on what it says will be rewritten | Medium | 7.3 vs 7.4, 9.1 |
| F8 | O3 + O6 is real, and the plan names no answer. The storage interface decides it | Medium | 5.4, bet 9 |
| F9 | The estimates compare measured old code to multiplied model code. Abandon trigger 1 will fire | Medium | 8.1, 9.5, 4.6 |
| F10 | One static `step` defeats tree-shaking | Low | 8.4 |

### 2.1 F1: the like button deadlocks

Found by asking my Step 1 question, "what is the wait-for graph?". It is by reading, not by running an implementation.

The text, each clause [read]:

- 2.8.2 and 2.7.8: `setLike` is `latest`. The comment on `Toggle` says it: "a toggle while unsure waits behind the held lane".
- Rule 28: a `latest` commit in `W` "joins and predicts at commit too, and is invoked only once its lane promotes it and it heads every queue it joined".
- 2.8.5: a commit in `W` "can head record r's queue".
- 2.8.6 E7: a retry "joins the record queue behind any newer write". "It joins at the tail."
- 2.7.13: promotion happens only when the addressable Attempt is resolved or released. "an unknown, a retry and a restore never promote".
- 2.7.13 `retry` in `InFlight`: evidence, no re-send. Rule 25: Flow has no timeout.

The trace, on one actor, one lane, one record:

```text
t0  Toggle(true)   A minted, sent. r: [A]
t1  A ends unknown lane Held. Forced repair settles, A leaves the head. r: []
t2  Toggle(false)  B goes to W, predicts, joins. r: [B]              // B waits: lane must promote it
t3  ReconcileLike  O.like.retry: lane InFlight, A' joins at the tail. r: [B, A']  // A' waits: must head r
```

`A'` waits on `B` through the queue. `B` waits on `A'` through the lane. Neither is on the wire, so no ending ever comes.

What the user sees: `pending` true forever, `uncertain` false, so `reconcile.keys` drops the key and its timer stops; `LikeUnsure`'s give-up branch never runs, because no ending arrives; `retryable` denies `InFlight`. Record `r` is blocked for every actor (the "stated limit" in 2.8.5, now unbounded). Only a reload clears it. A machine that has `O.like.cancel` on a user-reachable path can escape; this one has it only inside the handler that will not run.

The same cycle exists across two lanes and two records even if a retry may pass its own lane's `W`: `A'` behind `D1` in r0, `D1` waiting on lane head `D0`, `D0` behind `A2` in r1, `A2` waiting on lane head `A'`. So "skip your own lane's entries" is not the fix.

**Why nothing caught it.** `lane-model/model.ts` has one comment mentioning record queues and no queue; `system.ts` has none [read, by grep]. The plan's 5.6 lists rule 21's table among what it no longer doubts, on the lane model's strength. That confidence holds only for a lane alone. I1-I15 are safety properties, and a stuck state violates none of them, so the plan's BFS would reach this state and report success. Section 9.2 predicts "the tables will disagree when run together"; this is a witness for that prediction, and it should change the first thing built.

Proposed fix and code in 3.1.

### 2.2 The programming-language semanticist

**"One deterministic step over the world": right.** Rule 28 (a domain write joins queues and predicts over others' predictions in one publication) and Runtime O4's cut hold [read]. A per-actor signature cannot state them. The citations of rules 27, 28 and 35 are accurate. The 2.5 claim that step 1 survives a rejected turn is accurate for lanes.

**GALS is the wrong label** (Low). Actors are not asynchronous to each other: a turn reads and writes a store shared at that instant. It is a serial transactional system with a synchronous reaction inside each transaction. The discussion half says so under "Actors". No decision changes, but "globally asynchronous" will mislead an agent. Delete it.

**F3.1: stratum 0 "always commits" is false.** 2.5 step 1 and Streams T3 [read]: a bookmark cell applied at admission is "kept through `Denied`, `Unhandled`; not on `InvalidTurn`, which ends `Defect`". So within one admission, the lane cell survives `InvalidTurn` and the bookmark cell does not. 4.A's `adm.world` holds both, so `published(adm.world, plan.verdict)` is wrong for a delivery. Small fix (3.3), but it is exactly the kind of irregularity 5.4 warned about, and the plan's own table missed it.

**F3.2: "can it refuse? no" at strata 2 and 8 hides two closures with no rule.** `resetOn` and `input` run in stratum 2, and the `resetOn` re-check runs in stratum 8 (2.5 step 6). Machines O3's defect list names guards, updates, action parameters, keys, send payloads, schedules, `restartOn`, activity parameters and `when`, not `resetOn` or `input`. Rule 12 covers "an effect-only read that fails". A throw in the re-check happens after validation, with no way to refuse. Design gap. Move the re-check into stratum 7.

**F3.3: `check()` is not exactly `plan`.** 2.5 [read]: check "mints nothing, joins no queue and predicts nothing", "applies no releasing mark and parks nothing". But stratum 6 of the real plan runs prediction functions (2.8.13). If a prediction throws, the real turn may reject while `check()` said allowed, which contradicts I10 unless a throwing prediction is defined as non-refusing. I did not find that rule. So `planTurn` needs a mode, and there is a real question of whether I10 can hold.

**Rule 22 and the stratification.** I re-checked 3.3 against rule 22 and found no cycle. The plan's order (keys and `when` after lane cells) is also a correct reading of 2.5 step 5, whose list order suggests otherwise. Survives.

**"A single reconcile pass replaces per-rule arm and cancel code"** is half true. `keys`, `when`, `.each` and placement selects are level-triggered. `armOn` and `disarmOn` are edges ("on every accepted listed event"), `restartOn` is an edge of a change, and `Flow.entry` is an edge. Freeze retraction is an edit. Keep one pass for the level half, and do not promise it for schedules generally. Low.

### 2.3 The browser engineer

**Copying a world per step holds, given a persistent map.** I measured it rather than argue [ran; Node, no throttling, one run, payloads synthetic, each actor a 30-key memory]:

| Actors, records | `Map` copy, actors only | `Map` copy, actors + store | Effect `HashMap` both | Mutable with undo journal |
| --- | --- | --- | --- | --- |
| 50, 1,000 | 1.3 µs | 27 µs | 3.7 µs | 0.1 µs |
| 300, 10,000 | 9.4 µs | 448 µs | 4.5 µs | 0.1 µs |
| 1,000, 50,000 | 29 µs | 2,475 µs | 5.2 µs | 0.2 µs |

The desk declares 12 `actorRef` sites [read, grep], so the first row is roughly its size before `.each`. With a 10x phone factor [memory], the persistent world costs about 50 µs per step. **C's mutable advantage is real and does not matter. The plan is right.** One correction: 4.A types all of `World` as `ReadonlyMap`, and the actors and lanes maps must be persistent too, or the column-two cost returns at scale.

**What stays unmeasured, and matters more than the copy:**

1. **The work each turn does per live thing.** 2.5 step 6 re-evaluates every `resetOn`; step 5 evaluates every `keys`, `when`, `restartOn` and `.each` membership. Those are closures, and O(placements) per turn with no dependency tracking. A 1,000-row `.each` with `resetOn` and a keyed schedule, under a stream at 100 items a second, is 100,000+ closure calls a second. It is probably fine on a laptop, and I would not assert it on a phone.
2. **`every` delivers one per turn** (T4). A `buf` of 1,024 after a repair is 1,024 full turns, each with that reconcile. This, not the step, is what may need batching.
3. **Publication.** A store revision changes every actor's cut. The plan's "per drain, lazily built" is right, but no hook design shows that a settlement re-renders only readers of that record. That needs a spike in React, with concurrent features on.
4. **`check()` in render.** Buttons calling `check()` run steps 2-6 per render: a full walk with seeding.
5. **Retention.** A held snapshot pins an old store version through its hidden world reference, and JS cannot see when it is dropped [memory: `FinalizationRegistry` is not timely]. This is also why C's version chains cannot be pruned, which favours A. It should still be measured on a long-lived tab.
6. **Production evidence.** `run.frames` is bounded at 10,000 in Stories. I did not find a production bound for evidence.

No Chromium or phone number exists anywhere in the plan or this review.

**Sync `send` (Q3 A): survives.** uSES plus a sync drain gives the keystroke case. One conflict: 8.5's proposed time-budget yield breaks the Q3 guarantee during a long drain, since `send` then queues across a host task. State that as the rule, because it is observable.

### 2.4 The Effect expert

**A thin driver does not exist, and F2 shows why.** I ran the plan's wrapper shape [ran]:

```text
Effect.forkIn(body.pipe(Effect.onExit(...)), scope), then Fiber.interrupt before it starts:
    body ran 0, onExit ran 0, fiber.addObserver ran 1
Effect.runFork(same):  the body starts synchronously; onExit 1, observer 1
```

So `forkIn` plus `onExit`, the sketch in 4.A and the words "in an uninterruptible finalizer" in 3.5, lose the one completion when a cancel lands before the fiber's first tick: command in one step, `cancel` in the next step of the same drain. The lane stays `InFlight` forever, which is the failure the plan fears, in the code meant to prevent it. It also contradicts rule 25 ("Classification runs outside the fiber it interrupts") by classifying inside it. `addObserver` is the right primitive and it did fire. Fix in 3.2.

The `onExit` shape also runs `pump`, which means user closures and further forks, inside a dying fiber's finalizer. And `Effect.runFork` starting synchronously means a commit body runs inside `exec`, inside the pump. That is fine if every completion queues, and worth a test.

**F4: the Schedule inside the step** [ran, read]. Machines O5 allows `schedule` to be an Effect `Schedule`, and streams have `reconnect.schedule` and `pageSched`. `Schedule.toStep` is an Effect that returns a step function. The same step function with the same arguments gave 1,000 ms then 2,000 ms: **it is a mutable closure.** `Schedule.jittered` also consumed randomness outside the plan's `ids` argument. Three consequences:

- `dueAt` must be published in the arming turn's cut (2.5 step 6, `s.schedules.x`), so the step must run a Schedule synchronously, via `Effect.runSync`. 0.7 µs [ran], so cheap, but 9.4's lint "core imports nothing from Effect runtime modules" forbids it.
- A rejected turn or a BFS branch cannot discard a stepped closure, so "rollback: drop the value" fails here. BFS state hashing cannot see inside it. T1's "step `n`" has the same problem.
- Rule 52 says a recurring schedule "persists and ticks after a reload", and Machines O5 says it restarts at step one. Consistent, but only because the closure cannot be saved.

**Interruption, scopes and Layers.** `Fiber.interrupt`, awaited release and 5 s bounds are one line each in Effect and a state, a command, an input and a timer in the core. The plan counts about 15 such waits and says the design already wrote "almost all" as table states. Checking [read]: ack, queue, capture, wire, cancel, predecessor, connect, page, backoff and idle, yes. **Bootstrap (Runtime O2) and the dispose bound (O6) are prose procedures over services with no table, and nothing reads their inner states.** There is no reason to defunctionalize them. See the criterion in 3.4.

**R channel**: "erased, resolved at Runtime construction" is right [read Runtime O2]. Tracing is not addressed: a commit fiber forked from a pump has no parent span from the click that caused it, and Effect users will expect one.

**"The scheduler is not yours to steer" (4.B) is false.** `Scheduler` and `SchedulerDispatcher` are small replaceable interfaces [read], and rule 61 already injects one. A seeded shuffling dispatcher gives interleaving exploration for fibers, in the stateless style (replay rather than hash). I did not build one. This matters less for B than for A: **it is the tool for the plan's Layer 4**, which currently has no way to reach "interruption at every yield point".

**Driver size.** Invoke, classifier, sessions with credit, T6 with fences, sleep owners and ranks (2.10.17.5), `Context.Reference`, service bootstrap, persistence write ordering, disposal, the scheduler hook, and shared resource requests (Operations O2). I estimate 1,200 to 2,000 lines [estimate] against the plan's 500-900.

### 2.5 The library user and agent author

**F6. Section 4 has a row for "readable at a glance" and nothing for a person whose guard threw.** The plan never mentions stack traces, mentions source maps only as a cost of D1, and says nothing about origins. In a world step the stack is `pump > step > onTurn > planTurn > walk`, reached from a socket callback or a fiber finalizer, and the closure is `guards[2]` of an alternative in a flattened node. Machines O3 requires an issue "naming the callback and path", so `Compiled` must carry it, and section 6.1's list of needed fields does not. Flattening fragments makes it worse: the `.each` copy, the fragment body and the host filling are one node. Types are out of scope too, and `any`-compiled round-0 errors will teach agents nothing.

What the architecture gives back, which the plan undersells: `lane` records naming cells are the best agent debugging I can think of, and a pure step means a bug is a list of inputs. Yet 2 calls an input log "maybe 30 lines. Not now." It is the one user-facing gift of the architecture. Do it in round 1 (3.6).

**Extensibility**: survives. New behaviour comes through contracts and Layers, and the closed `Input` union is not an extension point that anyone needs. New concurrency is a table.

### 2.6 The skeptical project lead

**The size of the design.** 781 KB, 8,524 lines, 72 rules, and a new High (F1) from one evening's reading in the most reviewed area. The plan's 35-40% for "too big" seems low to me; I would say 50% [estimate]. Its 9.6 cut list is the most useful table in the document. It is buried at the end of a scenario.

**F9. The estimates.**

- The High column sums to 10,800, not 10,500 [checked by hand]. Trivial.
- The comparison is apples to oranges: B's 11,000-18,000 anchors on real agent-written production code, and A's 5,800-10,500 on model lines times 1.5-3. The same agents will write A with the same reflexes (`captureReflection`). 8.2 admits the sampling is thin.
- Ratios assumed against old code: evidence about 5x smaller, context about 13x smaller, driver unanchored. Context's 13x is admitted reasoning, with `lineage-trie.ts` not understood. I read its header only; it tracks cuts and debts, so it does look like a real requirement of some kind.
- **My estimate**: 10,000 to 13,000 for core plus driver at full design; 8,000 only after 9.6's cuts [estimate, no better founded than the plan's]. So Q5 A's stop at 10,000 will fire around round 3, which is fine if it is obeyed.
- **The rule counts sum correctly (75), and the categories flatter.** Rule 7 ("one turn") is filed as a law, though it is 2.5, the largest procedure. 28 and 38 are laws that are also procedures. T1 is "a table" that calls seven named procedures. "Only 21 need procedures" is rhetoric. "1 driver rule" is an artifact of filing: rules 24, 61 and 69, the 2.7.1 classifier and Persistence O6 all land in the driver.
- **Abandon trigger 1 (driver past 1,500 lines) will fire by my estimate without anything being wrong.** Then either it is ignored, teaching that triggers are soft, or it causes a bad rewrite. Use a third of core-plus-driver alone, or a defect measure.

**F7. Will the prototype really be thrown away?** The plan has the right rule ("starts empty") and one weakness:

- 7.3 says each invariant "becomes `(world) => violation | undefined`". 7.4 says what survives must speak only the design's vocabulary, and 9.1 says "expect the world's shape to change". These contradict. Likewise counterexample traces survive only if the `Input` alphabet does, and that is internal.
- `SimDriver`, the executor and `compile` are in round 1. Real pressure will carry them, and with them the world's shape.
- Rounds are graded by green tests and Highs, not by what was learned.

**The slice is not thin.** 3,000-4,000 lines of core and driver, up to 1,000 of executor, 300-500 of compiler, plus SimDriver, BFS, mutation and conformance. That is 5,000-6,000 lines before any answer. The argument against a Counter is right; the choice is not only Counter or half-a-system. Each question it asks can be answered by a much smaller adversarial spike first (3.5). F1, F2 and F4 are evidence: all three appeared in about one evening of reading plus a 60-line script.

**Rounds 5-7**: believable as a count, not as a plan to finish; the condition is usage limits. It gives no statement of what happens if the owner stops at round 3. There should be a shippable subset at each stop.

### 2.7 Were A-E a fair fight?

**D and E: fair.** D1's costs are real and dispatch is not the bottleneck. E's wall is real for lanes because a lane cell must apply inside the turn. The strongest E is a synchronous product of tables in one step, which is what A already is, and the plan says so. A fair D is compile-to-closures with no build step, which adds nothing for now.

**C: nearly fair.** The sharp argument, that `check()` on an old snapshot needs a copy, is correct and stronger than stated: version chains cannot be pruned without knowing when a snapshot dies. C's real form is "transient mutation inside a step", already kept as an option.

**B: a strawman in the row that decides it.** 4.B wraps the turn in `runtimeLock.withPermits(1)`, and 4.6 scores "atomic cut: global lock". No competent author writes this. A synchronous turn in `Effect.sync` does not yield, so it is atomic on one thread with no lock. "The concurrency is fake" applies to A's own cross-actor story as well. The state-owner and interleaving rows are fair; "explore interleavings: impossible" is not (2.4). B's sessions also carry the plan's own example with `Stream.retry`, then concede it dissolves.

**The strongest runner-up, B\***: one thread, synchronous turn over one shared persistent value; **fibers hold every wait whose state nothing observes**; a mailbox wake-up per actor or per Runtime.

```ts
// B*. NEW, internal. Same contracts as 4.0. No lock, because a sync turn cannot interleave.
const onSettle = (a: Attempt, exit: Exit.Exit<unknown, unknown>) => {    // called from an observer
  world = settle(world, a, classify(exit, a))                            // rule 27, in one sync call
  wake(a.actor)
}
const actorLoop = (actor: ActorKey) => Effect.forever(                   // one fiber per actor
  waitForMail(actor).pipe(Effect.andThen(Effect.sync(() => {             // existing: Effect.sync
    world = turn(world, actor)                                           // the same pure-ish function as A
  }))))
```

Against this, A's remaining advantages are exactly two: **sync `send`** (the fiber wake is a later task, so Q3 A is unavailable) and **a fixed order across actors** without a custom scheduler. Both are real. B\* then adds a single `pump` to get them, and has become A with a different set of commands. **So the true decision is not actors vs world. It is where each wait lives.** That is Q4 with a broader reach, and the plan treats it as a side question at 65%.

**Then does A′ (sessions as fibers) beat A?** I tried to make it win, because T1's private variables (`n`, `flaps`, `stalls`, `liveSince`, ...) are not published or persisted [read T1, T3, T9]: only `connection` and `catchingUp` reach the row. **It does not win today.** T1's `connect`, `register` and T2 read `filled`, whether the memory field is empty, and write the bookmark at once as Runtime steps; T3 ties it to admission and turn ends. A session reducer needs the world on each signal. The plan's reason survives, for a sharper reason than it gave: **the bookmark is what entangles T1 with the world.** And so bet 2 and Q4 are linked, which the plan does not notice: if `fills` falls back (45%), the fiber form gets much better. Q4 should be decided after the bookmark round, not before.

**Did the brief's hypothesis anchor it?** In framing, yes; in conclusion, I cannot tell. Section 3.5 attacks only the hypothesis's *signature*, the option space in Q1 is that signature with one change, and the 4.6 rows (atomic cut, inter-actor order, `check` on old snapshot, explore interleavings) are those a value-shaped step wins. There is no row for debugging, time to a running app, driver defects, bundle shape or recovery. "Keep less in the runtime" is not among A-E; it appears only as a scenario. X1 (database) is approached by C and by "event sourcing: not now".

### 2.8 What the plan missed compared with Step 1

1. **Liveness and a wait-for graph (F1).** The transactional view asks this immediately. Nobody asked it of the composition.
2. **Crash consistency as a design input.** The plan flags O3 + O6 for cost only. See F8 below.
3. **Origins in errors** (F6, my prediction 4).
4. **Module boundaries.** See F10.

**F8. The storage interface decides O3 + O6.** Persistence O1 requires Effect's `KeyValueStore` [read]: `get`, `set`, `remove`, `modify`, `clear`, `size`, no multi-key transaction [read the source]. So "a scope is saved atomically" (O3) over this interface can only mean **one key holds the whole scope, or a commit point written last**. Per-Attempt acknowledgement then encodes up to 16 MiB per persisted click, or needs a journal. This is a textbook write-ahead log, and the design already gives what it needs: rule 46 says lane records decode independent of the machine, and 2.7.13 handles "a lane adopted before the saved record". Consequences not yet considered once records are separate: `Runtime C2` says identities never repeat across restore, but an older actor record has an older counter, so a new activation could reuse an id that a newer lane names as owner, and rule 14's test would say "alive". The journal must carry the counters. Proposal in 3.5 S3.

**F10. One switch, no shaking.** 4.A's `step` statically reaches T1, the store, persistence and every table, so an app using one `transaction` ships all of it. 8.4's 60-75 KB is therefore a floor for everyone, not an average. A contract constructor can bring in its subsystem: `stream()` importing the session table costs nothing architecturally. Low now, expensive to retrofit. Worth one line in the round-1 file layout.

### 2.9 Factual claims I checked

| Claim | Result |
| --- | --- |
| Rule 27, 28, 35, 14, 2.5 step 1 citations | Accurate [read], except the bookmark case in F3.1 |
| No order between two actors in one tab | **Confirmed.** P21 and 2.5 say FIFO without saying across what; Runtime O4 says per actor; 2.10.2 says "Interleaving is fixed" and "the turn that promoted them" implies a global order; 2.10.17.5 orders sleeps. I read those, and did not read every word of 2.10 |
| One `offer`, `take` hop about 15 µs | **Reproduced**: 16 µs as a true round trip through two queues, three runs. [ran] Note the cost is the wake-up: batched offers with a yield every 100 cost 0.37 µs per message. So it is cheap for bursts and slower for credit-per-item, which is T4's path |
| Machines O3 contradicts 2.5 on denied publications | Accurate [read] |
| 75 rules, categories sum | Sum accurate; see 2.6 |
| Totals in 8.1 | Low and the second table correct; High sums to 10,800 |
| Runtime and rule text on T1 variables | Accurate |
| Lane model confidence | Scoped too widely: F1 |

Sections it skimmed, which I read because conclusions lean on them: 2.7.1 (first half), 2.8.4-2.8.6, 2.8.13. **I did not read** 2.7.3-2.7.11 beyond greps, 2.8.1-2.8.3, 2.9.6, 2.10.4-2.10.5, 2.10.18, 2.11.12-14 or section 3, so I cannot confirm or refute the plan's "operations in fragments is the largest single source of case-by-case rules" beyond counting rules 48-60.

### 2.10 The 5.6 bets

Right in my judgement: 1 (rule 43, strongly), 3, 4, 5, 9 (and F8 says which way: a journal). 7 (rebase) is plausible, and has no test either way. 2 and 10 I cannot judge without building. 6 is plausible. 8 is trivial.

**Missed**, proposed as bets to hold after round 2:

| Bet | Rule | Odds [estimate] |
| --- | --- | --- |
| E7's tail, or rule 28's join at commit, changes | 28, 31 | 85%. F1 |
| Effect `Schedule` is restricted, or stepped only by the driver | Machines O5, T1 | 55%. F4 |
| `every`'s one-item-per-turn gets a batch form for a repair's `buf` | 67, T4 | 40% |
| `check()` does not hold I10 for a throwing prediction, and I10 is narrowed | 2.5, 28 | 50% |
| Rule 1's restore-time re-taken `resetOn` is cut with `.resumable()` | 1, 51 | 40% |

---

## Step 3: proposed updates

All proposed. Marks per AGENTS.md. Everything below is internal except 3.1's behaviour.

### 3.1 Fix the wait graph, with one rule (design change, F1)

**Before** (E7): a re-send joins at the tail. **After:** every record queue is ordered by Attempt mint order, not by join order, and a re-send keeps its Attempt's place, behind only what is on the wire.

```ts
// store.ts. NEW, internal. Attempt ids are random (rule 19), so `seq` is a separate mint counter.
type Entry = { readonly attempt: AttemptId; readonly seq: number; readonly onWire: boolean }   // NEW: seq

const join = (q: ReadonlyArray<Entry>, e: Entry): ReadonlyArray<Entry> => {   // start or re-send
  const wire = q.filter((x) => x.onWire)                                      // at most one per record
  const rest = q.filter((x) => !x.onWire)
  return [...wire, ...[...rest, e].sort((a, b) => a.seq - b.seq)]             // CHANGED: was [...q, e]
}
```

```text
t3  ReconcileLike  A' keeps seq 1. r: [A', B]. A' sent. Success: promotes B. B sent.  // the like button finishes
```

Why it is enough: a lane wait points from younger to older, a queue wait points from younger to older or to an on-wire Attempt, and an on-wire Attempt waits on nothing. So the wait-for graph is acyclic. **This is timestamp ordering, a standard deadlock-prevention technique, not a new idea** [memory]. The rule is one sentence, and it replaces E7's "tail" and `behind any newer write`.

Dropped: E7's "behind any newer write". Added: `seq` on Attempts, kept across retries and persisted. Unchanged: "its response takes the position of the Attempt's first send" and contested fields. Changes behaviour: an older retry now overtakes a newer never-sent write of another actor, which matches the order the user acted in. A superseding `latest` commit mints a new, younger `seq`. Stated limit remains: a `W` entry heading `r` still blocks others while its lane is held (rule 28), now only for as long as the hold, not forever.

**Settles it (S1):** a model of lane plus record queue with the wait-for check, about 150 lines, BFS. It should reproduce the stuck state under tail-join, and find none under `seq` order. If the model finds a cycle under `seq`, I am wrong about the proof.

**Add invariant I16: the wait-for graph over Attempts, lanes and queues has no cycle, and every `InFlight` waiting Attempt's blockers can finish without a machine action.** Without it, BFS reports a stuck world as a pass. Port the same check to streams (predecessor release) and persistence (capture waits).

### 3.2 Replace the completion wrapper (F2)

```ts
// driver.ts. NEW, internal. Same source as 4.0: commit calls fetch through a service.
const invoke = (c: Invoke) => {
  const fiber = Effect.runFork(                                          // existing. Starts synchronously [ran]
    ops[c.op].commit(c.attempt.input, ctxOf(c.attempt)),                 // existing: commit
    { scheduler })                                                       // Stories' sync scheduler (rule 61)
  fiber.addObserver((exit) =>                                            // existing: Fiber addObserver. Outside the fiber: rule 25
    input({ k: "settled", attempt: c.attempt.id, send: classify(exit, c.attempt) }))  // queues if a step is running
  fibers.set(c.attempt.id, fiber)
}
```

Dropped: `forkIn` plus `onExit`. Added: `Runtime`-owned fiber set, interrupted at disposal under O6's bound, since no `Scope` now owns them. Not verified: scope ordering at disposal, or `runFork`'s `scheduler` option spelling. **Settles it (S2):** a driver test with a shuffling `SchedulerDispatcher`, interrupting at each dispatcher step, 200 lines. It must show one completion for every run. Also run the plan's sketch through it and watch it fail.

### 3.3 Correct the admission stratum (F3)

```ts
// turn.ts. NEW, internal.
const onTurn = (w: World, actor: ActorKey, now: number, ids: Ids): Out => {
  const item = headOf(w, actor)
  const adm = admitLane(w, actor, item)                                  // CHANGED: lane cell, promotion, map, owner. Always kept
  const withMark = applyBookmark(adm.world, item)                        // NEW: T3. Kept on Denied, Unhandled; not on InvalidTurn
  const plan = planTurn(withMark, actor, adm.event, adm.from, now, ids, "commit")  // NEW arg: "commit" | "check"
  if (plan.ok) return commit(withMark, plan)
  if (plan.verdict._tag === "InvalidTurn")                               // rule: T1's InvalidTurn row
    return endSession(published(adm.world, plan.verdict), item)          // the bookmark did not move; session Defect
  return published(withMark, plan.verdict)
}
```

Also: move the `resetOn` re-check into stratum 7; ask the owner what a throwing `resetOn`, `input` or prediction function does, as a new question Q14.

### 3.4 One criterion for what is reified (F4, F5)

**A wait or a value lives in the core only if a rule makes it observable: a guard, a row, Inspection, persistence or a Story address. Otherwise it lives in the driver, as an ordinary Effect.**

| Item | Where | Why |
| --- | --- | --- |
| lane waits, record queues, acks | core | rows, rule 28 |
| T1 states and variables | core, for now | bookmark entanglement; revisit with bet 2 |
| bootstrap, dispose bound | **driver, changed** | nothing observes inner states |
| `Schedule` step closures | **driver, changed** | not a value; cannot be discarded or hashed |
| shared resource request | driver | Operations O2 |

For schedules, the core holds `{ dueAt, firing }` and the driver holds a stepper:

```ts
// NEW, internal. Machines O5's source: user-defined Schedule or Duration.
type ArmedSchedule = { readonly dueAt: number; readonly firing: number }   // in the world
type Steppers = { readonly first: (s: ScheduleSpec, now: number) => number // sync, new stepper per arm; discarded on rejection
                  readonly next: (t: TimerId, now: number) => number | "done" }  // only when a firing is admitted
// A firing's input carries its next dueAt, computed before the step. Kept with admission, as a lane cell is.
input({ k: "fired", timer, next: steppers.next(timer, clock.now()) })
```

The core stays pure by passing `Steppers` beside `ids`. The lint in 9.4 stays. Jitter's randomness uses the seeded source (Effect's `Random` reference, not verified). BFS treats `next` as an input, which it already is.

### 3.5 Run falsification spikes before the slice (F7, F9)

Replace "round 1 is 5,000-6,000 lines" with **round 0.5: five spikes, each under 400 lines, each able to prove the plan wrong, throwaway by construction**. One process at a time.

| # | Question | Spike | It proves the plan wrong if |
| --- | --- | --- | --- |
| S1 | Is the composition live? | Lane + queue BFS with wait-for (3.1) | no stuck state under the current rules: I misread |
| S2 | Is one completion achievable? | Shuffling dispatcher over the wrapper (3.2) | a completion is lost under `addObserver`, or the dispatcher can't reach it |
| S3 | What does persistence cost? | Encode a desk-sized scope; compare a whole-scope write per commit with a journal on real IndexedDB in Chromium: per-Attempt key written before invoke, restore = last scope + journal entries newer than its `seq` | whole-scope is under about 5 ms at 1 MiB on a throttled profile (then no journal), or restore tears |
| S4 | Does the turn hold on a phone? | The stepping loop with a synthetic 1,000-row `.each` plus keyed schedule, closures as real functions, a stream at 100 items/s, in Chromium with CPU throttle 6x, plus a React tree of 200 uSES subscribers | median turn over 2 ms (the plan's own trigger), or a settlement re-renders unrelated rows |
| S5 | Does T1 need the world? | T1's `connect` and `register`, both forms, 1 afternoon | the fiber form is shorter and no bookmark read blocks it: Q4 flips |

S1 changes the design regardless. If S4 fails, go to C's insides behind the same `step`. Budget: these five are smaller than the plan's compile alone plus executor.

**Then a narrower round 1.** Keep: two actors, one record, `latest` with retry, unknown, reload, one `.each` writing trait, and Stories as the driver. **Move to round 2:** the stream, and `resetOn` subject paths. Reason: T1 is the largest table and is entangled with the bookmark, which the plan already put in round 2, so one `every` with no `catchUp` tests little of T1. S5 covers the architectural question now. Keep the plan's rule that a slice must be able to fail.

**Conformance speaks only public words.** Change 7.3:

```ts
// conformance/no-double-charge.test.ts. NEW. Reads only Story output, so it survives a rewrite of the world.
const run = await Story.run(paySmallWorld)                                // existing: Story
expect(run.world("payments").charges.filter((c) => c.key === attemptId).length)  // user-defined fake truth
  .toBeLessThanOrEqual(1)
```

`(world) => violation` invariants stay, marked disposable, one folder per round. They are for BFS and not carried. Traces are carried as Story data (2.10.1) rather than `Input` lists.

**A round ends when its named questions are answered**, in writing with a witness, even if tests are red. **And state a shippable stop at each round**: the 9.6 keep column, in order, so that stopping at round 3 still leaves a coherent system.

**Budgets.** Keep Q5 A's three budgets. Change abandon trigger 1 to "driver over 35% of core plus driver, or more than one lost-completion bug after S2". Fix 10,500 to 10,800. Say plainly that my median is above 10,000 for the full design, so Q5's stop line means 9.6's cuts are the expected path. Those should be asked now, not at the stop.

### 3.6 Origins and the input log in round 1 (F6)

```ts
// compiled.ts. NEW, internal. Replaces bare closures in 4.A's Alternative.
type Slot<F> = {
  readonly run: F                                                         // the author's closure
  readonly at: {                                                          // NEW
    readonly definition: string                                           // "Checkout"
    readonly path: string                                                 // "traits.reconcile.callbacks.onTick[0].guard[1]"
    readonly placement: string                                            // the fragment instance before flattening
  }
}
```

`compile` already walks that path, so this costs about nothing. Every `InvalidTurn` and issue prints `at` and the input that caused it. It is also what Machines O3 demands. And **add the input log**: a dev-only ring buffer of `(input, now, ids)` with `flow explain --replay`. If the plan's purity claim holds, this is 30 lines, and if it does not replay, the purity claim is false, so it doubles as a check on I14 from day one.

Add a row to 4.6, and to every later comparison: **"A guard threw at 2 am: what does the person see?"**

### 3.7 Changes to section 10's questions

| Q | Proposed change |
| --- | --- |
| Q1 | Stands, A. Drop B's strawman wording; the real alternative is B\* (2.7), which converges on A plus a question of where waits live |
| Q2 | Stands, A. I confirm the gap. It is cheap: amend 2.10.17.5 and P21 |
| Q3 | Stands, A. Add: during a production time-budget yield, `send` queues |
| Q4 | **Change: defer until the bookmark round.** Default A meanwhile. Linked to bet 2; S5 informs it |
| Q5 | Stands, A, with 3.5's trigger change |
| Q6 | **Change: a third option, C.** Spikes S1-S5, then the narrowed slice. Recommended |
| Q7 | Stands, A. Recommend asking B's cut (fragment writes out) after S1, as 9.6 suggests, because subject paths are the costliest item left |
| Q8 | Stands, A |
| Q9 | Stands, A, with I16 added and BFS's invariants marked disposable |
| Q10 | Stands, A |
| Q11 | Stands, B |
| **Q12, new** | **Accept timestamp order for record queues (3.1)?** A: yes, after S1 (recommended). B: W does not join until promoted, which breaks 2.8.5's prediction order. C: keep tail, add a timeout, which breaks rule 25 |
| **Q13, new** | **Where does an Effect `Schedule` step?** A: driver, with `Steppers` (recommended). B: restrict `schedule` to Duration and function, dropping Effect Schedule (simpler, loses the promise in Machines O5). C: `runSync` in the core, dropping the lint |
| **Q14, new** | **A throwing `resetOn`, `input` or prediction function?** A: `InvalidTurn`, computed before commit, and `check()` runs predictions in dry form too (recommended, keeps I10). B: an issue, the part is skipped |

---

## What I did not verify

- **F1 is by reading.** No implementation or model was run. I checked for a contrary clause with targeted greps and read 2.7.13, 2.8.4-2.8.6 and rules 28-31, but did not read every word of 2.8.2, the merged entity files, or `open-items.md` in full. Someone could hold an unstated intent that a `W` entry doesn't block its own re-send. The text says the opposite.
- **The timestamp-order proof** is a hand sketch over the wait kinds I listed. Streams, captures and adoption waits are not in it. S1 tests only lanes and queues.
- **Measurements:** Node 24 on this MacBook, one process, synthetic payloads. No Chromium, no phone, no React, no real closures per turn. The 10x phone factor is from memory, as is the plan's.
- **Bundle numbers in 8.4**: not re-run. Fibers' memory numbers: not re-run.
- **The `addObserver` run** covers one interleaving by hand. `runFork`'s `scheduler` option and the shuffling dispatcher were not tried.
- **All code in Step 3 is uncompiled** and written as sketches.
- **From memory:** timestamp-ordering as a named technique, `FinalizationRegistry`'s timeliness, phone factors, caret behaviour in React.
- **Line estimates** are mine and no better founded than the plan's.
- **Not read:** see 2.9's list. `.plan` files beyond Runtime in full and parts of Machines and Persistence.
