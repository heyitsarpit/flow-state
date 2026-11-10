# Spec log

Status: current. The record of how the core Specs were written and changed: sidecar results and how
each was used, and every later change to a Spec with its reason. Specs are guides; building may
change them, and each change is logged here.

## Scope

The core Specs listed in `spec-split.md` only. Feature areas are written when their phase starts.

## Reference check

`spec-refcheck.pl` (beside this file) checks what `workflow check` does not: every `@plan.X.Y` and
`@spec.X.Y` resolves to an entry, and every backticked prototype id in a Spec's tests section occurs
in `packages/flow-state-v3/prototypes/round-14` or `.../conformance`. It was seen failing on a file
naming outcome O9 of Machines and a plan Nope (two misses reported, exit 1).

## Sidecar results

Four read-only Haiku sidecars (effort high) mapped plan guarantees to prototype cases, wrong
runtimes and design rules. Each table row was used only after a check here. "Existence" means the
reference check found the id in the prototype; "kill read" means the mutant line naming its target
case was read.

| Sidecar | Area                                                                              | Result                                                      | How it was checked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Machines O1-O8, Runtime O5                                                        | accepted, changed                                           | ids used in Compile and Turn tests pass the reference check; `p1h.default-runs`, `r15.creation-decodes-input`, `a1.a-failed-default-is-a-value` kill lines read. Changed: its "Fragments may not declare context" and keyed/restartOn rows say no case exists; the Specs mark those tests "no prototype wrong runtime" rather than citing a case.                                                                                                                                                          |
| 2       | Runtime O2-O7, Operations O3, O7                                                  | accepted, one row rejected                                  | `mutants-lifetime.ts:26-96` read in full: each `life.*`, `id.*`, `d*.`, `o6.*` id kills the case the table names. Its list of guarantees with no case (RuntimeNotReady, BlockedByDependents, CleanupFailed, ConflictingActorRef, the 1,024 cap, isolation) is carried into Actors as open items. Rejected: its retry-budget row cites `edge.no-retry-cap` (D83), but that mutant edits the storage edge's backoff cap in edge.ts, not retryable's times; WriteLanes cites no wrong runtime for RetryLimit. |
| 3       | Operations O1, O2, O4-O6, EntityDomains                                           | accepted for O1, O2, O5, O6; streams and entities set aside | Streams and entity rows wait for those Specs (phase 5). Its finding that the prototype has no staleTime, gcTime, setData, placeholder, InvalidKey or key bounds was confirmed by grep (no prototype .ts file names any of them), and Reads marks them "no prototype wrong runtime". Changed: it gave some cases by variant line only; their group ids were resolved by reading the files (REV6-H4, REV4-H5, MED-03, REV4-H1).                                                                              |
| 4       | Persistence, LazyFeatures, ServerRendering, CLI O5; the three hydration questions | accepted for Persistence and CLI; lazy and SSR set aside    | Its quotes on the three questions were read against the plans at the cited lines; the questions are listed, not settled, in `spec-split.md` (scope change). Its finding that O7 (second tab) has only a browser harness is moot: O7 moved to phase 5.                                                                                                                                                                                                                                                      |

## Decisions made while writing (the runner's delegation)

- The split itself (`spec-split.md`).
- `specs/runtime/Runtime.spec` is marked superseded in its basis, not by status: the format allows
  open coverage only while a Spec is proposed, and every one of its rows is open.
- Every Requirement's evidence is `open_by` its Spec's Q1 ("executable checks are not built"): no
  production test exists yet, and a prototype case is evidence about the prototype only.

## Changes

### Fix pass after the phase 2 completion audit

From `phase-2-completion-audit.md` (B1-B5, m1-m27, over-design 1-3) and the runner's rulings on it.

- **B1, old-version lanes** (runner's ruling: the prototype and Persistence win). WriteLanes R11,
  I17 and T7: only an older key fingerprint is a hold; an older identity version's lane is
  re-keyed and blocks nothing. `Operations.plan` O3 changed to match @plan.Persistence.O5, since
  the prototype re-keys (round-14/durable.ts) and declines only on the key fingerprint
  (round-14/lane.ts).
- **B2, delivery count** (runner's ruling). WriteLanes I15 now counts per Attempt and per
  incarnation, with the exceptions written out (refused re-send capture, unknown { Restored } per
  incarnation, redelivery after a refused admission, releasing lanes, evidence-only endings); R10
  points to it. Turn R9 and I15 follow Machines O3: an ending admitted in a Denied or Unhandled
  turn keeps its lane effects and counts as delivered.
- **B3, Attempt ids** (the runner's ruling, a correctness call). Ids are unique across devices
  and scopes, because a server may use the Attempt id as its idempotency key; the mint draws on
  entropy the host supplies as data at boot (a random session seed), so the core stays
  deterministic given its inputs. WriteLanes R5, I6, Q4, T18; WriteAhead R12 and I18 now say
  "never equal to any id on disk"; Actors R24 points to WriteLanes R5. The prototype's
  boot-floored counters do not meet this; phase 4 builds the seeded mint and phase 3 writes the
  colliding-counter wrong runtime.
- **B4, dead wrong runtimes.** Removed `d114.decline-no-input`, `d118.let-go-keeps`,
  `d123.keyless-cancel-nothing`, `d122.mail-fifo`, `d122.rota-forgets`,
  `durable.head-first-at-restore` and `durable.memory-decode-failure-ignored`; each guarantee
  keeps a live wrong runtime, except mailbox FIFO, which is marked "phase 3 writes". The folded
  check then found an eighth, `d78-old-id-stays` (its id has no dot, so `mutcheck.pl` skipped it);
  removed. Mis-aimed ones moved or dropped (m24): `p1h.default-runs` to Compile T3 (ImpureDefault),
  `m1.key-order-matters` to Reads T3 (key versions), `d74-*` and `d76-*` dropped from Reads T9
  (they edit entities.ts), `o6.no-bound` relabelled as the last-fiber wait in Actors T16.
- **B5.** WriteAhead R10, I12 and T5: a capture is issued within 5 s; nothing bounds the storage
  wait; the frozen-page and Safari limits are carried in.
- **Over-design (amendment 13).** Reads keeps what the prototype proved; staleTime, gcTime,
  trailing refetch, setData, invalidate, clear, the 256 batch, placeholders, contract.get, key size
  bounds and InvalidKey, focus triggers and optimistic stacking moved to `spec-split.md`'s
  "written when their phase starts" (Reads R4, R7, R11, R12, R15 removed; R1, R3, R5, R8, R10, R13
  narrowed). WriteLanes R13 keeps only the lane-side hook; record queues, their bounds and
  ModuleDisabled moved to the entity store area. Codec and Diagnostics are headed as the Specs
  most likely to change.
- **Minors.** m1-m9 restored the dropped Machines rules in Turn R6, R7, R14, R16, R17, R18, R21,
  R23 and Compile R11; m10 marks the rule order proposed; m11 Actors R9; m12 wiring gaps refused
  at admission (Compile R18, T10); m13 WriteLanes R5; m14 the "(the runner's ruling)" and
  "(agent-judged)" tags restored in Restore R5, R7, R8, WriteAhead R12, Actors R11; m15 proposed
  names marked; m16 Reads R8, R10, R13; m17 bigint in Reads R3; m18 idempotency in Reads R1; m19 the
  fresh-start limit in Restore R5 and I13; m20 Codec bounds in WriteAhead R4 and T13; m21
  Diagnostics R8; m22 closed reasons deferred in Diagnostics R2 and T1; m23 InvalidTurn named as
  check's denial (Turn T6, Q3; Actors R13); m25 every untested Invariant now has a test, most
  marked "phase 3 writes"; m26 sources name only placed outcomes, the duplicated OldVersionActor
  and forget rules point to Restore, and `transaction` is provided by Reads only; m27 the join
  artifacts fixed.
- **Checks.** `mutcheck.pl` is folded into `spec-refcheck.pl` as check 4 (a cited single-edit
  wrong runtime must still apply); it was seen failing on the previous Actors.spec, naming the two
  rotted `d122` ids. `invcheck.pl` reports no untested Invariant.
- **Why m27 happened.** `workflow format` joins two words when it re-wraps a continuation line
  that has no trailing space. Every Spec was unwrapped to one line per value, formatted to a fixed
  point (`workflow format --check` passes on each), and scanned against a dictionary plus the plan
  vocabulary; 30 joined words were split. Edit Specs by replacing whole values, then format.

### Phase 3, conformance round 3 (the lane-cells oracle)

Found while writing the `lane-cells` oracle and its lies (packages/flow-state-v3/conformance).

- **WriteLanes R14, cancel on Idle.** "Idle: nothing, with evidence" named no evidence kind: R3's
  closed list (Superseded, NothingToResend, InFlight, Released) has none for it, and the
  prototype records only its internal cell trace, which no public report carries. Now "Idle:
  nothing, and no ending". The oracle allows evidence there and fails any ending. The wrong
  runtime `audit-1.cancel-all-idle-silent` differs from round-14 only in that internal trace, so
  T10 names `p1h.cancel-all-idle-declines` (an Idle `cancelAll` that declines) instead.
- **WriteLanes T4, `lane.promote-skips-durable`.** It sends a promoted head with no
  acknowledgement: that breaks WriteAhead I15 (acknowledge before send), not I11 or I12 (the head
  is promoted only after the old one resolved). Moved to WriteAhead T7. T4 now names the phase 3
  wrong runtimes for I11 and I12.
- **WriteLanes T9, `lost.letgo-silent`.** It drops the record of a kept ending a cancel lets go:
  an ending neither delivered nor recorded, WriteLanes I15. Moved to T6. T9 names the phase 3
  wrong runtime `lane.cancel-wire-as-never-sent`.
- Edits to T4, T6, T9, T10, R14 and WriteAhead T7 kept the trailing space on each continuation
  line (the Edit tool strips it; it was restored on the exact lines), and `workflow format --check`
  passes on both files.

## The `User's read` field dropped (2026-11-10)

- **Conformance.spec, five agent decisions (R4, R6, two in R7, R9).** The trailing
  `User's read: pending.` is removed from each; the decisions, their reasons and their `Reverse`
  lines are unchanged. The user's call: the field tracked a read that does not happen, and the
  decision convention no longer has it.

## Turn.spec R1 to R11 link their Plan items instead of copying them (2026-11-10)

- **Turn.spec R1 to R11.** Each `must` restated @plan.Machines.O2 or O3 nearly word for word, so a
  rule lived in two places. Each now names the behaviour in one line and defers to its `source`;
  the invariants and tests, the checkable part, are unchanged. The user's call: Specs come after
  Plans and link the items they derive from. Reverse: restore the text from git.
- R12 to R25 still restate @plan.Machines.O4 to O8; not changed in this pass.
