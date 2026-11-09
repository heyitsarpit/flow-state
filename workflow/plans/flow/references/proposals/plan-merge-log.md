# Plan merge log (phase 2, roadmap v12, amendment 11)

The merge lead's record of the phase 2 plan merge: one section per plan, in the roadmap's order. Each section lists
the edits (before, after, the decision behind each), the superseded sentences and where each is marked, the
conflicts found (with the recommended answer, the judge and how reversible it is), and the sidecar results used.

Source of truth: `references/explorations/machine-fragments/machine-design.md` (OD1-OD54; section 5's rows, cited
here as P*n*, C*n*, T*n* and "fragments row"). Where the design and the prototype
(`packages/flow-state-v3/prototypes/round-14/`, STATUS.md) disagree, the prototype wins unless that breaks a design
guarantee (amendment 11). Nothing here is decided by the user unless the design records it so; runner and agent
rulings and proposed names are marked in the plans as the design marks them.

## Conventions used in the plans

- **Superseded sentences** are kept, quoted, in a closing `Superseded:` paragraph of the outcome that held them, each
  with a pointer to its replacement (the section 5 row, or the OD). Nothing superseded is deleted silently.
- **Pointers** name the design row only (C*n*, P*n*, T*n*, "fragments row", OD*n*); no invariant or rule number is
  needed to read the contract, since each plan states the rule's content itself.
- **Status marks.** User decisions carry no mark. Runner or agent rulings say "(the runner's ruling)"; names the user
  has not confirmed say "(proposed name)". `status proposed` on every plan is unchanged.
- **Wording.** Plans keep their own sentences where the design does not touch them, and keep content the prototype
  never reached.

## Falsification of the gate (`workflow check`)

Run 2026-11-09 on a scratch copy of `workflow/` (plus the one spec path `workflow/spec.index` names) in the session
scratchpad, never in the repository:

| Copy | Change | `workflow check` exit | Result |
| --- | --- | --- | --- |
| clean | none | 0 | "Repository is valid." |
| broken structure | `verification` renamed `verificatoin` in Machines.plan | 1 | `UNKNOWN_PLAN_FIELD` at the renamed field and each V entry |
| broken reference | `@plan.Runtime.O6` changed to `@plan.Runtime.O99` in Machines.plan prose | 0 | **not caught** |

Finding: `workflow check` validates plan structure, not `@plan.X.Y` references inside prose. The merge therefore runs
a second check after every plan, a read-only Perl script in the scratchpad that resolves every `@plan.X.Y` and local
`@Y` against the plans' entry ids; it fails on the O99 copy (exit 1, "missing @plan.Runtime.O99") and passes on the
repository. Both checks pass after every plan below.

## Sidecars

Three Haiku research sidecars (effort high, read-only), started before the first plan. Each result was read line by
line against the cited files before use.

| Sidecar | Slice | Result |
| --- | --- | --- |
| S1 | merge 5's amendments by target (`merged/entity-analysis/proposal.md` 6.4) against EntityDomains, CommandLine, Inspection, Package | 22 rows; used per plan below |
| S2 | prototype vs design (`round-14/STATUS.md`) | divergence table; checked per plan below |
| S3 | named diagnostics in the design, and names in Diagnostics.plan and CommandLine.plan | inventory; used for Diagnostics and CommandLine |

S2's general result, **accepted** after checking: every divergence it lists in STATUS.md either names the design row
that later took it in (OD49-OD54, C162-C216, all amended inline in the design) or is a stated limit or a "not built"
item. The design already records them, so merging from the design does not merge stale text where the prototype went
further. Items STATUS.md lists as "not built" stay in the plans as contract (the prototype never went there), and
are named in each plan's section below where they touch it.

## Machines

Rows merged: fragments rows (Machines O1 x5, O2 x2, O3, O4, O8), P5, P6, P7, P8, P11, P21, C12, C13, C14, C37-C41,
C54-C58, C90, C114, C121, C123, C124, C137, C139 (pointer), C145, C156, C157, C160, C162, C164, C170, C175, C184,
C185, C211 and C213 (pointers to Persistence O5). C19 and C20 were already superseded or deleted in the design.

| # | Outcome | Before | After | Decision |
| --- | --- | --- | --- | --- |
| M1 | title | "...states, turns, guards, schedules, activities and reactions" | adds "fragments" | fragments rows |
| M2 | O1 | "A definition requires id, states and events." | adds internalEvents, memory, traits, operations, context, persist (default false), subroutine and `Flow.state` nodes | fragments row; C37; C160; C175 |
| M3 | O1 | events/internalEvents records only | adds `Schema.Struct` payload checks refused at admission, `Flow.uncertain` and `UnknownNotUncertain` | fragments row; C145 |
| M4 | O1 | "Optional input and memory are Schema field records. Nonempty memory requires initial({ input }) ... Original input is unavailable thereafter." | memory field modifiers (`Flow.input`, `Flow.initial`, `Flow.private`), one source, one default (`TwoDefaults`), pure defaults (`ImpureDefault`, proposed), type-side creation check, read-only machine input, `IdentityFieldOptional` (proposed), restore of missing fields | fragments row; C121; C137; C156; C157; C184 |
| M5 | O1 | "Optional operations is a flat record of operation or entity-domain handles." | `operations: ({ E }) => ({ ... })`, one write operation per contract per actor, `O` exported, select typed at its transition | C37 |
| M6 | O1 | (none) | fragments: trait and subroutine contracts, ports, summary, placement, `.resumable()`, `.each`, `resetOn` with null/undefined, one namespace, fragment operations scope, `Fragment.O`, release on leave | fragments rows; C54; C114 |
| M7 | O1 | reserved names "is and child, and top-level root" | adds `self`, `__proto__` (`ReservedStateName`) and construction errors list, pointing to CommandLine O5 | C145; rule 12 |
| M8 | O1 | "duplicate activity or schedule names reject"; "Activity parameters may read earlier activities' lanes, parents before children; cyclic dependencies reject." | duplicate schedule names only; placement selects read after memory and lanes | C40 |
| M9 | O2 | "token.is(snapshot) includes descendants" | "token.is(snapshot or state)"; state-token guard elements; history | fragments row; P5 |
| M10 | O2 | "target is required and is this machine's token or "self"" | omitted target means "self" | C123 |
| M11 | O2 | re-entry wording | re-entry naming the handler's own state is a new activation; "self" keeps it | C164 |
| M12 | O2 | (none) | subroutine entry, exits and abandonment; callbacks never leave the placement node | fragments row |
| M13 | O3 | "An accepted transition computes updateMemory before action parameters; both read the pre-turn snapshot and event." ... "One invalid action rejects the whole turn" | the normative turn algorithm and the before / before-walk / after memory views and lane reads; defect rules kept | fragments row; C13 |
| M14 | O4 | "A guard receives { event, state, memory, context, activities }" | adds `schedules`, `operations`; `Flow.Denial`; `idle`, `retryable`, `get`; `Fragment.O` reads | fragments row; C38; C55 |
| M15 | O4 | check "uses the same handler, alternative and fallthrough rules" | runs the turn's steps 2-6, publishing nothing; `InvalidTurn`, `NotInState` | fragments row |
| M16 | O5 | "Entry arms a schedule; exit cancels it." | `armOn`, `disarmOn`, `Flow.entry`, delayed constructs, implicit schedule trigger | P7; C56 |
| M17 | O5 | "restartOn ... establishes a silent baseline" | baseline from the activating turn's after memory | P8 |
| M18 | O5 | "if its declaring activation ended before handling, it is discarded" | each arming has an id | P11 |
| M19 | O5 | (none) | keyed schedules | C14; C39 |
| M20 | O5 | "On restore or resume, a Duration preserves its deadline and fires once if overdue" | adds returns after an end and returning uses; schedules wait while unused | C124; OD45 |
| M21 | O6 | "activities: { name: O.x.subscribe(params, { outcomes?, placeholder?, when? }) }" and the finite-action / subscription outcome lists | placements list, `subscribe.each`, `DuplicatePlacement`, `VerbMismatch`; endings mapped on the operation | C40; C57; C90; C1; C5; C6 |
| M22 | O6 | (none; Operations O2 had "State exit does not cancel finite work") | the owner test, late turns, pending work, stay-put rule, `flow check` error, accepted risk (runner's ruling) | C12; C162; C164; C170; C185 |
| M23 | O7 | (none) | one FIFO mailbox with sends, endings, timers; one wave on a return | P21; OD31 |
| M24 | O8 | "activities (named lanes, undefined when not running). It has no input, methods, timers or public revision." | fragment slices, keyed lists, `schedules`, `operations`, private fields omitted outside, quarantined lifecycle reading; "no input, methods or public revision" | fragments rows; P6; C41; C58; R14 D7 |
| M25 | V1-V7 | verification lines | extended to the merged contract (no V removed) | follows M1-M24 |

Counts: 25 edits; 15 superseded sentences marked (O1: 6, O2: 2, O3: 2, O4: 2, O5: 5 rows merged into 4 marks, O6: 5,
O8: 2; counted per quoted sentence).

Conflicts:
- **MC1, agent-judged, applied.** The design says a definition's `persist` sits on `definition(...)` (U19 A, OD51),
  while the prototype's STATUS.md recorded `persist ?? true` before Q5 A. Q5 A (OD50) and the prototype now agree on
  `false`. Recommended: `false`, opt in on the definition. Judge: the user (Q5 A, decided). Reversible: one default.
- **MC2, agent-judged, applied.** The snapshot's `lifecycle` keeps the plan's `disposing` beside the design's
  `quarantined` reading for an undecodable record; the design's "ending" state (2.7.17) has a terminal snapshot and
  does not rename `disposing`. Recommended: keep `disposing`. Judge: the runner (wording). Reversible: one word.

Prototype check (S2): H1's `ImpureDefault` is built (accepted, merged as proposed name); "a default evaluated at each
door" is an implementation freedom (OD51), so the plan omits it. U9's creation check lives only in the typed front
end in the prototype; the plan states the contract, not where it lives. No other STATUS.md item touches Machines.

Process note: the 100-column wrap of this plan's new paragraphs was applied by a scratchpad Perl script rather than
by Edit; the content is exactly what was written with Write. Later plans are wrapped by Write and Edit only.
