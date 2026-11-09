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

| Sidecar | Area | Result | How it was checked |
|---|---|---|---|
| 1 | Machines O1-O8, Runtime O5 | accepted, changed | ids used in Compile and Turn tests pass the reference check; `p1h.default-runs`, `r15.creation-decodes-input`, `a1.a-failed-default-is-a-value` kill lines read. Changed: its "Fragments may not declare context" and keyed/restartOn rows say no case exists; the Specs mark those tests "no prototype wrong runtime" rather than citing a case. |
| 2 | Runtime O2-O7, Operations O3, O7 | accepted, one row rejected | `mutants-lifetime.ts:26-96` read in full: each `life.*`, `id.*`, `d*.`, `o6.*` id kills the case the table names. Its list of guarantees with no case (RuntimeNotReady, BlockedByDependents, CleanupFailed, ConflictingActorRef, the 1,024 cap, isolation) is carried into Actors as open items. Rejected: its retry-budget row cites `edge.no-retry-cap` (D83), but that mutant edits the storage edge's backoff cap in edge.ts, not retryable's times; WriteLanes cites no wrong runtime for RetryLimit. |
| 3 | Operations O1, O2, O4-O6, EntityDomains | accepted for O1, O2, O5, O6; streams and entities set aside | Streams and entity rows wait for those Specs (phase 5). Its finding that the prototype has no staleTime, gcTime, setData, placeholder, InvalidKey or key bounds was confirmed by grep (no prototype .ts file names any of them), and Reads marks them "no prototype wrong runtime". |
| 4 | Persistence, LazyFeatures, ServerRendering, CLI O5; the three hydration questions | accepted for Persistence and CLI; lazy and SSR set aside | Its quotes on the three questions were read against the plans at the cited lines; the questions are listed, not settled, in `spec-split.md` (scope change). Its finding that O7 (second tab) has only a browser harness is moot: O7 moved to phase 5. |

## Decisions made while writing (the runner's delegation)

- The split itself (`spec-split.md`).
- `specs/runtime/Runtime.spec` is marked superseded in its basis, not by status: the format allows
  open coverage only while a Spec is proposed, and every one of its rows is open.
- Every Requirement's evidence is `open_by` its Spec's Q1 ("executable checks are not built"): no
  production test exists yet, and a prototype case is evidence about the prototype only.

## Changes

None yet.
