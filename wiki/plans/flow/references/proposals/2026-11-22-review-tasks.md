---
review review-tasks
status open 2026-11-22
---
# Review: the V3 Tasks that link the v3 Specs, and the execution slices (2026-11-22)

**Verdict: ISSUES.** The Tasks are mostly ready: every open Task that links a v3 Spec has existing Spec ids, the
guidance sentence, a Supersedes line whose `code:` cites all resolve, and a complete Correctness item. Five findings
block coding: nothing is open to start, `wk next` hands out the blocked T118, T56 and T21 contradict the slice order,
T77 and T72 are in no slice, and two Tasks still read dead rule numbers. The rest is minor. Checked by script over all
55 draft, open and in-progress Tasks (cites, ids, blockers, cycles) and by reading T118, T120, T21, T56, T72, T113
and T131.

## Blocks coding

- **No Task is ready.** `wk list task --ready` is empty: 55 are `draft`, T72 is `open` but blocked, T118 is
  `in_progress` but blocked. Slice 1 (T131, T120) cannot be picked by `wk next`. Fix: open T131 and T120 first, with a
  V3 log note, then each later slice's Tasks as that slice starts.
- **T118 is `in_progress` while blocked by T120.** `wk next` reports "In progress: T118" first, so an orchestrator
  following it builds slice 2 before slice 1. T118 shows "Ready: no (task-not-open, unresolved-blocker)". Fix: set
  T118 back to `open` (its red sequence test is kept) until T120 is done, and say so in a comment.
- **T56 is in slice 5 but blocked by T21, which waits on all of slice 6.** T21 is blocked by T121 to T124. So slice 5
  cannot finish, and T121 and T124 need only T92. The Task's reason is `resource({ persist: true })` writing a format
  (now T124). Fix: re-point T56's blocker from T21 to T124 and move T56 to a slice after 6 (name it 6b), or drop the
  blocker if T92's format step already covers it; update slice 5 to T92 alone.
- **T77 and T72 are in no slice, and T21 is in none either.** T77 (Declared emits, heard by `onEmit`) is blocked by
  T127 and T128 and blocks T22, T72, T73 and T30; it shares @spec.Changes R19 with slice 8. T72 (open) and T21 are
  umbrellas that close T129/T130 and T121 to T124. Fix: add T77 to slice 8 (after T128); list T72 with slice 9 and T21
  with slice 6 as "closes with the slice" (their own acceptance repeats T121 to T124's items: drop or point to them).
- **Dead rule numbers in acceptance.** T118 acceptance 4 says "R25 text, P1 and P2 as built (R5, R14)" and its Read
  first and comments use R25, P1, P2 and "Turn R17"; @spec.Schedules has R1 to R17 only. T56 cites "Turn R22" (a slot
  added by a later release); T113 acceptance 1 cites "Turn R27"; T92 cites "Restore R7 and R8" in a comment. Fix: map
  each to its @spec.Schedules or @spec.Records id (R25 to Schedules R5/R13 or wherever the check order now lives) in
  T118 and T56 acceptance; T113 acceptance to Schedules R16; comments may keep the history.

## Minor

- **Proposal citations in descriptions (not comments).** "Read first" or "Why now" cites @proposal.* in T118
  (schedule-issues), T119 (spec-handover, spec-turn-parts), T121 to T124 (spec-handover), T125 and T126
  (spec-data-layer, spec-handover), T127 to T130 (spec-boundary-channels), T131 and T132 (spec-errors-trust), T108
  (react-instrumentation-bippy), T97 (two @review records), T72 (`ui-primitives-decisions` by git hash), and
  @review.spec-cohesion-r2 in T127 to T132. Fix: replace with the Spec section or `algorithm` heading each absorbed;
  keep the proposal only in a comment. Also T21 cites "decisions §5 G1, G2" and T113 an advisor question.
- **Old slice labels in titles clash with the new numbers:** T21 "(slice 5)", T56 "(slice 2b)", T109 "(slice 3c)",
  T110 "(slice 3d)". Fix: drop the parentheses from the titles.
- **T120 and T113 leave Types R8's typed half unowned.** T120 says "the public types follow in T113", but T113's cover
  list is R1 to R3, R9, R10, R13 to R15, with no R8; T120's Correctness item asks for type tests it says it does not
  build. Fix: add R8 (the type side) to T113's Correctness line, and word T120's type-test item as "none until T113".
- **Two Spec requirements are in no Task's "Tests cover":** @spec.Types R7 (cost bounds; the Types.md H5 bench row) and
  @spec.Host R15 (memo key set, @plan.React.O2). Fix: give R7 to T113 (the `construct.*` bench rows) and R15 to T30.
- **Missing Correctness item on Tasks that build features:** T23, T24, T25, T73, T108, T116. T72 and T73 are fixtures
  and T24/T25 have no Spec yet (T25 needs its design first, per slices.md); T108 and T116 link no v3 Spec. Fix: state
  "no v3 Spec; Correctness when the Spec exists" in T24, T25 and T108, and add the item to T23 and T116.
- **T92 shares one format step with T118 but is not blocked by it** (T118 writes the schedule row of Records R12's
  step 5 to 6; T92 "adds the other rows"). The slice order holds it. Fix: add `blocked_by T118` to T92 so a reorder
  cannot break it.
- **Blockers on done Tasks** (T57, T58, T17, T20, T9, T69, T70) in T21, T22, T56, T72, T73, T76, T109, T111, T112,
  T113, T28 to T30, T114. Harmless; fix: unlink them at the next record sweep.
- **Slice size.** Slice 4 (T119: Changes R1 to R26 and nearly all of I1 to I17) and slice 6 (all of Operations, R1 to
  R15, plus Records R8, R16, R18) look too big for one 5-hour window; slice 3 (T113: ~100 hand-typed parameters, nine
  `machine.ts` symbols, and a type spike first) is borderline. Fix: pre-split slice 6 into 6a (T121, T122) and 6b
  (T123, T124) now, and let slice 4 split along the walk, the applier and alarms, mail, as slices.md allows.
- **Slice 10 mixes unrelated owners:** T100 (Operations R9, R13), T22 (Types R4 to R6, Host R13), T23 (no Spec). Fix:
  move T100 to slice 6 or run it alone; keep T22 with T23.
- **P5 draft grouping fails on a P9 blocker.** T98 (P9) is blocked by T132 (P5) yet blocks T106, T24, T25, T30, T48
  and T115 (P5). T132 with T106 cannot share a slice. Fix: move T98 into P5 after T132, or decide before P5 starts.
- **No cycle** was found, and no Task is blocked by a later slice other than T56/T21 and the unsliced T77 above. The
  host track (T112, T111, T97, T117) has no blocker on slice 4, so its "once slice 4 lands" rule rests on the slices
  list alone; fine, but say it in the T112 description.
- **Correctness items are identical boilerplate except the last line.** Each carries every required element (fixture
  app, Story plus wrong ending, test runs it, two-sided type pins, planted fault, existing tests, Spec ids), so a
  builder gets the contract. The Spec-id line is what differs; T119 lists Invariants I1 to I17 though its Requirements
  omit R12, R13, R16 (their tests are T109's), so its Invariants list should drop those that belong to T109.
