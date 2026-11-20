# P3 coverage record

The P3 suite catches 124 of the 145 Spec rules P3's Tasks cite with a planted fault. Of the other 21, four were not
built in P3 and sit with their owners (Not built in P3); 17 have no fault and are deferred by the user (2026-11-19)
under Gaps, each with its proposed owner. Proposed to the user as part of @plan.Runtime's verification entry (a Plan
edit, the user's yes); until then it lives here, linked from @phase.V3.P3. It extends P2's record (@phase.V3.P2,
2026-11-16T02:04:05Z).

- **Covers:** the Spec rules P3's Tasks cite (@task.V3.T9, @task.V3.T17, @task.V3.T18, @task.V3.T19, @task.V3.T20,
  @task.V3.T54, @task.V3.T55, @task.V3.T79, @task.V3.T83 to @task.V3.T88, @task.V3.T90, @task.V3.T91, @task.V3.T94),
  across @spec.Actors, @spec.Codec, @spec.Compile, @spec.Diagnostics, @spec.Reads, @spec.Restore, @spec.Turn,
  @spec.WriteAhead and @spec.WriteLanes; the Plan outcomes those Tasks satisfy, as far as the routing file says
  (code:wiki/tasks/V3/P3-routing.md); `src/core/`, `src/host/` and the public entry points.
- **Suite:** `packages/flow-state-v3/tests` (Story tests by Spec area and fixture app, run rules and sweeps in
  `tests/rules/`, generated Stories and the pair sweep in `tests/generated/`, the surface test in `tests/surface/`,
  compile-time tests in `tests/types/`, CLI tests in `tests/cli/`) and the host and core tests beside the code in
  `src/`.
- **Rerun:** `nub run test` (no setup); `nub run test:stress`; `nub run faults` (scratch copies, each fault's targets
  first, the whole suite when they pass), or `nub run faults --only <name>` for one fault.
- **Mutants:** the dead core and the 334 named faults of code:packages/flow-state-v3/tests/faults.ts and the files it
  spreads (`tests/*-faults.ts`, 38 of them in `tests/rule-faults.ts`), each citing the rule it breaks; the per-rule
  list below names them, with the first test that caught each in the daily run (or its target, for the faults added
  after it). A Spec rule counts as caught when a fault citing it is caught.
- **Audit:** passed: the completion audit (R18) rerun at d8a8343a ran skill:policy-testing#audit-a-suite over this
  record.
- **Matched at:** d8a8343a. Suite 1181 pass, 23 it.fails; check at zero; faults 334 of 334: 295 in the daily run at
  636eb699, `throwing-slot-decode-escapes-boot` (retargeted) and the four other faults that edit
  `src/core/boundary.ts` by `--only`, and @task.V3.T101's 39 by `--only` (6 of them only by the whole suite). Stress
  last ran at 636eb699 (exit 0).
- **Scope:** fixtures over fake servers and storage, one tab, TestClock time, usual and stress profiles, the pair
  sweep at 200 seeds (1,000 for shop-store and auth-session). Excluded: real browsers and storage (@task.V3.T58,
  @task.V3.T28), reads (@task.V3.T21), the raw-throw class parked in @task.V3.T98 (9 it.fails), and the known bugs
  held as it.fails (23 in all).

## How the list was made

Rules: every Spec rule id a P3 Task's record cites (description, acceptance or comments), ranges expanded. Faults:
the `rule` field of each fault. Tests: rule ids in `it`, `it.fails` and `describe` titles. A rule whose tests cite
it only in a comment or under other words shows as having no test; the gaps below are checked by grep, not by
reading every test.

## Gaps

@task.V3.T101 planted 38 faults (code:packages/flow-state-v3/tests/rule-faults.ts), each caught by `nub run faults
--only` and named on its rule below; it ended at the user's time cap (2026-11-19), so these 17 rules are deferred by
the user (2026-11-19) to their proposed owners:

- **Built, tested, no fault yet:** Codec T6 (@task.V3.T92); Restore I11, T6 and WriteAhead I3, R1, R12, R14
  (@task.V3.T56); Turn R1 (@task.V3.T95); WriteLanes R12 (@task.V3.T56: `sent-without-persistence` plants a
  different breach, a NoPersistence decline with persistence on).
- **Built, no test cites it, no fault:** Codec T1 (@task.V3.T92); Compile R8 (@task.V3.T98; contradicted: src has
  no RestoreMissingInput and @task.V3.T17 routed R8 to @task.V3.T56, so it may belong under Not built in P3);
  Diagnostics R8, R9 (@task.V3.T100); WriteAhead R11, T9, T17 (@task.V3.T56); Turn T16 (@task.V3.T95).

## Not built in P3

Read in the code (2026-11-19) and re-grepped by T101's review; not counted as gaps. Each owner links this record.

- Diagnostics R10, no renderer: @task.V3.T100.
- Restore I20, a gone operation's lane is quarantined, never rewritten; Restore R4, no resource data is saved:
  @task.V3.T56.
- WriteAhead R16, no scope ownership: @task.V3.T56.

## Caught off-title

These faults count as caught, though no test titled by their rule catches them:

- `unknown-target-inverted` (Compile R9): only the whole suite, since it refuses every fixture's Flow.uncertain
  target at load (R9's own check firing in 99 files), so R9's titled test cannot run.
- `turn-publishes-twice` (Turn R5) and `lane-record-off-kind` (Codec R5) fail the run rules Turn I9 and Codec I7;
  `restored-lane-dropped` (Restore I13) fails WriteAhead I17, the lost ending I13 guards.
- `entered-keeps-activation` (Turn I5), `exits-outermost-first` (Turn I6), `equal-selection-heard` (Turn I28),
  `history-forgets-child` (Turn T3), `late-routed-as-current` (Turn T14), `denial-is-a-diagnostic` (Diagnostics R4)
  and `batch-drops-first-record` (WriteAhead R9): by their target tests, which cite other rules.

## Rules by Spec, with their faults and tests

Each line: the rule, up to three faults citing it (each with the file of its first catching test in the daily
run), then up to three test files citing it.

## Actors

- I19 Within one actor, events are admitted in: `mailbox-not-fifo` (tests/generated/mix.test.ts). Tests:
  tests/rules/rules.test.ts.
- I21 An actor with pending mail is served: `rotation-does-not-rotate` (tests/actors/mailbox.test.ts). Tests:
  tests/actors/mailbox.test.ts.
- I28 A consumer's slot is bound to one: `context-cycle-admitted` (tests/actors/context.test.ts). Tests:
  tests/actors/context.test.ts.
- I29 After disposeActor, every non-Idle lane still exists: `dispose-forgets-owed-rows` (src/host/ledger.test.ts). Tests:
  tests/actors/runtime-disposal.test.ts, tests/actors/lane-keeping.test.ts, src/host/ledger.test.ts.
- I35 During Runtime disposal, a call on the: `bound-forgets-the-wire` (src/core/cells.test.ts). Tests:
  tests/stories/steps.test.ts.
- I37 A shared actor that stays Free for: `free-actor-outlives-grace` (tests/actors/lifetime.test.ts). Tests: tests/actors/lifetime.test.ts,
  tests/write-lanes/write-ahead-records.test.ts.
- I38 Every commit not yet sent when Runtime: `disposal-queue-cancelled` (tests/actors/runtime-disposal.test.ts). Tests: tests/actors/runtime-disposal.test.ts.
- I42 `admit` gives every (Life, input) pair exactly one verdict: `host-ignores-rejected-ready`
  (src/host/life.test.ts, target). Tests: src/core/life.test.ts.
- I43 The disposal bound runs from the first: `refused-final-write-silent` (tests/actors/runtime-disposal.test.ts);
  `final-write-unbounded` (tests/actors/runtime-disposal.test.ts). Tests: tests/actors/runtime-disposal.test.ts.
- R4 Bootstrap failure and early calls: `dispose-actor-before-ready-runs` (src/core/life.test.ts);
  `boot-after-dispose-runs` (src/core/life.test.ts). Tests: tests/actors/identity.test.ts, src/host/life.test.ts,
  src/host/lanes.test.ts and 1 more.
- R5 Identity: `identity-is-the-raw-value` (tests/actors/identity.test.ts); `nested-conflict-admitted`
  (tests/session/values.test.ts); `conflicting-ref-admitted` (tests/actors/context.test.ts). Tests:
  tests/shop/store.test.ts, tests/command-palette/structure.test.ts, tests/actors/identity.test.ts and 5 more.
- R6 ensureActor and createActor: `local-actor-declined-without-persistence` (tests/actors/edges.test.ts);
  `creation-ignores-ref-input` (tests/actors/identity.test.ts); `local-actor-persists` (src/host/identity.test.ts) and 2
  more. Tests: tests/shop/store.test.ts, tests/actors/identity.test.ts, tests/actors/edges.test.ts and 1 more.
- R8 The end: `end-while-withheld` (src/core/persist.test.ts); `released-use-not-judged`
  (tests/actors/lifetime.test.ts). Tests: tests/shop/store.test.ts, tests/stories/steps.test.ts,
  tests/command-palette/large-list.test.ts and 6 more.
- R9 The return: `never-selected-slot-heard-as-same` (tests/actors/context.test.ts); `changed-slot-owes-no-wave`
  (tests/actors/context.test.ts); `return-without-wave` (tests/actors/context.test.ts) and 2 more. Tests:
  tests/actors/context.test.ts, tests/rules/reloads.test.ts, tests/sign-in/session.test.ts and 4 more.
- R10 Lanes follow identities: `boot-unparks` (tests/actors/runtime-disposal.test.ts). Tests:
  tests/lanes/lanes.test.ts, tests/rules/rules.test.ts, src/host/ledger.test.ts.
- R13 Order across actors: `context-follow-ups-capped` (tests/actors/follow-ups.test.ts). Tests:
  tests/actors/mailbox.test.ts, tests/actors/follow-ups.test.ts, tests/session/workspace.test.ts and 1 more.
- R14 No mailbox cap: `send-decodes-payload` (src/host/runtime.test.ts); `send-keeps-extra-keys`
  (src/host/runtime.test.ts); `send-untagged-raw` (src/host/runtime.test.ts) and 2 more. Tests:
  tests/lanes/lanes.test.ts, tests/transfers/standing-order.test.ts, tests/transfers/bank-app.test.ts and 7 more.
- R18 Context binding: `restore-binds-default-context` (src/host/restore.test.ts); `provider-loses-ref-override`
  (tests/session/workspace.test.ts); `record-forgets-provider-graph` (tests/session/values.test.ts) and 4 more. Tests:
  tests/shop/store.test.ts, tests/transfers/bank-app.test.ts, tests/actors/context.test.ts and 9 more.
- R19 Context waves: `throwing-selector-drops-value` (tests/actors/context.test.ts); `deferred-update-moves-to-end`
  (src/core/serve.test.ts); `wave-reads-unsettled-providers` (tests/actors/context.test.ts) and 6 more. Tests:
  tests/shop/store.test.ts, tests/transfers/bank-app.test.ts, tests/actors/context.test.ts and 10 more.
- R20 disposeActor: `provider-disposed-under-consumers` (tests/actors/context.test.ts). Tests:
  tests/shop/store.test.ts, tests/transfers/standing-order.test.ts, tests/transfers/bank-app.test.ts and 8 more.
- R21 forget: `forget-keeps-record` (tests/sign-in/session.test.ts). Tests: tests/shop/store.test.ts, tests/transfers/standing-order.test.ts,
  tests/transfers/bank-app.test.ts and 3 more.
- R22 Runtime disposal: `ensure-while-disposing-runs` (src/core/life.test.ts); `hidden-listener-outlives-runtime`
  (src/host/runtime.test.ts). Tests: tests/cells/structure.test.ts, tests/lanes/lanes.test.ts,
  tests/stories/steps.test.ts and 8 more; it.fails: tests/cells/structure.test.ts.
- R23 Disposal failure and the last write: `disposal-done-before-its-write` (tests/actors/runtime-disposal.test.ts);
  `disposal-writes-once` (src/host/lanes.test.ts); `empty-write-unanswered` (tests/actors/runtime-disposal.test.ts).
  Tests: tests/actors/runtime-disposal.test.ts, src/host/lanes.test.ts.
- R25 A defect stops the Runtime: `defect-keeps-runtime` (src/host/runtime.test.ts); `stopped-runtime-runs-calls`
  (src/host/runtime.test.ts); `stopped-dispose-succeeds` (src/host/runtime.test.ts) and 6 more. Tests:
  src/host/runtime.test.ts.
- T24 The admit table: every (Life, input) cell: `cancelled-boot-fails-as-service` (src/host/life.test.ts). Tests:
  src/host/life.test.ts.

## Codec

- I1 For every accepted value v: decode(encode(v)) equals: `codec-values-mirrored` (src/core/codec.test.ts). Tests:
  tests/transfers/standing-order.test.ts, tests/sign-in/trusted-device.test.ts, src/core/codec.test.ts.
- I2 A value of any size or depth: `codec-depth-cut` (src/core/codec.test.ts). Tests: src/core/codec.test.ts.
- I7 Every key the Runtime writes is `actor/<identity>`: `lane-record-keeps-mayHaveApplied`
  (tests/restore/restore.test.ts); `owed-row-without-channel` (src/host/lanes.test.ts); `owed-record-keyed-kept`
  (src/host/lanes.test.ts). Tests: tests/rules/rules.test.ts, src/host/ledger.test.ts.
- I8 For every Schema and value, the walker's: `optional-key-context-dropped` (src/core/boundary.test.ts). Tests:
  src/core/boundary.test.ts.
- R1 One codec, no size or depth bounds: `codec-text-by-stringify` (src/core/codec.test.ts). Tests:
  tests/transfers/durability.stress.test.ts, tests/transfers/durability.test.ts, tests/command-palette/structure.test.ts
  and 15 more.
- R2 Canonical encoding: `keys-in-insertion-order` (src/core/codec.test.ts). Tests: src/core/codec.test.ts.
- R3 Strict decoding: `non-canonical-decoded` (src/core/codec.test.ts). Tests: tests/restore/restore.test.ts, tests/session/values.test.ts,
  src/core/codec.test.ts.
- R4 Failures: `input-canonical-unchecked` (tests/restore/unencodable.test.ts); `unsaved-value-saved-null`
  (tests/transfers/durability.test.ts); `flow-made-row-counted-unsaved` (src/core/persist.test.ts) and 1 more. Tests:
  tests/transfers/durability.test.ts, tests/restore/deep-inputs.test.ts, tests/restore/unencodable.test.ts and 5 more.
- R5 Record kinds: `lane-record-off-kind` (tests/restore/restore.test.ts). Tests: tests/transfers/durability.stress.test.ts,
  tests/transfers/durability.test.ts, tests/restore/restore.test.ts.
- R6 One value boundary: `walker-on-call-stack` (tests/session/deep-tree.test.ts); `instances-compared-as-equal`
  (tests/session/deep.test.ts); `sparse-hole-ends-comparison` (src/core/same.test.ts) and 4 more. Tests:
  tests/restore/unencodable.test.ts, tests/session/values.test.ts, tests/session/deep-tree.test.ts and 5 more.
- T1 Size and depth: 5,000 items, 3,000,000 bytes: **gap, no fault**. Tests: none.
- T6 Record kinds: over every Story run, every: **gap, no fault**. Tests: none.

## Compile

- I3 A Construction that finds violations V throws: `violations-reversed` (tests/compile/construction.test.ts). Tests: tests/compile/construction.test.ts.
- R2 One construction failure: `construction-stops-at-first` (tests/compile/construction.test.ts);
  `payload-of-any-kind` (tests/compile/construction.test.ts); `handler-of-any-kind` (tests/compile/construction.test.ts)
  and 9 more. Tests: tests/transfers/standing-order.test.ts, tests/compile/construction.test.ts,
  tests/compile/corruption.test.ts and 2 more.
- R3 The machine adds nothing: `added-state-accepted` (tests/compile/construction.test.ts);
  `ending-to-undeclared-event` (tests/compile/construction.test.ts); `foreign-guard-by-name`
  (tests/compile/construction.test.ts) and 2 more. Tests: tests/transfers/standing-order.test.ts,
  tests/compile/construction.test.ts, src/machine.test.ts.
- R4 Declared shape: `name-length-capped` (tests/compile/construction.test.ts); `state-depth-capped`
  (tests/compile/construction.test.ts); `persist-of-any-kind` (tests/compile/construction.test.ts) and 15 more. Tests:
  tests/transfers/standing-order.test.ts, tests/compile/construction.test.ts, tests/compile/corruption.test.ts and 1
  more.
- R5 One source per memory field: `impure-default-accepted` (tests/compile/construction.test.ts);
  `computed-reads-computed` (tests/turn/creation.test.ts); `constant-start-unchecked`
  (tests/compile/construction.test.ts) and 1 more. Tests: tests/transfers/standing-order.test.ts,
  tests/turn/creation.test.ts, tests/compile/construction.test.ts and 3 more.
- R6 Pure creation: `creation-skips-input-check` (src/core/tree.test.ts). Tests: tests/actors/identity.test.ts,
  src/core/tree.test.ts.
- R8 Defaults at restore: **gap, no fault** (built or not: see Gaps). Tests: none.
- R9 Operations declared once: `unknown-target-inverted` (src/host/lane-record.test.ts). Tests: tests/transfers/standing-order.test.ts,
  tests/compile/construction.test.ts.
- R12 Names: `tilde-state-names-free` (tests/compile/construction.test.ts). Tests: tests/compile/construction.test.ts.
- R14 Types and Schemas: `send-decodes-payload` (src/host/runtime.test.ts); `event-payload-not-record-raw`
  (tests/compile/construction.test.ts); `payload-not-record-admitted` (tests/compile/corruption.test.ts) and 1 more.
  Tests: tests/transfers/standing-order.test.ts, tests/compile/construction.test.ts, tests/compile/corruption.test.ts
  and 3 more.
- T2 Construct a definition with three violations in: `construction-stops-at-first`
  (tests/compile/construction.test.ts). Tests: tests/compile/construction.test.ts.
- T3 Each rejected form of R4, R5, R9: `impure-default-accepted` (tests/compile/construction.test.ts). Tests:
  tests/compile/construction.test.ts.
- T9 Equal identities compile from equal source on: `schema-view-unequal` (tests/compile/compiled.test.ts). Tests: tests/compile/compiled.test.ts.

## Diagnostics

- I1 Every FlowError has nonempty diagnostics and code: `error-code-from-last` (tests/compile/construction.test.ts). Tests:
  tests/compile/construction.test.ts.
- I2 decode(encode(d)) equals d for every valid Diagnostic: `detail-accepts-nan` (tests/compile/compiled.test.ts). Tests: tests/compile/compiled.test.ts.
- I5 Every emitted code is in the closed: `callback-defect-outside-list` (tests/turn/creation.test.ts);
  `service-failure-outside-list` (src/host/runtime.test.ts). Tests: tests/turn/creation.test.ts,
  src/host/runtime.test.ts.
- R1 FlowError: `operations-throw-raw` (tests/compile/construction.test.ts); `body-throw-raw`
  (tests/compile/construction.test.ts); `entry-unwrapped` (tests/surface/surface.test.ts) and 1 more. Tests:
  tests/surface/surface.test.ts, tests/compile/construction.test.ts, tests/compile/corruption.test.ts and 1 more;
  it.fails: tests/surface/surface.test.ts, tests/compile/authoring-gaps.test.ts.
- R2 Diagnostic: `diagnostic-accepts-unknown-code` (tests/compile/compiled.test.ts); `dotted-tag-split`
  (tests/compile/construction.test.ts). Tests: tests/compile/compiled.test.ts, tests/compile/construction.test.ts.
- R3 Schema failures: `stray-throw-raw` (tests/surface/surface.test.ts). Tests: tests/surface/surface.test.ts,
  tests/compile/authoring-gaps.test.ts; it.fails: tests/compile/authoring-gaps.test.ts.
- R4 Diagnostics are not endings or denials: `denial-is-a-diagnostic` (tests/compile/codes.test.ts; off-title). Tests: none.
- R5 Actionable codes: `creation-issue-drops-schedule` (tests/actors/snapshot.test.ts). Tests:
  tests/surface/surface.test.ts, tests/actors/snapshot.test.ts.
- R6 Classification: `operations-throw-raw` (tests/compile/construction.test.ts); `body-throw-raw`
  (tests/compile/construction.test.ts). Tests: tests/compile/construction.test.ts, tests/compile/authoring-gaps.test.ts,
  src/host/runtime.test.ts; it.fails: tests/compile/authoring-gaps.test.ts.
- R7 A closed vocabulary: `denial-is-a-code` (tests/compile/codes.test.ts). Tests: tests/compile/codes.test.ts.
- R8 Complete causes survive cleanup: **gap, no fault**. Tests: none.
- R9 Causes stay in process: **gap, no fault**. Tests: none.
- R10 Safe rendering: **not built in P3** (@task.V3.T100). Tests: none.
- T1 Carrier and codec: every code in the: `diagnostic-accepts-unknown-code` (tests/compile/compiled.test.ts). Tests:
  tests/compile/compiled.test.ts.

## Reads

- R6 lookup: `newer-lookup-unsuperseded` (tests/write-lanes/payment-retry.test.ts). Tests: tests/transfers/bank-app.test.ts.
- R14 Rows: `waiting-never-read` (tests/write-lanes/policy-cells.test.ts). Tests:
  tests/write-lanes/policy-cells.test.ts.

## Restore

- I1 After ready, the live incarnations restored from: `boot-wakes-in-flight-only` (tests/restore/restore.test.ts);
  `boot-wakes-in-flight-only-swept` (tests/rules/sweep-4.test.ts); `boot-wakes-no-one` (src/host/lanes.test.ts). Tests:
  tests/actors/lane-keeping.test.ts, tests/write-lanes/payment-endings.test.ts, tests/rules/rules.test.ts and 2 more.
- I5 Per lane, deliveries at restore follow: that: `lanes-restored-newest-first` (tests/restore/restore.test.ts).
  Tests: tests/restore/restore.test.ts.
- I6 An Acknowledged Attempt with no owed row: `no-restored-unknown` (tests/stories/storage.test.ts);
  `head-restored-not-sent` (tests/transfers/trace.test.ts). Tests: tests/shop/pay.test.ts,
  tests/transfers/trace.test.ts, tests/actors/runtime-disposal.test.ts and 2 more.
- I8 A Runtime killed before a first send's: `first-send-before-landing` (tests/restore/restore.test.ts). Tests: tests/restore/restore.test.ts.
- I10 One record failing to decode never prevents: `first-bad-record-ends-read` (tests/transfers/durability.test.ts). Tests: tests/shop/unread-owed.test.ts,
  tests/transfers/durability.test.ts, tests/restore/restore.test.ts.
- I11 A quarantined record's bytes are unchanged until: **gap, no fault**. Tests: tests/transfers/durability.test.ts,
  tests/restore/restore.test.ts.
- I13 Lanes are never dropped by a version: `restored-lane-dropped` (tests/restore/restore.test.ts). Tests: tests/restore/restore.test.ts.
- I16 After a read failure, no write to: `failed-load-keeps-persistence` (tests/restore/restore.test.ts). Tests:
  tests/transfers/durability.test.ts, tests/restore/restore.test.ts.
- I17 A storage failure never changes committed live: `refused-write-landed` (tests/stories/storage.test.ts). Tests: tests/transfers/durability.test.ts.
- I18 dispose({ forget: true }) resolves success only: `forget-over-pending-write` (src/host/restore.test.ts). Tests:
  tests/transfers/durability.test.ts, src/host/restore.test.ts.
- I20 A lane record whose `operation` is gone: **not built in P3** (@task.V3.T56). Tests: none.
- R1 Records stay records: `boot-wakes-every-record` (tests/write-lanes/payment-endings.test.ts). Tests: tests/transfers/standing-order.test.ts,
  tests/stories/steps.test.ts, tests/actors/lane-keeping.test.ts and 4 more.
- R2 Context and resets at restore: `consistent-reload-owes-context` (tests/rules/reloads.test.ts). Tests: tests/transfers/standing-order.test.ts,
  tests/actors/context.test.ts, tests/write-lanes/payment-leave-and-reload.test.ts and 3 more.
- R3 Delivery order at restore: `displaced-not-saved` (src/host/lane-record.test.ts); `queued-restored-unknown`
  (tests/write-lanes/policy-cells.test.ts). Tests: tests/shop/pay.test.ts, tests/transfers/trace.test.ts,
  tests/stories/reload.test.ts and 8 more; it.fails: tests/restore/restore.test.ts.
- R4 Data and placements after restore: **not built in P3** (@task.V3.T56). Tests: none.
- R5 Record formats and undecodable records: `null-format-read-as-current` (tests/restore/restore.test.ts);
  `newer-format-read` (tests/restore/restore.test.ts); `fresh-start-unreported` (tests/restore/restore.test.ts) and 13
  more. Tests: tests/shop/unread-owed.test.ts, tests/transfers/durability.test.ts, tests/restore/restore.test.ts and 3
  more; it.fails: tests/restore/restore.test.ts.
- R8 Lane quarantine: `cancel-keeps-quarantine` (tests/restore/restore.test.ts). Tests: tests/restore/restore.test.ts;
  it.fails: tests/restore/restore.test.ts.
- R9 Storage failures: `load-failure-unreported` (tests/transfers/durability.test.ts). Tests: tests/transfers/durability.test.ts, tests/restore/restore.test.ts,
  tests/session/workspace.test.ts.
- R10 Forgetting a scope: `forget-before-boot` (src/host/restore.test.ts); `forget-deletes-nothing`
  (src/host/restore.test.ts). Tests: tests/transfers/durability.test.ts, tests/session/workspace.test.ts,
  src/host/restore.test.ts.
- T6 Record formats: every record states its format: **gap, no fault**. Tests: tests/session/values.test.ts,
  src/core/actor-record.test.ts.

## Turn

- I1 At every publication exactly one leaf is: `first-leaf-skipped` (src/core/tree.test.ts). Tests: tests/player/player.stress.test.ts.
- I5 Every Activation at or above the Boundary: `entered-keeps-activation` (tests/write-lanes/payment-leave-and-reload.test.ts; off-title). Tests: none.
- I6 Exits are ordered deepest first and entries: `exits-outermost-first` (src/core/tree.test.ts; off-title). Tests: none.
- I9 Each turn publishes at most once, and: `accepted-publishes-on-change` (tests/transfers/transfers.test.ts);
  `owed-wave-publishes-unchanged` (tests/session/workspace.test.ts); `context-issue-published-twice`
  (tests/generated/generated.test.ts) and 1 more. Tests: tests/transfers/transfers.test.ts, tests/rules/rules.test.ts,
  tests/session/workspace.test.ts and 1 more.
- I14 A refused or pre-commit-defective turn leaves state: `refused-turn-reported` (tests/turn/refusal.test.ts);
  `refused-publishes-nothing` (tests/shop/pay.test.ts); `computed-delay-unbounded` (tests/turn/refusal.test.ts). Tests:
  tests/shop/pay.test.ts, tests/turn/refusal.test.ts, tests/rules/rules.test.ts.
- I26 An ending is routed from the active: `adopted-ending-late` (tests/actors/lane-keeping.test.ts). Tests:
  tests/actors/lane-keeping.test.ts.
- I27 A late turn never exits an Activation: `late-exit-ignores-queue` (src/core/serve.test.ts). Tests:
  src/core/serve.test.ts.
- I28 An onContext event is enqueued only after: `equal-selection-heard` (tests/actors/context.test.ts; off-title). Tests: none.
- I31 An issue is cleared only by its: `success-clears-first-issue` (tests/actors/snapshot.test.ts). Tests: tests/actors/snapshot.test.ts.
- R1 One active leaf: **gap, no fault**. Tests: tests/shop/store.test.ts, tests/player/player.stress.test.ts,
  tests/player/player.test.ts.
- R2 Handler selection: `alternatives-reversed` (tests/turn/refusal.test.ts). Tests:
  tests/number-input/number-input.test.ts, tests/transfers/standing-order.test.ts, tests/turn/refusal.test.ts and 5
  more.
- R3 Self, re-entry and order: `boundary-above-handler` (src/core/tree.test.ts). Tests: tests/player/player.test.ts.
- R4 Subroutines and history: `history-as-default` (src/core/tree.test.ts); `history-before-the-move`
  (src/core/tree.test.ts). Tests: tests/shop/store.test.ts, tests/player/player.test.ts, src/core/tree.test.ts.
- R5 One turn: `turn-publishes-twice` (tests/transfers/transfers.test.ts). Tests: none.
- R12 Guards: `first-guard-only` (tests/number-input/number-input.test.ts). Tests: tests/shop/store.test.ts,
  tests/transfers/standing-order.test.ts, tests/actors/context.test.ts and 2 more; it.fails: tests/shop/store.test.ts,
  tests/transfers/bank-app.test.ts, tests/actors/context.test.ts, tests/sign-in/session.test.ts,
  tests/sync/repo.test.ts.
- R14 Schedule arming: `implicit-self-shadows-root` (tests/player/player.test.ts); `computed-delay-unbounded`
  (tests/turn/refusal.test.ts); `fixed-delay-unbounded` (tests/compile/construction.test.ts) and 6 more. Tests:
  tests/shop/store.test.ts, tests/shop/pay.test.ts, tests/number-input/number-input.test.ts and 10 more; it.fails:
  tests/player/sleep-timer.test.ts.
- R20 The owner test: `late-from-root` (tests/player/player.test.ts); `late-implicit-off-route`
  (src/core/turn.test.ts); `owned-ending-routed-current` (tests/write-lanes/payment-late-answers.test.ts). Tests:
  tests/write-lanes/payment-late-answers.test.ts, tests/player/player.test.ts, src/core/ledger.test.ts.
- R21 A late turn may not leave live: `late-leaves-owner` (tests/write-lanes/payment-leave-and-reload.test.ts). Tests: tests/write-lanes/payment-late-answers.test.ts,
  src/core/serve.test.ts.
- R22 Context reactions: `baseline-forgets-frame` (tests/actors/context.test.ts); `defect-moves-baseline`
  (tests/actors/context.test.ts); `equal-context-not-silent` (tests/actors/context.test.ts). Tests:
  tests/shop/store.test.ts, tests/actors/context.test.ts, tests/sync/repo.test.ts and 1 more.
- R23 Snapshot shape: `private-fields-leak` (tests/turn/creation.test.ts); `refused-turn-raises-no-issue`
  (tests/actors/snapshot.test.ts); `snapshot-hides-schedules` (tests/actors/snapshot.test.ts). Tests:
  tests/turn/creation.test.ts, tests/compile/construction.test.ts, tests/actors/snapshot.test.ts and 2 more.
- R24 Snapshot values: `admitted-values-unfrozen` (tests/turn/immutable.test.ts); `memory-not-plain`
  (tests/stories/storage.test.ts). Tests: tests/turn/immutable.test.ts, tests/rules/rules.test.ts,
  src/core/frozen.test.ts.
- R25 Issues by source: `issue-cleared-by-any-source` (tests/actors/snapshot.test.ts); `issue-never-cleared`
  (tests/actors/context.test.ts). Tests: tests/actors/snapshot.test.ts, tests/actors/context.test.ts,
  tests/session/values.test.ts.
- T3 Subroutines and history: exit, abandonment, an ancestor's: `history-forgets-child` (src/core/tree.test.ts; off-title). Tests: none.
- T6 Refused turns: an out-of-range computed schedule delay: `creation-delay-drops-all` (tests/turn/creation.test.ts);
  `creation-delay-silent` (tests/turn/creation.test.ts). Tests: tests/turn/creation.test.ts,
  tests/compile/construction.test.ts.
- T14 Owner test: a late ending routed as: `late-routed-as-current` (tests/write-lanes/payment-leave-and-reload.test.ts; off-title). Tests: none.
- T16 onContext: a provider change wave with an: **gap, no fault**. Tests: none.

## WriteAhead

- I3 A local identity never has an actor: **gap, no fault**. Tests: tests/restore/restore.test.ts.
- I21 Every lane and identity whose entry a step changed has its record key marked: `firing-unwritten`
  (tests/write-lanes/write-ahead-records.test.ts, target); `capture-skips-marked-key` (src/core/persist.test.ts,
  target); `second-record-writer` (tests/write-lanes/one-builder.test.ts, target) and 3 more. Tests:
  tests/write-lanes/write-ahead-records.test.ts, tests/rules/rules.test.ts, src/core/persist.test.ts and 5 more.
- I11 At every landed state, a lane record's: `unencodable-identity-half-written` (src/core/persist.test.ts). Tests:
  src/core/persist.test.ts.
- I12 A dirty plain record's capture is issued: `refused-batch-waits` (tests/write-lanes/write-ahead-records.test.ts);
  `default-interval-zero` (tests/write-lanes/write-ahead-records.test.ts); `interval-debounced`
  (tests/write-lanes/write-ahead-records.test.ts). Tests: tests/write-lanes/write-ahead-records.test.ts.
- I15 For a persisted identity, adapter invocation of: `acknowledged-before-landing` (tests/stories/storage.test.ts);
  `ticket-answered-by-empty-batch` (tests/stories/storage.test.ts); `refusal-reaches-first-namespace-only`
  (tests/generated/mix.test.ts). Tests: tests/rules/rules.test.ts.
- I17 After a crash, every Acknowledged Attempt without: `displaced-lost-with-its-lane`
  (tests/write-lanes/policy-cells.test.ts). Tests: tests/rules/rules.test.ts, tests/restore/restore.test.ts; it.fails:
  tests/restore/restore.test.ts.
- I20 At every landed state, a persisted identity's: `owed-row-never-queued` (tests/stories/fake.test.ts);
  `queued-rows-unsaved` (src/core/persist.test.ts). Tests: tests/rules/rules.test.ts, src/core/persist.test.ts.
- I22 A row leaves the owed record only: `heard-mailbox-row-kept-on-disk` (src/core/persist.test.ts). Tests:
  src/core/persist.test.ts.
- I23 Every batch is one Store write, and: `one-identity-per-batch` (tests/write-lanes/write-ahead-scope.test.ts);
  `two-batches-out` (tests/write-lanes/write-ahead-scope.test.ts); `batch-never-out`
  (tests/write-lanes/write-ahead-records.test.ts). Tests: tests/write-lanes/write-ahead-records.test.ts,
  tests/write-lanes/write-ahead-scope.test.ts, tests/rules/rules.test.ts and 1 more.
- I24 At every landed state, a lane record's: `held-lane-in-flight` (src/host/ledger.test.ts). Tests: tests/write-lanes/write-ahead-records.test.ts,
  tests/write-lanes/payment-endings.test.ts.
- R1 Persistence is opt-in and scoped: **gap, no fault**. Tests: tests/sign-in/session.test.ts.
- R4 What an actor record holds: `unencodable-silent` (tests/restore/unencodable.test.ts). Tests:
  tests/transfers/durability.test.ts, tests/command-palette/large-list.test.ts,
  tests/command-palette/large-list.stress.test.ts and 7 more.
- R5 Lane records: `refused-capture-left-in-flight` (tests/write-lanes/write-ahead-records.test.ts);
  `start-keeps-lanes-unwritten` (tests/transfers/trace.test.ts). Tests: tests/transfers/trace.test.ts,
  tests/write-lanes/write-ahead-records.test.ts.
- R9 Atomic scope: `batch-drops-first-record` (tests/sign-in/session.test.ts; off-title). Tests: none.
- R10 When records are written: `drain-backlog-waits-for-input` (src/host/ledger.test.ts). Tests:
  tests/command-palette/structure.test.ts, tests/write-lanes/write-ahead-records.test.ts,
  tests/write-lanes/one-builder.test.ts and 2 more.
- R11 No scope bounds: **gap, no fault**. Tests: none.
- R12 The store contract: **gap, no fault**. Tests: tests/write-lanes/write-ahead-records.test.ts,
  tests/write-lanes/write-ahead-scope.test.ts, tests/restore/unencodable.test.ts.
- R13 Acknowledge before sending: `refused-acknowledgement-sent` (src/core/cells.test.ts); `sent-before-acknowledged`
  (tests/stories/storage.test.ts); `resend-capture-uncounted` (tests/write-lanes/write-ahead-records.test.ts) and 2
  more. Tests: tests/shop/store.test.ts, tests/stories/storage.test.ts, tests/write-lanes/write-ahead-records.test.ts
  and 5 more.
- R14 Honest uncertainty after a crash: **gap, no fault**. Tests: tests/cells/structure.test.ts,
  tests/shop/store.test.ts, tests/lanes/lanes.test.ts and 4 more; it.fails: tests/cells/structure.test.ts,
  tests/transfers/bank-app.test.ts.
- R16 Scope ownership: **not built in P3** (@task.V3.T56). Tests: tests/transfers/durability.test.ts, tests/actors/edges.test.ts.
- T9 Scale and providers: 5,000 badges' records (`session/stress-wall`): **gap, no fault**. Tests: none.
- T17 One stream: actor A hears an ending: **gap, no fault**. Tests: none.

## WriteLanes

- I3 Every delivered ending is exactly one of: `unsent-as-failure` (tests/stories/storage.test.ts). Tests:
  tests/rules/rules.test.ts, src/host/lanes.test.ts.
- I7 retryCount equals the number of invoked re-sends: `record-forgets-retries`
  (tests/write-lanes/payment-retry.test.ts); `resend-uncounted` (tests/write-lanes/lane-anchors.test.ts). Tests:
  tests/write-lanes/lane-anchors.test.ts.
- I15 Per Attempt and per incarnation, each ending: `displaced-ending-misrouted`
  (tests/write-lanes/policy-cells.test.ts); `ending-heard-twice` (src/core/ledger.test.ts). Tests:
  tests/shop/pay.test.ts, tests/command-palette/palette.stress.test.ts, tests/actors/lane-keeping.test.ts and 3 more.
- I27 Every admitted commit, at every quiescent point: `queue-outlives-disposal`
  (tests/write-lanes/policy-cells.test.ts); `queue-not-saved` (tests/write-lanes/policy-cells.test.ts). Tests:
  tests/rules/rules.test.ts, src/host/ledger.test.ts.
- R2 Three channels: `decline-named-failure-stays-definite` (tests/actors/edges.test.ts). Tests:
  tests/shop/store.test.ts, tests/shop/pay.test.ts, tests/stories/steps.test.ts and 10 more.
- R4 Mapping endings: `not-sent-mapped-unknown` (tests/sign-in/session.test.ts). Tests: tests/shop/store.test.ts.
- R6 The lane: `kept-blocks-cancel-policy` (src/host/ledger.test.ts). Tests: tests/shop/store.test.ts,
  tests/stories/steps.test.ts, tests/write-lanes/ending-delivery.test.ts and 2 more.
- R7 Concurrency cells: `latest-keeps-every-queued` (tests/write-lanes/policy-cells.test.ts); `serialize-as-latest`
  (tests/lanes/lanes.test.ts); `serialize-capped` (tests/lanes/lanes.test.ts). Tests: tests/shop/store.test.ts,
  tests/shop/pay.test.ts, tests/lanes/lanes.test.ts and 7 more.
- R10 Exactly one delivery: `rows-dropped-outside-ledger` (tests/write-lanes/one-builder.test.ts). Tests:
  tests/turn/refusal.test.ts, tests/actors/lane-keeping.test.ts, tests/write-lanes/payment-held.test.ts and 8 more;
  it.fails: tests/cells/structure.test.ts, tests/transfers/bank-app.test.ts.
- R12 Values with no form and missing persistence: **gap, no fault** (`sent-without-persistence` plants a different
  breach; @task.V3.T56). Tests: tests/restore/deep-inputs.test.ts, src/host/runtime.test.ts.
- R14 cancel: `cancel-keeps-unsent-head` (src/core/cells.test.ts). Tests: tests/cells/cells.test.ts, tests/write-lanes/payment-held.test.ts,
  tests/write-lanes/policy-cells.test.ts and 5 more.
