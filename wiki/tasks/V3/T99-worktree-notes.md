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

1. The close review of T99.
2. The `lanes` saved stress Story mismatch, from the main line's fixture rewrite (being fixed there).
3. The typed-cleanup finding above, for a decision.
