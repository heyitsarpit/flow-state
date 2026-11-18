# P3 close routing

Every undelivered part of the Plan outcomes P3's Tasks satisfy now has a later owner, and every orphaned review item
from P3's Tasks has one fate. All ownership here is proposed, for the user's read (P3 close fix round, 2026-11-19).
Each owner Task has a comment naming what it owes and a `satisfies` link, except where noted.

## Plan outcome parts

Checked against the code at the P3 close fix round; "delivered" parts are left out.

- @plan.Diagnostics.O1: FlowError's `evidence` field → @task.V3.T29 (its scope already names it); closed
  `details.reason` values → @task.V3.T98; the Interruption classification, untested → @task.V3.T100 (new). The
  SchemaValidation scope is delivered: the Plan lets a boundary use a more specific code.
- @plan.Diagnostics.O3: cleanup keeping the execution failure primary, cleanup-only ordering, Interruption, and the
  CLI printing `Cause.pretty` (code:packages/flow-state-v3/src/host/cli/main.ts) → @task.V3.T100; promise adapters
  and AbortSignal keeping the Cause (`runPromise`) → @task.V3.T99 (new).
- @plan.Diagnostics.O4: no renderer; Diagnostics R10 and I10 untested → @task.V3.T100.
- @plan.Inspection.O2: SSR payloads through the codec → @task.V3.T30; trace artifacts and Model bytes through the
  codec, and codec failures as FlowError (CodecMalformed, CodecSchemaMismatch) → @task.V3.T49; strict UTF-8 and
  byte arrays that callers cannot mutate → @task.V3.T28; equal bytes on every host → @task.V3.T58.
- @plan.Persistence.O4: tests for restore through a subscription, new incarnation ids, no input at ensure, no replay,
  endings before new external events, late results across a restore, and the pending reset (unbuilt) →
  @task.V3.T56 (it already owns the parked endings, held as it.fails); finite resource requests and restored
  resource data → @task.V3.T21; hidden-tab resume → @task.V3.T58; feeds → @task.V3.T25; lazy code at capture and
  restore → @task.V3.T48.
- @plan.Persistence.O6: `basedOn` and predictions (unbuilt) → @task.V3.T24; a head restored as its parked ending →
  @task.V3.T56; a direct test that the adapter waits for the acknowledgement, no silent downgrade on a transient
  storage failure, and Attempt ids never reused by a later Runtime → @task.V3.T28.
- @plan.Runtime.O1: construction runs no callback, loader, service or storage, nothing registers at run time, and
  call sites never supply wiring (a type test) → @task.V3.T98; the durable identity of app, machine and actor →
  @task.V3.T92.
- @plan.Runtime.O5: a selection with no canonical form is UnencodableValue, a context change never resets memory,
  and capture never sees half a wave, all untested → @task.V3.T95; silent baselines at lazy adoption →
  @task.V3.T48 and at hydration → @task.V3.T30.
- @plan.Runtime.O6: `unsettledWrites()`, CleanupFailed with the ref quarantined, HoldForgotten, `runPromise` and
  RuntimeDisposed for it and createActor, unbound lane records reported at each boot, idempotent actor disposal,
  consumers before providers, unstarted events dropped, no machine event at disposal → @task.V3.T99; ReleaseOverdue
  for placements → @task.V3.T57 and for stream sessions → @task.V3.T25; parked endings at restore (it.fails) →
  @task.V3.T56.

Not linked: `wk link` and `wk edit --set satisfies` refuse the multi-line `satisfies` arrays of @task.V3.T21,
@task.V3.T29, @task.V3.T30, @task.V3.T48 and @task.V3.T49 (REFERENCE_ARRAY, then TASK_FIELD on the closing `]`),
though `wk check` passes them. Their comments say what they owe; the links wait on a wk fix or the user.

## Review items

The orphaned items of the close-out review (R11), ids from the sweep of the review comments on @task.V3.T18,
@task.V3.T55, @task.V3.T83 (with the T84 items routed to it), @task.V3.T85 to @task.V3.T88, @task.V3.T90,
@task.V3.T91 and @task.V3.T94. 54 items: 35 to an owner Task, 5 to revisit.md, 2 fixed here, 12 dropped.

- **@task.V3.T21** (1): A5, T18's unbuilt WriteLanes R4 not-retained unknown, per-policy row shapes and
  `outstanding`.
- **@task.V3.T29** (9): A18, performance finding 13 (the generator's view eager per pull); A22, deep recursions in
  the tooling's print.ts and sweep.ts; A23 and A59, the WriteAhead I20 run rule reads in-memory owed rows, not
  stored records; A31, serialize-deep's commits are identical, so its order is unchecked; A44, QUIET_LIMIT is 1,600,
  not 4 x 385; A45, stressSeed uses the palette's 5.2 s for every fixture; A46, nothingInvokedDisposing asserts only
  a length; A105, Fake storage's release and refuseHeld complete a shared Deferred with no alive check.
- **@task.V3.T35** (17): A29 and A33, serialize copies its queue on every add (quadratic; slope 0.55 against 0.3);
  A32, about 280 B kept per actor create and dispose; A78, `--timing` still present; A83 to A89, A93 to A98, the bench
  tool's leftovers from T87's reviews (timer from spawn, limits test red under load, kill race, compare worktree left
  on a signal, a crash fails the batch, `--workers 1` spread 0, stressFrom unchecked, cap-tree start and SIGINT
  untested, healthy worker killed when ps is empty, relative `--benches`, backfill signals, finalizers skipped,
  vacuous checks).
- **@task.V3.T58** (1): A28, no dev host gives a workClock, so SlowWork fires only in tests.
- **@task.V3.T72** (2): A64, rename the ShopApi, CartApi and GitApi keys; A65, place commands.ts, contracts.ts and
  the cells' Pay base by code:wiki/conventions/fixtures.md.
- **@task.V3.T92** (1): A48, an owed row's ending kind as one tagged value (Commit, Declined, Lookup, Restored).
- **@task.V3.T96** (2): A26, RuntimeDefaults is public and read live, so make it internal or frozen when loopGuard
  gets its reader; A30, follow-ups.test.ts's title says 64, and Actors I21's "within one rotation" misses bursts.
- **@task.V3.T97** (1): A118, T94's admit-throw acceptance is a runtime.test.ts case, not a Story test.
- **@task.V3.T98** (1): A13, the verdict-to-FlowError text is built twice (driver.ts and runtime.ts).
- **revisit.md** (5): A17, A107 to A110, the faults runner's leftovers (one entry).
- **Fixed here** (2): A113, the pairSweep limit's comment now names auth-session too; A122, the `no-throw-in-core`
  exemption no longer lists src/entry.ts, which throws nothing itself.
- **Dropped** (12): A18's finding 14, superseded by the faults amendments (daily background run, `--only`); A25,
  test cost only, and the user accepted T83's timings as the baseline; A40, a lint check on test timeouts is process
  machinery the user declined; A47, A54, A79 and A123, settled in their own review comment; A57, no longer true
  (snapshot.ts reads no Life tag); A58, fixed in T84 (fault `stopped-ended-reads-disposed`); A60, the local
  toolchain, not the product; A92 and A101, done (`bench/history/tooling.csv` exists); A111, a done Task's wording.
