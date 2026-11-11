# Questions for an advisor (Fable 5.2, high effort)

Queued 2026-11-11 for an advisor model, to run after the 5-hour usage window resets (about 14:30 IST). Each question
names the files to read. The advisor reads, answers each question with a recommendation and its reasons, and writes
its answers to `advisor-answers-2026-11-11.md` beside this file. It changes no code or record.

**Context in one paragraph:** Flow State v3 is a TypeScript state-machine runtime with write lanes, actors,
write-ahead persistence and restore, specified in `workflow/specs/core/*.spec` (183 Invariants). A conformance suite
(`packages/flow-state-v3/conformance/`) judges a runtime through one Port, with oracles, cases and mutants; it is
proven against a prototype runtime (`packages/flow-state-v3/prototypes/round-14/`) and will judge production
(`packages/flow-state-v3/src/`). The run is the V3 Epic (`workflow/tasks/V3/epic.task`, notes in `log.task`). Agents
(Claude Opus leads, Haiku sidecars) write the Specs, the suite and production, and review each other.

## Q1. Judging a runtime without trusting its reports

Six reviews in a row found the same class: a runtime's own report deciding what it owes (the turn header choosing
the row, a quiet `Released`, a `Nothing` target, a missing `Incarnated`). Each fix anchored one more trigger to a fact
the suite observed. Is there a principled design that closes the class at once? Compare: (a) the current trigger
table (every obligation from a suite fact or a claim another oracle judges); (b) a full reference interpreter that
runs the machine definition on the driven events and compares; (c) something else. Weigh common-mode risk with the
runtime.
Read: `proposals/convergence-step9-review-2026-11-11.md`, `proposals/step9-revision-review-2026-11-11.md`,
`conformance/dsl/lifecycle*.ts`, the trigger table in `conformance/STATUS.md`, skill:policy-testing.

## Q2. Suite size and where the line is

The lifecycle model is 3,634 lines, 2.6 times its design's estimate, and models attempts, lanes, endings,
obligations and turn selection. Where is the line between a model that judges a runtime and a second runtime? How
would you make it smaller and still sound?
Read: `proposals/lane-oracle-convergence-v2-2026-11-11.md`, `conformance/dsl/`, `conformance/write-lanes/`.

## Q3. Is round-14 still the right reference?

P3's exit needs the suite green on round-14, but round-14 differs from the Spec in a growing list (redelivery,
equal-deadline order, KeyRequired, queued commits at disposal), each a stated limit. Should the second implementation
be a small Spec-derived executable model instead? What would it cost and what would it catch?
Read: the round-14 limits in `conformance/STATUS.md` and `conformance/not-yet.ts`, `workflow/specs/spec-log.md`.

## Q4. Checking the Specs' consistency, and which prover

The 183 Invariants held 26 conflicts found only by a paid audit or a builder tripping over them. The user will bring
back TLA+ or another prover if it actually helps. Which tool fits best here: TLA+/TLC, Apalache, Quint, Alloy, P,
Lean or Dafny, or a solver over Invariant pairs? What exactly should be modelled (the write-lane protocol, disposal
and restore, turn selection), how big would the model be, and what would it have caught of the 26?
Read: `proposals/invariant-audit-2026-11-11.md`, `workflow/specs/core/WriteLanes.spec`, `Actors.spec`,
`Restore.spec`, `Turn.spec`.

## Q5. Hand-written cases versus generated ones

The suite has about 111 hand-written cases and about 150 mutants. Would model-based or property-based testing
(random driven event sequences, a seeded fake world, the same oracles) find more with less work? What would it need
from the Port and the world?
Read: `conformance/port.ts`, `conformance/world/`, `conformance/dsl/case.ts`, a few `*.scenarios.ts`.

## Q6. Correlated blind spots and agent claims

One model family writes the Specs, the suite and production, and reviews them. Agents repeatedly overclaimed (rows
moved to a later phase on a false "the prototype can't show this", verdict changes missing from logs). How much
independence is needed, from which model or method, and which claims should a machine check instead of an agent?
Read: the 2026-11-11 notes in `workflow/tasks/V3/log.task`, `proposals/t8-t7-rows-review-2026-11-11.md`.

## Q7. When reviews stop paying for themselves

Every review so far found a High finding; reviews are about a third of usage. Does that mean the build process
produces holes faster than it should, so the fix is upstream (briefs, design, generated tests)? Or is it the normal
cost of a suite this subtle? What review shape gives the most correctness per unit of usage?
Read: the review files in `workflow/plans/flow/references/proposals/` dated 2026-11-10 and 2026-11-11.

## Q8. Interleaving suite and production

P3 (suite) and P4 (production) now interleave by area: each area's suite is proven and audited before its
production module. Is that enough to stop the suite and the code from co-adapting? What else would you add?
Read: the interleave line in `workflow/tasks/V3/epic.task`, the P4 and P11 to P15 phase cards.

## Q9. Is Invariant count the right measure?

Coverage is tracked as Invariants checked (72 of 183), each with a mutant caught by that Invariant. Is that a
meaningful measure of suite strength? What would you track instead or as well (mutation score per Invariant, state
coverage of the lifecycle tables, cross-area interactions)?
Read: `conformance/coverage.ts`, `conformance/not-yet.ts`.

## Q10. Production core's shape

The core is meant to be pure, synchronous and deterministic (about 0.2 ms a turn), returning work as data, with
Effect only in the host. Given what the suite has learned (the lifecycle tables, the obligations), should
production's lane and turn core share any of those definitions, or must it stay independent of the suite? What
risks do you see in the first production files?
Read: AGENTS.md "Code style (v3 production)", `packages/flow-state-v3/src/`, `workflow/tasks/V3/P4.task` (T16 to
T18).
