# Runtime lifetimes: owners, one judge, one close (2026-11-19, proposed)

**Status (2026-11-20):** acted on: accepted as Owners (the user, 2026-11-19); built by @task.V3.T99, merged as
@plan.Pending.D34. The text below is prior art.

**Bottom line:** Every fiber the host starts belongs to an **Owner**: an Effect `Scope` holding that owner's fibers
plus the cleanup failures found when they ended. Every fiber's `Exit` is split by one function, `judge`, inside the
fiber, before it ends. The caller gets an `Ending`, never a raw Cause. Any non-interrupt reason of an interrupted
fiber goes to the Owner, and **whoever closes the Owner hears it**. The rest follows from Effect:

- Owners nest: Runtime, then services, then work, then each incarnation and each `runPromise`.
- `Scope.close` interrupts and awaits every fiber, so every judgement has run by the time a close returns.
- One close of the tree gives the order: work before services.

In the core, an identity's mailbox belongs to its **lineage**: the run of incarnations that share one record. That
mailbox goes when `disposeActor` or forget ends the lineage.

Of the 12 gaps, 9 become impossible to write and 3 become loud: an uninterruptible hang, a Cause that arrives after
the bound, and lane bugs outside the host. The 8 red cells of `984ec696` pass by construction. The public API does
not change, apart from one proposed Host field (Q1).

All of this is **proposed**. Nothing in `packages/` changed.

**Why now:** @task.V3.T99 reviews found a new disposal bug every round. Every one comes from the host tracking and
tearing down its work by hand: several maps, each `onExit` reading the Cause its own way, a close that snapshots an
array, and stages with their own deadlines. The convergence that added a stricter check at close is paused. This
proposal is the alternative to compare against it.

**Read first:** @plan.Runtime.O6, @plan.Runtime.O4 (send table), @plan.Inspection.O3, @spec.Actors (R10, R20 to R27,
`algorithm`, I30), code:packages/flow-state-v3/src/host/cleanups.test.ts,
code:packages/flow-state-v3/src/host/driver.ts#makeDriver, code:packages/flow-state-v3/src/host/close.ts#makeClose.

**Risk:** a work failure that races its own interrupt is reported as a cleanup failure (loud, never lost).
Construction cost per incarnation and per `runPromise` is one child Scope and one FiberMap. Measure it with
`bench --only` before adopting.

## 1. What Effect does and does not give (verified)

I checked these against installed Effect 4.1.4 with a scratch script outside the package. Each line is the observed
output.

Each fact, its evidence, then what it means for the design:

- `Scope.close` runs finalizers LIFO and sequentially, and combines finalizer failures
  (`internal/effect.ts:4077-4100`, `2221-2236`). Scope order comes for free.
- Closing a Scope that holds a FiberMap interrupts and awaits every fiber, but the close **succeeds** when a fiber's
  cleanup died (run: `close: ok` beside `Interrupt,Die`). Scope alone loses Causes.
- An outermost `Effect.onExit` sees the whole Cause: `Interrupt,Die`, `Interrupt,Fail`, and `Interrupt,Interrupt` for
  a cleanup that was itself interrupted (run). So the judge sits inside the fiber.
- That `onExit` runs before the owning close returns, and before a sibling services Scope forked earlier is released
  (run: `judged > services released`). A ledger read after the close is complete.
- `Fiber.interrupt` awaits but returns `void` (`internal/effect.ts:961-988`). Never use it to read an end.
- An aborted wait (today's `runPromise`) leaves only `Interrupt`; interrupting the *work* and awaiting it whole keeps
  `Interrupt,Die` (run). The signal must interrupt the work.
- `raceAllFirst`, behind `timeoutOption` and `timeoutOrElse`, interrupts losers and ignores their Exits
  (`internal/effect.ts:1743-1760`). No race over user work.
- A child Scope that starts closing removes itself from its parent, so the parent's close does not wait for it, and a
  second `Scope.close` returns at once (`internal/effect.ts:4040-4046`). An Owner's close is shared and awaited.

So structured concurrency gives ownership, order and awaiting. It does not give *reporting*. The design adds exactly
that missing piece: one judge per fiber and one ledger per Owner. It builds nothing else.

## 2. Gap by gap

"Impossible" means no code path exists that could produce the bug. "Loud" means the bug can still happen, but it
surfaces as a rejection, an Issue or a host report, never silently.

Each gap: today's root cause, then what replaces it, then **impossible** or **loud**.

1. Queued events at `disposeActor` reach a new incarnation of the same name (R10). Root: mail keyed by identity,
   cleared case by case. After: the mailbox is a field of the lineage, and `disposeActor` deletes the lineage.
   **Impossible.**
2. Services released before calls are interrupted. Root: two stages, each with its own deadline, so an overdue first
   stage lets the second run. After: one `Scope.close` of the tree; work is forked after services, so LIFO closes it
   first, and services wait for it. **Impossible.**
3. A store write whose interrupt cleanup dies is reported as Refused. Root: `edge.ts:188` reads the Cause itself
   (`hasInterruptsOnly`). After: the edge gets an `Ending`; `Interrupted` leaves the ticket unanswered, and the Cause
   goes to the Owner. **Impossible.**
4. A cleanup failing with a typed error lets `dispose()` succeed. Root: `cleanupDied` requires `hasDies`
   (`driver.ts:68`). After: `judge` counts any non-interrupt reason of an interrupted fiber as a failure.
   **Impossible.**
5. An aborted `runPromise` loses its dying cleanup. Root: the signal interrupts the wait, and `Fiber.interrupt` drops
   the Exit. After: the signal closes the call's own Owner, and the caller awaits the whole Exit. **Impossible.**
6. `dispose()` hangs on uninterruptible work. Root: per-stage deadlines. After: one bound on the tree close; past it,
   `CleanupOverdue` names the Owners still closing. **Loud.**
7. A send to an actor being disposed must drop NoRecord. Root: a separate fix in the send path. After: `DisposeActor`
   ends the lineage in its own step, and a send to an identity with no lineage and no record is NoRecord.
   **Impossible.**
8. An interrupted `dispose({ forget: true })` caller skips the forget. Root: forget runs in the caller's fiber after
   the join. After: forget is the last stage of the one shared close; a caller only joins. **Impossible.**
9. Overdue close stages drop late Causes. Root: a detached stage whose Exit is never read. After: the close keeps
   running, and every late Cause goes to `Host.report` (Q1). **Loud.**
10. A call's deadline race (`timeoutOrElse`) loses the loser's Cause. Root: a race over user work. After: a deadline
    is a core Timer whose firing sends `Interrupt`, and lint bans `race*` and `timeout*` over work. **Impossible.**
11. The read quarantine is spread over `quarantined`, `reading` and `endedReads`. Root: the host infers who owns a
    read. After: `Lookup` names its Owner, and quarantine is one map written only from an Owner close's result.
    **Impossible.**
12. Held writes re-sent or lost at dispose (earlier slices). Root: the core's lane table, not host lifetime. After:
    out of this class; the run rule (§5) fails any ending that is never delivered. **Loud.**
13. Timer, serve, wake and retry Exits are dropped (sidecar). Root: `if (Exit.isSuccess(exit))` in each callback.
    After: every fiber is judged, and a failure is reported. **Impossible.**
14. A read cancelled while Open (lane move) loses a dying cleanup (sidecar). Root: recorded only when the life is not
    Run. After: judged into the incarnation's Owner, with an Issue at once (Q2). **Impossible.**
15. A Cause pushed after the close's snapshot is lost (sidecar). Root: `driver.cleanups()` is read before late
    pushes. After: the ledger is read after `Scope.close` has awaited every fiber. **Impossible.**

Rows 13 to 15 are further members of the class that the sidecars found. They are fixed by the same structure.

## 3. The design

### 3.1 Host: `Owner`, `judge`, `Ending`

This file replaces `fibers.ts`. It is the only file allowed to fork, interrupt a fiber or read a Cause (§5.1).

```ts
// src/host/owners.ts — NEW module, replaces src/host/fibers.ts
import { Cause, Context, Data, Effect, Exit, FiberMap, Option, Scheduler, Scope } from "effect";
// existing: Cause, Context, Data, Effect, Exit, FiberMap, Option, Scheduler, Scope (Effect's own)

// NEW: Ending — how a task ended, as its caller hears it. No raw Cause to misread when interrupted.
export type Ending<A> = Data.TaggedEnum<{
  Done: { readonly value: A };                    // NEW: the work succeeded
  Failed: { readonly cause: Cause.Cause<unknown> }; // NEW: the work failed or died on its own: its result
  Interrupted: {};                                 // NEW: someone ended it; any cleanup failure went to the Owner
}>;

// NEW: cleanupOf — a cleanup's Cause is a failure unless it is a pure interrupt; kept whole.
const cleanupOf = (cause: Cause.Cause<unknown>) =>
  Cause.hasInterruptsOnly(cause) ? Option.none() : Option.some(cause);

// NEW: judge — the one rule every fiber's Exit goes through, exactly once.
const judge = <A>(exit: Exit.Exit<A, unknown>) => {
  if (Exit.isSuccess(exit)) return { ending: Ending.Done({ value: exit.value }), failure: Option.none() };

  if (!Cause.hasInterrupts(exit.cause))
    return { ending: Ending.Failed({ cause: exit.cause }), failure: Option.none() };

  // Interrupted: any Fail or Die beside the interrupt is a failed cleanup.
  return { ending: Ending.Interrupted(), failure: cleanupOf(exit.cause) };
};

// NEW: Owner — a Scope, the keyed fibers in it, its children, and the failures judged in it.
export const makeOwner = (
  parent: Scope.Scope,
  services: () => Context.Context<never>,
  judged: (failure: Cause.Cause<unknown>) => void, // NEW: the Issue, sent at once (CleanupFailed input)
) => {
  const scope = Scope.forkUnsafe(parent);                                        // existing: forkUnsafe
  const fibers = Effect.runSync(FiberMap.make<string>().pipe(Scope.provide(scope)));
  const failures: Array<Cause.Cause<unknown>> = [];
  const children = new Set<Owner>();
  let open = true;

  const fork = <A, E>(key: string, work: Effect.Effect<A, E>, onEnding: (ending: Ending<A>) => void) => {
    // A closed Owner runs nothing: the work never starts, so there is nothing to clean up.
    if (!open) return onEnding(Ending.Interrupted());

    const context = services();
    const fiber = Effect.runForkWith(context)(
      Effect.onExit(work, (exit) =>
        Effect.sync(() => {
          const { ending, failure } = judge(exit);

          for (const cause of Option.toArray(failure)) {
            failures.push(cause);
            judged(cause);
          }

          onEnding(ending);
        }),
      ),
      { scheduler: Context.get(context, Scheduler.Scheduler) },
    );
    FiberMap.setUnsafe(fibers, key, fiber); // existing: a live key's fiber is interrupted, then judged
  };

  // The close runs once, on its own fiber; every closer joins it. The failures go to whoever started it.
  const closing = Effect.cached(Effect.gen(function* () { // existing: Effect.cached
    open = false;
    for (const child of children) yield* child.join;      // a child closed by its own closer is awaited
    const released = yield* Effect.exit(Scope.close(scope, Exit.void)); // interrupts and awaits every fiber
    // A finalizer of this Scope that failed (a services finalizer, at the root) is judged by the same rule.
    const own = Exit.isFailure(released) ? cleanupOf(released.cause) : Option.none();
    return [...failures, ...Option.toArray(own)];
  }));

  const owner = {
    fork,
    cancel: (key: string) => Option.map(FiberMap.getUnsafe(fibers, key), (f) => f.interruptUnsafe()),
    child: () => {
      const made = makeOwner(scope, services, judged);
      children.add(made);
      return made;
    },
    close: closing, // NEW: the closer hears every failure in this Owner and in each child it closed
    join: closing,
  };

  return owner;
};

export type Owner = ReturnType<typeof makeOwner>; // NEW
```

`closing` is a sketch. In the real code `Effect.cached` is built once with `runSync`, and a child closed by its own
closer returns its failures there, not to the parent's closer. The rule it implements is **the one who starts an
Owner's close hears its failures**. Every other closer only waits.

The Owner tree, built at `construct()`:

```text
root   (Scope.makeUnsafe, sequential)            closed once by the Runtime's close
├─ services  (forked first; Layer.buildWithScope at boot)        released last, by LIFO
└─ work      (forked second: an Owner)                           closed first, by LIFO
   ├─ write calls, store, wake, retry, serve, timers   (keys in work's own FiberMap)
   ├─ incarnation/<id>  (child Owner per live incarnation: its reads)
   └─ run/<n>           (child Owner per runPromise call)
```

Write calls belong to `work` and not to their incarnation. @plan.Runtime.O6 says disposal "drops no lane", and lanes
outlive their actor. A per-actor Scope holding every fork would interrupt writes at `disposeActor`. That would be a
new bug, so G (§4) loses.

### 3.2 Host: the call sites, before and after

A read today. Ownership is inferred from three maps:

```ts
// BEFORE: driver.ts
Lookup: ({ call: id, actor, operation, input: given }) =>        // existing command
  Operation.$match(operationAt(actor.machine, operation), {
    Read: (op) => {
      reading.set(id, actor);                                     // existing: map 1
      fibers.fork(`call/${id}`, provided(Effect.suspend(() => op.call.run(given))), (exit) => {
        reading.delete(id);
        if (endedReads.delete(id) && Exit.isFailure(exit) && Cause.hasDies(exit.cause)   // map 2; dies only
            && Verdict.$is("Run")(admit(world.life, Input.Run())))
          quarantined.set(actorKey(actor), exit.cause);           // existing: map 3
        input(Input.Settled({ call: id, result: resultOf(exit) }));
      });
    },
    Write: () => defect(`${actor.machine}.${operation} is not a read`),
  }),
```

After. The core names the Owner, and the host forks into it:

```ts
// AFTER: driver.ts
Lookup: ({ call: id, actor, operation, input: given, owner }) =>  // NEW field: owner (an incarnation id)
  Operation.$match(operationAt(actor.machine, operation), {
    Read: (op) =>
      ownerOf(owner).fork(`call/${id}`, provided(Effect.suspend(() => op.call.run(given))), (ending) =>
        input(Input.Settled({ call: id, result: resultOf(ending) })), // resultOf now reads an Ending
      ),
    Write: () => defect(`${actor.machine}.${operation} is not a read`),
  }),
EndWork: ({ owners, reportTo }) =>                                // NEW command
  work.fork(`end/${owners.join(",")}`, closeInOrder(owners), (ending) =>
    Ending.$match(ending, {
      Done: ({ value: failures }) =>
        reportTo === "ref" ? quarantine(owners, failures) : runtimeReport.push(...failures),
      Failed: ({ cause }) => defect(cause),                       // a close cannot fail: Owner.close is total
      Interrupted: () => undefined,                               // the Runtime's close took over; it hears them
    }),
  ),
```

`closeInOrder` closes the incarnation Owners one after another, in the order the core gives. At Runtime disposal
that order is consumers first, which keeps @plan.Inspection.O3's order for cleanups too. `quarantine` is the one map,
`identity -> Cause`. `disposeActor` deletes the identity's entry before it sends `DisposeActor`, as it does today.

The store write. The edge never sees a Cause:

```ts
// BEFORE: edge.ts
(exit) => {
  if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return; // Interrupt+Die falls through...
  const landed = Exit.isSuccess(exit);                                      // ...to Refused
  if (!landed) again = new Map([...marks, ...again]);
  settle(carried, landed);
}

// AFTER: edge.ts
(ending) =>
  Ending.$match(ending, {                                     // NEW: Ending, matched in full
    Done: () => settle(carried, true),
    Failed: () => ((again = new Map([...marks, ...again])), settle(carried, false)), // a refusal
    Interrupted: () => undefined, // unanswered, as a hung store is; its cleanup's failure is the Owner's
  }),
```

`runPromise`. The signal ends the work, and the wait is never interrupted:

```ts
// BEFORE: run-promise.ts
const fiber = driver.fibers.fork(`run/${String(runs)}`, provided, () => undefined);
const exit = yield* Fiber.await(fiber).pipe(Effect.onInterrupt(() => Fiber.interrupt(fiber))); // drops the Exit
// ...and the public function passes { signal } to Effect.runPromiseExit, which interrupts this wait

// AFTER: run-promise.ts
const call = work.child();                                              // NEW: this call's own Owner
const exit = yield* Effect.callback<Exit.Exit<A, E>>((resume) => {      // existing: Effect.callback
  call.forkWhole("run", provided, (whole) => resume(Effect.succeed(whole))); // NEW: forkWhole, below
  // The signal starts the call's close, so the caller is the one who hears its cleanup's failure.
  signal?.addEventListener("abort", () => Effect.runFork(call.close), { once: true });
});
return yield* Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.fail(runFailed(exit.cause));
// ...and Effect.runPromiseExit(admitted(effect)) gets no signal
```

`forkWhole` is `fork` whose `onEnding` also receives the fiber's whole `Exit`. `runPromise`'s Plan is to reject with
the whole Cause, so it is the one caller that needs it. It still goes through `judge`, so the Owner ledger and the
Issue are unchanged. At Runtime disposal, `work` closes `run/<n>`: dispose hears the failure, and the caller's
rejection keeps the whole Exit. That is what the table requires. On abort the caller started the close, so only the
caller hears it.

The close. One tree, one bound, forget as a stage:

```ts
// BEFORE: close.ts (abridged to the stages)
const ended = yield* Effect.exit(driver.ended);
const stopped = yield* withinBound("fibers", fibers.close);                // stage 1, own deadline
const released = yield* withinBound("services", Scope.close(scope, Exit.void)); // stage 2 runs even if 1 is late
const failures = [stopped, released].reduce(/* ... */, driver.cleanups()); // snapshot of a pushed array
// runtime.ts: const closed = yield* Effect.exit(close);
//             const forgotten = forgetting ? yield* Effect.exit(forget()) : Exit.void; // skipped if interrupted

// AFTER: close.ts
const close = Effect.gen(function* () {
  const ended = yield* Effect.exit(driver.ended);
  const tree = yield* Effect.forkDetach(closeTree, { startImmediately: true }); // work, then services (LIFO)
  const failures = yield* Fiber.await(tree).pipe(
    Effect.timeoutOption(RuntimeDefaults.disposalBound),  // times the wait, never the close
    Effect.map(Option.match({
      onSome: (exit) => Exit.match(exit, { onSuccess: (all) => all, onFailure: (c) => [c] }),
      onNone: () => {
        lateReport(tree);                                  // NEW: the close finishes; each late Cause -> Host.report
        return [Cause.fail(new CleanupOverdue({ owners: work.closingKeys() }))]; // renamed field: stage -> owners
      },
    })),
  );
  const forgotten = forgetWanted() ? yield* Effect.exit(forget()) : Exit.void; // NEW: a stage of the one close
  return yield* reportOf(ended, [...runtimeReport, ...failures], forgotten);
});
// runtime.ts dispose: if (options?.forget === true) wantForget(); driver.input(DisposeRuntime()); return yield* join
```

`closeTree` is `work.close` followed by `Scope.close(root)`, and `Scope.close(root)` releases services last.
`reportOf` keeps today's shape: one CleanupFailed with every Cause, or the stopping defect with CleanupFailed beside
it, and forget's StorageFailure kept beside both. Services finalizers are judged with the same rule, so a finalizer
that is merely interrupted is clean (red cell "a services finalizer is interrupted"). A `dispose({ forget: true })`
that arrives after the close has ended starts one shared forget fiber of its own.

### 3.3 Core: Owners in commands, and the mailbox owned by the lineage

```ts
// BEFORE: core/world.ts
Lookup: { call: CallId; actor: ActorId; operation: string; input: Values };
Interrupt: { call: CallId };   // sent for every read when its incarnation ends, and for lane moves
// core/input.ts
Closed: { failures: number };  // runs only while Disposed
// World
readonly mail: ReadonlyMap<string, ReadonlyArray<Mail>>;   // keyed by identity; must be cleared by each path

// AFTER: core/world.ts
Lookup: { call: CallId; actor: ActorId; operation: string; input: Values; owner: string }; // NEW field
Interrupt: { call: CallId };                                // existing: lane moves and deadlines only
EndWork: { owners: ReadonlyArray<string>; reportTo: "ref" | "runtime" }; // NEW: an incarnation's end, a
                                                                         // disposeActor, disposal start
// core/input.ts
CleanupFailed: { owner: string };  // renamed from Closed: one per judged failure, sent at once;
                                   // runs Open, Disposing and Disposed; emits Issue CleanupFailed
// World
readonly lineages: ReadonlyMap<string, Lineage>;  // NEW: by identity; replaces `mail`
type Lineage = { readonly id: string; readonly mail: ReadonlyArray<Mail> }; // NEW: the mailbox lives here
```

Mail is addressed to a lineage, not to an incarnation. @plan.Runtime.O4 queues a send to an ending persisted actor
"for the next incarnation". Per-incarnation addressing would drop that send. A lineage lasts as long as the identity's
record: an end and a restore keep it, and `disposeActor` and forget delete it in their own step. The send table's
"actor being disposed is dropped with NoRecord" then needs no case of its own: a disposed identity has no lineage and
no record. A new ensure in the same host task starts a new lineage with an empty mailbox. Since the inbox is FIFO, a
send queued before `DisposeActor` lands in the old lineage and is dropped with it, and a send queued after `Ensure`
lands in the new one. This makes R10's "No schedule, issue or send of an old incarnation reaches a new one"
structural for sends.

## 4. Alternatives considered

- **A. Plain structured concurrency** (`forkIn` or FiberSet per actor, nested Scopes). Ownership and awaiting are
  right, but Causes are lost: the close succeeds while a fiber's cleanup died (§1). `FiberSet.join` keeps only the
  first failure, and a child closing elsewhere is not awaited. A is the chosen design's skeleton, without the judge
  and ledger.
- **B. Mail addressed to an incarnation.** Breaks O4's "queued for the next incarnation", and a handle would stop
  following its identity. The chosen design addresses mail to the lineage instead.
- **C. Supervision and links** (Erlang, Akka). Effect has no link primitive, so this would be a second system beside
  Scope. A link exit picks one reason, so sibling failures race and secondary Causes are lost. Their lessons are kept:
  reverse start order, a shutdown bound then giving up, and a uid that sends old-incarnation mail to dead letters.
- **D. The paused convergence**: today's host plus a stricter check at close. It checks that fibers were awaited, but
  FiberMap already awaits them. The bugs are in how each Exit is *read*, which a close check cannot see, and a check
  that throws inside the close fiber loses the failure it guards.
- **E. XState's stop**: clear the mailbox, stop children in spawn order. No await, late promise errors are ignored
  (`actors/promise.ts`), and a throwing deferred drops later stops (`createActor.ts:299`). Kept: clearing the
  mailbox at stop, which the lineage does structurally.
- **F. One ManagedRuntime per actor.** Services are shared across actors, so each would rebuild or share them, and
  its dispose rejects with finalizer Causes only, not fiber Causes (§1).
- **G. A per-actor Scope owning every fork, writes included.** Wrong: writes outlive their actor (O6 drops no lane),
  so it would interrupt writes at `disposeActor`.

The chosen design wins on correctness: every gap is impossible or loud, and the reporting rule is one sentence. It
also reads better: one `fork`, one `judge`, one `close`. Its cost is one wrapper module.

## 5. Prevention every later Task inherits

### 5.1 Lint: one place forks, interrupts or reads a Cause

Add a `tools/lint-bomb/FLOW-STATE.md` "Scope" entry (proposed). Under `src/host/`, outside `owners.ts`, these are
refused:

- `Effect.fork*`, `Effect.runFork*`, `FiberMap.*`, `FiberSet.*` and `Fiber.interrupt*`;
- `Effect.race*` and `Effect.timeout*` over anything but a wait;
- `Cause.has*`, `Cause.find*` and `Exit.isFailure`.

`close.ts`'s own detached close and timed wait are the one named exception. `run-promise.ts` reads a Cause only to
wrap it, untouched, in RunFailed. With this rule, gaps 3, 4, 10 and 13 cannot be written again: a new callback
receives an `Ending`, and the compiler makes it match `Interrupted`.

### 5.2 Run rule: every task accounted for (Actors R23, Diagnostics R8)

Add two dev trace records (proposed): `Task { owner, key, phase: "started" | Ending tag, failed: boolean }` and
`Report { to: "dispose" | "runPromise" | "ensure", owner, causes: number }`. The rule `everyTaskAccounted` in
`tests/rules/` checks every Story run:

- every `started` task has exactly one ending record;
- every ending with `failed: true` has exactly one Issue CleanupFailed for its owner;
- per Owner, the failures judged equal the causes reported to that Owner's closer. A runtime-owned task's failure is
  in the dispose rejection, an incarnation Owner closed by a ref's end is in the next ensure's throw, and a run Owner
  closed by abort is in that `runPromise` rejection;
- a run whose Runtime never closes reports only the Issues.

This rule makes a future fork that bypasses an Owner, or an ending that is never delivered, fail on every Story.

### 5.3 World word: "cleanup fails"

```ts
// steps.ts WorldWord — NEW member
cleanup: { target: CleanupTarget; outcome: "dies" | "fails" | "interrupted" | "hangs" };
// NEW: where the outcome applies: an endpoint's next held call, the store's next held batch, or a services fixture
type CleanupTarget = Data.TaggedEnum<{
  wire: { server: AnyServer; endpoint: string };
  storage: {};
  services: { fixture: string };
}>;
// fake.ts — NEW endpoint word, beside hold/release/lose/drop (existing)
readonly cleanup: (outcome: "dies" | "fails" | "interrupted" | "hangs") => WorldWord;
```

When the fake's held call or held batch is interrupted, it runs the cleanup. `fails` fails with the endpoint's
declared failure, or `StoreRefused` for storage. `hangs` never ends. The generator adds the word wherever a `hold`
can be picked, so every Story mix also crosses each fiber kind with each cleanup outcome. Expected results come from
the Spec rule "the one who closes the Owner hears it", never from running the code. With `hangs`, the expected result
is CleanupOverdue plus one Host report.

### 5.4 The test table

The 8 red cells in `984ec696` turn green as follows:

- the four "fails with a typed error" cells pass through `judge`;
- "a services finalizer is interrupted" passes because a pure interrupt is clean;
- "actor disposal: a read fails" passes through the incarnation Owner's close and the quarantine;
- "aborted: dies" and "aborted: fails" pass because the signal closes the run Owner and the wait is whole.

New cells:

1. Each kind × `hangs`: CleanupOverdue, then a Host report when the cleanup finally ends.
2. A read cancelled by a lane move while Open, whose cleanup dies: an Issue at once, and quarantine at the
   incarnation's end.
3. A store write whose cleanup dies: the lane's head is not `EndUnsent StorageRefused`, and dispose rejects
   CleanupFailed.
4. A dispose caller interrupted mid-join with `forget: true`: the records are still deleted.
5. `disposeActor` concurrent with `dispose()`: services are released only after the actor's reads end.
6. R10: in one host task, send, `disposeActor`, ensure, send. The new incarnation hears only the second send.
7. `dispose()` twice, and `dispose()` then `dispose({ forget: true })`: one shared result, and forget runs.

## 6. Costs and migration

**Removed:**

- `fibers.ts` (83 lines);
- from `driver.ts`: `cleanups`, `cleanupDied`, `reading`, `endedReads` and the life-gated wrapper (about 60 lines);
- from `close.ts`: `withinBound` and the two stages (about 30 lines);
- from `run-promise.ts`: the abort plumbing;
- from `edge.ts`: the Cause test;
- from the core: Interrupt-per-read at an incarnation's end and at disposal start (`incarnations.ts:331`,
  `disposal.ts:63`), and identity-keyed `mail` with its clears.

**Added:**

- `owners.ts` (about 120 lines);
- `EndWork` handling and the one quarantine map (about 30);
- the close's single bound, forget stage and late report (about 25);
- core: `owner` on `Lookup`, `EndWork`, `CleanupFailed`, `Lineage` (about 50);
- the lint entry, two trace records, a run rule (about 60) and the world word in the fakes and generator (about 80).

Net, the host shrinks slightly. The tests and tooling grow. There is no change to the public API, Stories or the
CLI. Inspection gains no evidence kind; Issue CleanupFailed exists already. There is still one Runtime and one
graph.

**Migration**, in order. Each step leaves the suite green except the cells it turns green:

1. Add `owners.ts` and the lint entry. Port the driver's calls, timers and serve, then the edge, onto `work`.
2. Switch the edge's store callback to `Ending`, adding new cell 3.
3. Core: add `owner` on `Lookup`, `EndWork` and `CleanupFailed`. `retire` and disposal start send `EndWork`. Update
   the Life table. Host: add incarnation Owners and the one quarantine map, and delete the read maps.
4. Close: one tree, one bound, the forget stage, the late report (Q1).
5. `runPromise`: a run Owner per call, with the signal closing it.
6. Core: the lineage mailbox (new cell 6).
7. Flip the 8 `it.fails` to `it`, then add new cells 1, 2, 4, 5 and 7, the world word and the run rule.

**Risks:**

- A work failure that races its own interrupt counts as a cleanup failure. It is loud, never lost.
- `onEnding` runs inside the fiber's uninterruptible `onExit`. A driver throw there becomes that fiber's defect after
  the judgement is recorded, as an observer's throw is today.
- Dispose during Booting: the Layer builds into `services` while the close may run. The boot should be a `work` task,
  so the close waits for it. This is unchanged today (sidecar finding) and should be fixed in the same Task.
- If `disposeActor` and then `ensureActor` run in one host task while the old reads are still closing, the old
  incarnation's quarantine can land while the new incarnation is live (Q3).
- Construction cost per incarnation start and per `runPromise` is one Scope and one FiberMap. It stays off the core's
  hot loop, but measure it.

## 7. Proposed Plan and Spec changes (all proposed)

- @plan.Runtime.O6: add "Whoever ends work hears its cleanup failure. A Runtime disposal rejects dispose, an actor's
  end quarantines its ref, and an aborted `runPromise` rejects with it. Each failure is an Issue CleanupFailed when it
  is found." Also add "Runtime disposal waits for every cleanup at most the disposal bound; past it dispose rejects
  CleanupOverdue, and each later failure goes to the host's report (Q1)."
- @spec.Actors.R22, proposed paragraph: replace "then the host interrupts every call and awaits it, and only then
  releases the services" with "the host closes its Owner tree once: work (every call, store write, read and
  `runPromise`) before services, by Scope order".
- @spec.Actors.R23: replace "waits for each stage (fibers, then services) at most the disposal bound" with "waits for
  the whole close at most the disposal bound". Add that an actor-level cleanup failure of a read cancelled while Open
  is held to the incarnation's end (Q2).
- @spec.Actors.R20 and R10: replace the T99 lead's proposed "the removal also drops the identity's queued mail" with
  "an identity's mailbox belongs to its lineage, which `disposeActor` and forget end".
- @spec.Actors.R27: "an aborted signal interrupts the Effect" becomes "an aborted signal interrupts the Effect, never
  the wait, so the rejection keeps every cleanup failure".
- @spec.Actors `algorithm`: replace `Closed` with `CleanupFailed { owner }`, which runs in Open, Disposing and
  Disposed and drops in every other life.
- @spec.Actors `composition`: the "Dispose runs the core's disposal ..., then interrupts and awaits every fiber, then
  closes the Scope" paragraph becomes the Owner tree in §3.1.
- New invariants (proposed ids at merge):
  - "Every fiber the host starts is judged exactly once, by `judge`, before it ends." [@R23]
  - "Every non-interrupt reason of an interrupted fiber reaches the report of whoever closed its Owner, and one
    Issue." [@R23, @R27]

## 8. For the user

- **Q1.** Where does a Cause that arrives after the close's bound go?
  - A: a new `Host.report(cause)`, which defaults to `console.error` with the whole Cause, as Node reports an
    unhandled rejection.
  - B: an Issue after RuntimeEnded, which carries no Cause.
  - **Recommend A.** B loses the Cause, and evidence after RuntimeEnded breaks terminal order.
- **Q2.** A read cancelled while Open whose cleanup fails:
  - A: an Issue at once, with the Cause held until its incarnation ends, then quarantine.
  - B: an Issue only.
  - **Recommend A.** Q8 A already quarantines on actor-level cleanup failure.
- **Q3.** An old incarnation's cleanup fails after a new incarnation of the same ref has started in the same task:
  - A: quarantine the ref anyway, so the next ensure throws.
  - B: report only the Issue.
  - **Recommend A**, with B's Issue too.
- **Q4.** Adopt this design in place of the paused convergence, as a fresh Task. The 8 red cells and the new cells
  are its acceptance.

## Appendix: sidecar findings, verified

Four Haiku sidecars (medium effort, read-only) covered Effect semantics, a host fork map, prior art, and an
adversary. I checked each finding below against the source or the scratch run.

Each finding, the sidecar that made it, then the verdict and why:

- `Scope.close` runs LIFO and sequentially, aggregates finalizer Causes, is uninterruptible and has no timeout
  (Effect). **Accepted**: read `effect.ts:4033-4100`; order seen in the run.
- `forkIn` and a FiberMap close drop fiber Exits (Effect, adversary). **Accepted**: the scratch close succeeded beside
  `Interrupt,Die`.
- `Fiber.interrupt` returns `void` (Effect). **Accepted**: `effect.ts:961-988`.
- `raceAllFirst` ignores losers' Exits (Effect, adversary). **Accepted**: `effect.ts:1743-1760`; not run, and the
  design avoids races over work.
- `FiberMap.setUnsafe` interrupts a replaced fiber without awaiting it (Effect). **Accepted**; harmless here, since the
  replaced fiber is still judged.
- `isInterruptedOnly` does not exist; use `Cause.hasInterruptsOnly` (Effect). **Accepted**: the test file uses it.
- A child Scope closing elsewhere is not awaited by its parent, and a second close returns at once (adversary).
  **Accepted**: `effect.ts:4040-4046`. It led to the shared Owner close.
- `FiberSet.run` forks as a daemon (Effect). **Accepted**, not relied on.
- Write calls' interrupt-cleanup deaths fold into a payload-less Defect while Open (host map, adversary).
  **Accepted**: `driver.ts:51`, `126-131`.
- Timer, serve, wake and retry Exits are dropped (host map). **Accepted**: `driver.ts:200`, `311`; `edge.ts:111`,
  `124`. It became gap 13.
- Late Causes after a stage's deadline are unobserved (host map, adversary). **Accepted**: `close.ts:132-140`, `170`.
  Gap 15.
- The hidden-page listener's finalizer runs after services are released (host map). **Changed**: true, since it is
  registered on the root before boot builds services, but harmless, since no user code runs. It moves to `work`.
- Dispose during Booting races the Layer build (host map). **Accepted** as a risk (§6).
- Two deadlines in sequence give about 15 s worst case (host map). **Changed**: today it is the core bound plus two
  stages, about 15 s; the design's is about 10 s.
- A dying store-write cleanup becomes Refused, then `EndUnsent StorageRefused`, telling a lane that a write which may
  have landed was never sent (adversary). **Accepted**: `edge.ts:188-192`. A correctness bug beyond the lost Cause;
  new cell 3.
- Call deadlines via `timeoutOrElse` exist (adversary, premise check). **Accepted** that they do not: no
  `timeoutOrElse` in `src/`, and the only timeout is `close.ts:138`. Gap 10 is about future deadlines, which become
  core Timers.
- Candidate B breaks a handle following its identity (adversary). **Changed**: true for incarnation addressing; the
  lineage keeps handles following their identity.
- Effect has no link primitive, so C rebuilds observers (adversary). **Accepted.**
- D's check cannot see misjudged Exits (adversary). **Accepted.**
- Whether `forget()` runs after an interrupted join is unsettled from source (adversary). **Rejected** as an open
  question: the brief reports it as an observed gap, and the design takes the caller out of the path.
- XState clears the mailbox at stop, stops children in spawn order without awaiting, and drops later deferreds after
  a throw (prior art). **Accepted**: `createActor.ts:631-643`, `299`.
- XState frees a system id before the old child has stopped (prior art). **Accepted** as a cited lesson
  (`stopChild.ts:79-82`); the lineage avoids it.
- An Akka uid sends mail for an old incarnation to dead letters; Erlang stops in reverse start order with a shutdown
  timeout (prior art). **Accepted**, from knowledge, not checked in `codebases/`.
- Effect cluster discards its entity termination timeout's result (`entityManager.ts:371-382`, prior art).
  **Accepted** as a warning: the design's overdue path reports instead of discarding.
