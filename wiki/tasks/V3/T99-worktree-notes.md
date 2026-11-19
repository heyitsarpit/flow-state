# T99 worktree notes: Runtime lifetimes on Owners

Built on branch `worktree-agent-a4428370816b1a94a` (fast-forwarded from 44b21e70 to e4ec9e86 first: the worktree was
cut from an old commit). For the orchestrator to post on @task.V3.T99; nothing here edits a Task or `V3.log`.

## Comments to post

- **Bench (built, the lead):** one child Scope plus FiberMap costs about 1.6 µs to make and 1.7 µs to close (20,000
  in a scratch spike on Effect 4.1.4); turns run 0.008 to 3 ms. Owners are made lazily: an incarnation's Owner at
  its first read, a run Owner per `runPromise`. `bench --dev` per turn, before then after (ms): shop long 0.0616 then
  0.0615, session long 0.136 then 0.133, sync long 0.0239 then 0.0217, transfers long 0.0491 then 0.0488,
  `scale.lanes.actors-256` 0.0662 then 0.0622: within noise. Reverse: eager Owners per incarnation.
- **Gates (the lead):** suite exit 0 (1,320 passed, 25 expected fail, no unhandled errors), `nub run check` exit 0
  with no warnings, `lint:rules` exit 0. Stress exit 1: `lanes` saved stress Story prints `longCommit` where the
  run prints its literal, a fixture printing mismatch this diff does not touch (no fixture or printer change);
  likely from e4ec9e86's fixture rewrite, not checked on that commit.
- **Build (the lead):** `src/host/owners/owners.ts` replaces `fibers.ts`: Owner (Scope, keyed tasks, nested Owners,
  ledger), one `judge` per task inside its fiber, `Ending` (Done, Failed, Died, Interrupted). The core adds `owner`
  on Lookup, an `EndWork` command at an incarnation's end and at disposal start, and `CleanupFailed` (renamed from
  Closed; Open, Disposing, Disposed). The close is one bounded wait on work then the root; forget is its last stage.
- **Tests (the lead):** the 8 red cells of `984ec696` pass. New cells, red first for their stated reasons: each kind
  by `hangs` (red: no late report), a read replaced while open (red: no Issue), a store write cut at the close (red:
  answered refused), an interrupted forget (red: records kept); green from the start: services after an actor's
  reads, shared disposes with forget. Added after review: unheard quarantine at dispose, through a lift, a heard one
  not repeated, and an ended actor's late failure reaching the host's report.
- **Faults (the lead):** 13 new (judge-drops-typed-cleanup, issue-not-at-once, cancel-skips-reads, late-cause-dropped,
  lift-drops-unheard, unheard-quarantine-dropped, abort-interrupts-wait, forget-in-caller, late-quarantine-lost, and
  the rewritten interrupt-cleanup-dropped, store-cleanup-dropped, cleanup-judged-for-calls-only, ref-quarantine-dropped)
  and 14 moved; every one caught with `faults --only` in scratch copies (20, 7 and 5 per run).
- **Bug found while building:** `Effect.onExit(x, f)` with `x` not an Effect builds no finalizer (its `dual` reads
  the call as data-last), so the task ends unjudged and `runPromise(null)` hung for ever. Owners wrap every task so
  a non-Effect dies inside it. The surface walker now settles each returned Promise; its unhandled rejections are
  gone.

## Decisions (the lead, by correctness)

- **Q1 A:** a Cause after the bound goes to a new `Host.report(cause)`. The browser host calls `reportError` with a
  CleanupFailed FlowError keeping the whole Cause; the Story host fails the run. Why: an Issue after RuntimeEnded
  carries no Cause and breaks terminal order. Reverse: drop the field and keep the overdue failure only.
- **Q2 A:** a read cancelled while open whose cleanup fails is an Issue at once, held in its incarnation's Owner,
  and quarantines the ref at the incarnation's end. Why: Q8 A quarantines on any actor-level cleanup failure, and
  the ledger holds it until its closer. Reverse: hear only the Issue.
- **Q3 A:** an old incarnation's failure quarantines the ref even when a new incarnation is live, with the Issue.
  Why: B loses the Cause from every caller. Reverse: hear only the Issue.
- **Unreported quarantine (delegated):** never lost. A quarantine is one tagged state (Unheard, Heard). An ensure
  marks it heard; dispose's CleanupFailed carries every Unheard one; a failure that lands once no ensure can run
  goes to the Runtime's report (late: `Host.report`). Reverse: drop Unheard from the close.
- **Lift on disposeActor (delegated):** kept, and only by a disposeActor that runs; an Unheard failure moves to the
  Runtime's report. Why: a literal cancel cannot reach a quarantined ref; lifting must not lose the Cause. Reverse:
  lift only Heard entries.
- **Lineage mailbox:** kept as the identity-keyed mailbox, dropped in the one step that ends the lineage
  (`incarnations.dispose`, for disposeActor and forget) and cleared at disposal start. A `Lineage { id, mail }`
  record would store an id nothing reads; R10's cell (`mail at disposeActor` in runtime.test.ts) passes. Reverse:
  add the record if a later rule needs to address mail to a lineage id.

## Haiku review (2, effort high), each verified

- Accepted: an ended actor's late failure was quarantined after the close read the map (fixed, test and fault
  `late-quarantine-lost`); a disposeActor after disposal lifted before admission and reported twice (fixed); a
  throwing hearer left an Owner's close unresolved (fixed with `ensuring`); the Story host's throwing report was lost
  in a detached fiber (now collected and failing the run at finish); the lint rule missed aliased, namespace,
  destructured and bare imports and FiberHandle, runCallback (fixed, planted); a vacuous quarantine test and an
  unchecked mid-close interrupt (fixed); FLOW-STATE.md "Scope" entry; a missing space in `lint:rules`.
- Rejected: an interrupted store write making forget StorageFailure (pre-existing, routed to @task.V3.T100); a
  failing finalizer beside a work failure that is not interrupted (the ending shapes, trust-boundaries consult);
  dispose during Booting (pre-existing, T100); Owners rebuilding Exit or FiberMap (verified: Scope loses Causes);
  Effect's signal option for abort (it interrupts the wait, the very gap); comments on non-exported code (house
  practice, lint clean).
- Noted, not changed: `close.ts` holds the forget request in two slots (`wanted`, `late`); a tagged state would read
  better.

## Prevention (built, the lead)

- **Run rule `everyTaskAccounted`** (`tests/rules/owners.ts`, Actors R23 and Diagnostics R8): Owners take a
  `Traced` hook (`Option`, none in production) and record `Task` (started, then its Ending tag and whether its
  cleanup failed) and `Report` (causes, own, `heardBy` closer or parent) into the Story trace; the root and an overdue
  close report too. The rule checks per open: one start and at most one end per task, a report only after every task
  of its Owner ended, causes = failed tasks + own + nested reports, Issues CleanupFailed = failed tasks + own. Red
  first by crafted traces in `rules.test.ts`, then by the planted `report-drops-task-failures` (the rule's breach is
  the failure) and `report-before-tasks-end`.
- **World word `cleanup("dies" | "fails")`** on a fake endpoint: arms its next held call; interrupted, the cleanup
  dies `FakeCleanupDied` or fails `FakeCleanupFailed`. The generator arms one with half its holds. Fixture Stories
  `sign-in/read-cleanup-dies` and `sign-in/save-cleanup-dies`, tests in `tests/sign-in/cleanups.test.ts`; red by the
  planted `fake-cleanup-ignored`. Proposal §5.3's `storage`, `services` targets and `interrupted`, `hangs` outcomes
  are not built (not asked here).
- **Trace cost:** Task records grow traces by about a third, which pushed `sweep-3` (`player/group-replays`, 28k to
  39k events) past its limit. `places.ts` `savedAfter` scanned every event per call (WriteLanes I27 was 3.2 s of 3.9 s
  rule time there); it now reads each run's landed batches once. `sweep-3` runs all four tests in 52 s, under the 59 s
  one mode took before.
- **Saved stress Stories:** `sign-in/stress-36` and `sync/stress-36` now print a `cleanup("dies")` beside one hold,
  pasted in.

## Finding for a decision

- **Typed cleanup failures are lost under a catch.** In Effect 4.1.4 an `OnFailure` continuation (`catchTag`,
  `catchTags`, any `catch*`) that runs on an interrupted fiber gets the fiber's interrupt cause, dropping the cleanup's
  `Fail` (a `Die` survives). Every fixture port catches `FakeLost`, so `cleanup("fails")` never reaches the Owner;
  pinned as a Gotcha test in `tests/sign-in/cleanups.test.ts`. Diagnostics R8 ("complete causes survive cleanup")
  cannot hold for app code that catches; the Spec or docs should say so, or Owners must hear cleanups another way.

## Gates and bench (after the prevention build)

- Suite exit 0 (1,324 passed, 25 expected fail), `nub run check` exit 0, `lint:rules` exit 0; fresh generated seeds
  (`FLOW_SEEDS=20`, generated and mix) pass with the rule on. Stress exit 1: only the known `lanes` saved stress Story
  (`longCommit` against a literal).
- Faults `--only` in scratch copies: `report-drops-task-failures`, `report-before-tasks-end`, `fake-cleanup-ignored`
  and the rewritten `issue-not-at-once`, 4 of 4 caught.
- Bench `--dev`, load 6 to 8 (another agent running), before then after (ms per turn): shop long 0.0615 then 0.0636,
  session long 0.133 then 0.137, sync long 0.0217 then 0.0222, transfers long 0.0488 then 0.0508,
  `scale.lanes.actors-256` 0.0622 then 0.0658. Benches run Stories, so these include the dev trace; production
  passes no hook.

## Haiku review of the prevention diff (2, effort high), each verified

- Accepted: an overdue close's Issue had no counted cause (it now reports `overdue`); `fake-cleanup-ignored` left an
  unused local a typecheck would kill (now swallows the cleanup instead); `slotOf` read a cleanup word as storage; a
  generator comment overclaimed; `slotted` renamed `key`.
- Changed: the Issue count breaks in lives that admit no CleanupFailed (boot failed, stopped); written as a Gotcha on
  the rule, since no fixture Story does either.
- Rejected: a cleanup bound to the wrong hold (the generator arms one hold per endpoint at a time, and a cleanup is
  taken by the next held call, as documented); a dropped used hold in printed steps (follows from the last); a late
  cleanup failing a generated run (dies and fails never hang, so no close is overdue); runPromise's `() => undefined`
  hearer (its causes are in the call's Exit and an Issue); production cost with no hook (only `Option.isSome` checks).
- Noted, not changed: an interrupted held fake call stays in `held` (pre-existing); a cleanup consumed by a call that is
  later released is silent by design; comments on non-exported code (house practice, lint clean).

## Not done (resume here)

1. The re-review of this fix round (below).
2. The `lanes` saved stress Story mismatch, from the main line's fixture rewrite (fixed on flow-rewrite).
3. Routed to @task.V3.T100: the close's own failure ignored in `close.ts` (finding 4), unguarded Owner callbacks
   (`traced`, `judged`, a Runtime `report`), and dispose during Booting (finding 8).
4. For the user: R23's two bounds (below) and @plan.Pending D34, which still says dispose "rejects CleanupOverdue"
   (a Plan, so not edited here).

## Close review (independent lead, 2026-11-19): ISSUES

One blocking finding: a Cause an ensure already heard is carried again by dispose. The design claim holds in code (no
fork outside an Owner in `src/host`), the 8 red cells of `984ec696` and the new cells pass, and the orchestrator's
ruling holds: a dying cleanup is always heard. Gates, each alone: suite exit 0 (1,324 passed, 25 expected fail, no
unhandled errors), `nub run check` exit 0, stress exit 1 with only the known `lanes` saved stress Story (the sign-in
and sync saved stress Stories pass, so they are what the generator prints), `faults --only` 8 of 8 caught
(judge-drops-typed-cleanup, abort-interrupts-wait, store-cleanup-dropped, report-drops-task-failures,
fake-cleanup-ignored, late-quarantine-lost, unheard-quarantine-dropped, lift-drops-unheard).

**Blocking**

1. **Doubled Cause: a Heard quarantine turns Unheard again** (medium; owner: T99 lead). `quarantine` in
   `src/host/driver.ts` merges the held entry's Cause whatever its tag into a new `Unheard`, so a Cause an ensure
   already reported goes into dispose's CleanupFailed (or a lift's report) a second time, against the lead's rule "a
   heard one not repeated". Replayed red in a scratch copy of `cleanups.test.ts`: ensure, Look, disposeActor (cleanup
   held), ensure, Look, disposeActor (held), the first cleanup dies c1, an ensure throws c1, the second dies c2;
   dispose rejects with c1 and c2. Missing coverage: two incarnations of one ref whose cleanups land after an ensure
   heard the first; the ref needs its heard and unheard Causes apart.

**Routed (non-blocking)**

2. **Typed-cleanup boundary is wider than `catch*`** (the user's read, with the ruling). A probe on Effect 4.1.4:
   every error-channel continuation on an interrupted fiber drops a cleanup's `Fail` (`catchTag`, `catch`,
   `mapError`, `tapError`, `orElseSucceed`, `retry`, even `catchCause`); a `Die` survives all of them. So a dying
   cleanup is always heard, and the Gotcha test pins the right pair (fails lost under the port's `catchTag`, dies
   kept in `sign-in/read-cleanup-dies`). But app code that only maps or retries an error loses a typed cleanup too,
   so the ruling's "the user's caught error" should read "any error-channel combinator around the call". Actors R23,
   I48, R27 and Diagnostics R8 still promise a typed cleanup failure is heard with no such condition; the Spec or the
   docs should say it. Missing coverage: a Gotcha cell for `mapError` or `retry`.
3. **`owners-only` lint misses forms** (low; T99 lead or @task.V3.T102). Planted through the rule's own oxlint
   harness: missed `Effect.runPromise`, `runSync` (a runner in host code starts a fiber no Owner holds), `const E =
   Effect; E.forkDetach`, `(Effect as any).forkDetach`, ``Effect[`forkDetach`]``, `import { default as E } from
   "effect/Effect"`, `effect/internal/*`, dynamic `import()`, `export { forkDetach } from "effect/Effect"`, and Cause
   reads through `catchCause`, `Exit.match`, `Cause.pretty`. Missing coverage: those forms in the test's `fires`.
4. **The close's own failure is ignored** (low; @task.V3.T100). `close.ts` tests `waited` for none only; a tree that
   dies (a throwing `driver.input` or trace hook) skips `report.hear(released)` and is in no rejection. Owner
   callbacks (`traced`, `judged`, a Runtime `report`) run unguarded, so a throw drops the rest of a batch or skips a
   task's `onEnd` (a runPromise then never settles). Production hooks do not throw. Missing coverage: a planted throw
   in the tree and in a report.
5. **Spec against code** (low; T99 lead). R23 and D34 say dispose "rejects CleanupOverdue"; it rejects CleanupFailed
   whose Cause holds CleanupOverdue, as the tests pin. R23 bounds the whole close by one bound measured from the
   dispose call; `close.ts` waits `driver.ended` (the core's bound), then gives the tree a fresh bound (up to twice;
   `disposedPastBounds` advances twice). R23's "each failure is an Issue" omits that `life.ts` drops CleanupFailed in
   Inert, Booting, Failed and Stopped (the Cause still reaches the rejection). R27's lead-proposed abort sentences sit
   under "Decision (user): Q7 A"; mark them proposed. FLOW-STATE.md's owners entry omits the test-file exemption.
   I47 and I48 are cited by no test (`everyTaskAccounted` cites R23 and Diagnostics R8).
6. **Run rule's own term is self-reported** (low; T99 lead). `everyTaskAccounted` takes `own` from the report it
   checks, so an Owner dropping its own Scope's failure passes; no crafted trace has `own > 0` or a nested report.
   Missing coverage: those crafted traces. The dropped task report is caught by the rule itself (replayed: the
   planted edit fails `breachesOf`, not a count).
7. **Code quality** (low; T99 lead or @task.V3.T102). `close.ts` forget request in two slots (`wanted`, `late`);
   `testing/fake.ts` keeps `cleanups` as a queue beside `pending`; `Ending.Failed` stores `error` beside the `cause`
   it comes from; doc comments on non-exported `Hearing` and `Quarantine`; `driver.ts` doc still says "calls and
   timers as keyed fibers in the Runtime's Scope".
8. **Booting** (pre-existing; @task.V3.T100, already routed): dispose while services build leaves `ready()` pending,
   and a services failure after that is answered RuntimeDisposed with its Cause dropped.

**Checked and holding:** Q1 (each late Cause reaches `Host.report` once; `late()` drains Waiting), Q2, Q3, the lift
only on a disposeActor that runs, the lineage mailbox (dropped with `retire` in one step; R10's cell and
`dispose-keeps-mail`), the trace hook (`Option.none()` in `runtime.ts` and the browser host; records built only under
`isSome`), the generator offers `cleanup` (one in four dies, one in four fails per armed hold), and `savedAfter`
answers as before (sequences rise with the trace index, so the last landed batch is the latest). No outside imports,
temporary names or core impurity in the diff.

**Sidecars (6 Haiku, effort high), each verified:**

- Blind: accepted the Heard merge (1, replayed). Routed the close's ignored Exit and throwing hooks (4) and Booting
  (8). Rejected the uninterruptible runPromise hang (the user's Effect, as `Effect.runPromise`), a forget's failure
  hidden from a plain dispose (that caller asked no forget; the forget caller hears it), a Story ignoring a dispose
  rejection (its Issues and run rules still check), and the aborted runPromise's no-op hearer (its Exit and an Issue
  keep the Cause).
- Forks and lint: changed into 3 after replaying every form through oxlint; no unowned fork found in `src/host`.
- Decisions: accepted the double (1). Rejected the queued lift (the Cause still reaches dispose) and a pending
  runPromise heard by its caller and by dispose (two hearers, by R23 and R27). Changed the bound into 5.
- Prevention: accepted 6. Rejected "generated cleanups rarely fire" (dispose, disposeActor and reload steps interrupt
  held calls) and the `savedAfter` order risk (sequences are trace indexes).
- Code quality: accepted 7. Rejected the abort listener cleanup (the task's end always removes it) and
  `Schedule` as a sleep (pre-existing edge code).
- Spec: accepted 2 and 5.

## Fix round (the T99 lead, 2026-11-19)

Each finding, then its check; every new cell was red before its fix unless said.

- **1, doubled Cause (fixed).** A ref's quarantine is one tagged state: Unheard, Heard, Partly (heard and unheard
  apart). An ensure throws every Cause the ref holds and marks them heard; a lift and the close take only the
  unheard. Check: `src/host/cleanups.test.ts` "two incarnations of one ref", all 60 orders of ensure, ensure, the
  second failure, disposeActor and dispose against an oracle written from R23 (red: 2 orders, the first Cause
  twice). Faults `heard-quarantine-repeated`, `ensure-forgets-unheard`; `lift-drops-unheard` rewritten.
- **2, typed boundary (Q11 A, decided).** Written into Actors R23, I48 and Diagnostics R8 in the user's words.
  Check: "a cleanup failure inside the app's own error handling", per combinator (`catchTag`, `catch`, `mapError`,
  `tapError`, `retry`, `catchCause`): a typed cleanup failure is lost and a dying one quarantines; no handler, the
  typed one quarantines. Pins Effect 4.1.4, so not red first.
- **3, owners-only (fixed).** Refuses every runner, aliases (`const`, `let` then `=`, package aliases), nested
  patterns, casts, static and run-time keys, rest patterns, default and `effect/internal` imports, `require`,
  `import = require`, dynamic `import()` (static or not), re-exports and exported aliases, a watched module used as
  a value, and Cause reads (`catchCause`, `tapCause`, `onExit`, `sandbox`, `Exit.match`, `Cause.pretty`, ...). No
  seeded names: only imported ones are watched. `src/host/cli` is exempt (a program no Runtime runs), planted
  silent. Check: `owners-only.test.ts` (red: 27, then 18 more lines missed by the earlier rule). Exit or Cause read
  by value (`exit.cause`) stays uncovered: it needs type-aware lint (FLOW-STATE.md says so).
- **5, Spec against code (fixed).** R23: dispose rejects CleanupFailed holding CleanupOverdue; the close waits two
  bounds (the core's, then one for the Owner tree from the core's end), chosen by correctness since one shared
  deadline makes every cleanup after a hung call overdue (marked Decision (agent), reverse in the text; the user may
  prefer it proposed); an Issue only in Open, Disposing and Disposed, elsewhere the Runtime's report alone, checked
  by "a cleanup failure in a life that records no Issue" (Stopped; the code already held, so green from the start);
  a stopped Runtime's defect leads its rejection. R27's abort sentences marked proposed, Q7 A's text restored. I47
  and I48 cited by `everyTaskAccounted` and cleanups cells. One `wk log add specs` note each.
- **6, self-reported count (fixed).** An Owner's own Scope release is traced as its task `scope` (`releaseTraced`),
  and Report no longer carries `own`; the rule counts every failure from Task records. Check: crafted traces in
  `rules.test.ts` with a failed Scope and a nested report (each dropped is a breach), the "Owner's own Scope" cell,
  fault `report-drops-own-scope`; `services-released-before-calls` and `report-before-tasks-end` rewritten.
- **7, code quality (partly).** `driver.ts` doc fixed. The rest stays for @task.V3.T102.
- **Faults:** `faults --only` in scratch copies, 7 of 7 caught by targets (the three new and four rewritten).

**Haiku review of the fix round (2, effort high), each verified:**

- Accepted: owners-only still missed `require`, `import = require`, template and run-time `import()`, `Reflect.get`,
  spread, array, member and default-parameter escapes, nested package patterns, and re-exports from `effect`
  (fixed by refusing a watched module used as a value, planted); the bare-name seed flagged shadowed names (seed
  removed, harness imports them); the CLI exemption was untested (planted); the rule doc claimed nested counts came
  from Task records (reworded: each Owner's own check anchors them); `close.ts` still said one bound; R23 lacked the
  stopped Runtime's order.
- Rejected: `Stream.run*`, `Channel.run*`, `Layer.launch` (they return Effects, which still run in an Owner); a
  closed Owner's no-op hearer and runPromise's (a closed child runs nothing; a run's failures are in its Exit, as
  the close review held); `unheard()` not marking entries (read once, after no ensure or lift can run); the Gotcha
  "pins a loss" (Q11 A); the orders oracle relying on the close awaiting incarnations (that is R23's rule); I48
  stating Q11 inline (asked in both places).
- Routed: an Exit read by value (needs type-aware lint, @task.V3.T102).
