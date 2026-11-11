# Round 12: the review's fixes, `Compiled` settled, and the compile prototypes

Status: **everything here is proposed.** Builder-run; the independent review that follows is the measure. Decisions D213-D220 are in `../convergence-12.md`; every difference between the compile prototypes and `machine-design.md` is in `api-changes.md`; the mid-session review is `review-mid.md`. Marks: [ran], [read], [reasoning].

Commits: checkpoint `95bdc962`, `8042188f` (the compile prototypes), `44a68715`, `468915a2` (mid review copied), `9989eb89` (its fixes), `ea988ed8`, `9f000431` (the final code commit, gated below), and this file's commit.

## The answer

**The design's public API compiles to `Compiled`, and the suite boots that output and nothing else: 751/751, with every one of round 11's 742 cases printing exactly its round 11 output, and RECIPIENTS unchanged but for the new cases** [ran]. `conformance/compile/` holds three compile prototypes, operations, fragments and machines, over shared memory, events and body modules. Round 11's fixture front end is deleted; every typed fixture (71 machines over 21 files) is written in the design's spelling: the ordered state list, placement in the definition (`traits`, `Flow.state(..., { traits })`, `{ NAME: Sub }`), `trait` and `subroutine`, `.each` and `.resumable()` on the placed value, bodies nested as states are, `lookup` on resources, `Flow.uncertain` checked on `unknown:` targets, `target: exits.Done` behind a guard, `retry(k)` and `cancel(k)`, and each member's select typed by its handler's event. `typed/compare-all.ts` (73 pairs, 4 stated, 0 unexplained) and `typed/compare.ts` (52, all stated) show the port changed spelling, not output.

**The 696 headline, restated (round 11 review M4):** of the 696 cases that boot only typed output, **407 boot machine-only typed output and 289 boot a typed machine with D209's `Compiled`-shaped `domain` or `streams` block**, which is not the design's entity or stream API and is the entity round's [ran: `typed/census.ts`]. 29 more boot typed output a case edits; 21 boot a hand machine (F2's keys and F11's open memory, labelled runtime robustness).

## Step 1: round 11's review, by root cause

| Finding | Done |
| --- | --- |
| **H1** services untyped; a miss an unnamed `Defect` | D213: contracts name services; the type refuses a list missing one (and, mid review L1, a non-tuple list); the boot is typed by `R` at one erasure (`servicesFor`); the seal refuses a missing service by name (`SealMissingService`), so no write can be marked unknown for it; a `Defect` carries its cause. D218 (mid review H1): a fragment's `R` reaches its host's. Pinned: 4 `types-check` directives, `front-check`, `R12-SERVICES`, `R12-BOOT`, `R12-DEFECT` |
| **M1** D207's refusals and `legacy.ts` unpinned | `SealDuplicatePath`, a bare function below ops, the hand commit's path, each hand read's and stream's path pinned in `front-check`. Both `legacy.ts` branches kept: the domain branch is reached by four cases, the stream branch by the `listen.load` search (cutting it turned that search red, round 12 run) |
| **M2** memory restore and input decode | D214: memory as fields; creation checks the input (D219: by its type side); the restore rule for a release-added field. Pinned in `front-check` and through the Runtime (`R12-DOORS` ×3, `R12-MEMORY`) |
| **M3** `keyFields` naming nothing | D215: `inputFields`; the key made from `keyFields` at the seal; `SealKeyField`, `SealKeyTwice`, `SealNoKey`; `flow check`'s `KeyField` |
| **M4** the 691 headline | restated above |
| **M5** rekey on a hand machine only | `R12-KEYS`: a typed release changes the key's fields and rekeys; the harness compiles again at the boot after a release. Mid review M2 found the second variant vacuous; with the new field supplied it sent a second charge beside an unsure one [ran]. **D217** (coordinator's call, proposed for Arpit): such a commit declines beside the older lane |
| **L1, L2, L4** | F6's guard, rule 51 and two machines' services pinned; the stale mutants retargeted to `compile/` |
| The 10 survivors | Rerun as builder mutants on round 12 (below): all killed, but `legacy.listens-left-bare` (no booted hand machine has listens: equivalent) |

## Step 2: `Compiled`, changed once (D213-D216)

`Op.services`, `Op.inputFields`, `keyFields` the one key source, memory `fields` with required `restore` and `encode`, `events` required; `CompiledOutput` types what a compiler emits; `CompiledData` requires the same. `idleMs` left for streams (D210). Owed, to the entity round (mid review M4): requirements as data for `domain.repair` and stream Effects, and event payload Schemas. The table, and what a failed decode means at each door, are in `../convergence-12.md`.

## Step 3: the compile prototypes

See "The answer". `api-changes.md` lists, per row of `round-11/api-changes.md`, what is retired, and every remaining difference from the design: two API changes (services on contracts and at the boot), the seams kept (`index`, `labFollowUps`, `labHostOp`, a subroutine's `name`), and the deviations (D209's module blocks, `output` unread, guards without `state`, no `Flow.optional`, `Flow.private` not hidden outside, a trait with exits allowed, a type limit on an inline definition).

## Builder mutants on round 12 [ran]

Each applied by hand to a copy in the scratchpad, run against the one gate that should see it, then reverted. Builder-written, not an independent number.

| Mutant | Killed by |
| --- | --- |
| `gate.dup-path-allowed`, `gate.walk-function-allowed`, `legacy.commit-path`, `legacy.reads-one-path`, `mem.initial-computed-blind`, `alt.exit-guard-lost`, `op.dup-op-unchecked` (round 11's survivors), `seal.services-unchecked`, `seal.keyfield-unchecked`, `compile.uncertain-unchecked` | `checks/front-check.ts` |
| `drive.services-last-only` | `R12-SERVICES` |
| `mem.restore-undecoded` | `R12-MEMORY` |
| `drive.release-no-recompile` | `R12-KEYS` |
| `step.defect-cause-dropped` | `R12-DEFECT` |
| D217 removed | `R12-KEYS/…-declines-beside-the-older-lane` (two requests) |

## Gates, on `9f000431`, one at a time [ran]

| Gate | Result |
| --- | --- |
| Suite, `--round 12` with catalog | **751/751**; output alone 0; unlogged none; stale lock 0; catalog none; RECIPIENTS as written |
| `mutate-one` control: suite, `--swap`, compare, date check, CLI pins, every `checks/*.ts` (types: `TYPES PASS`, 13 directives; front: 45 pins, 71 machines, 6 corruptions), the 5 s gate | `{"killedBy":null}`, 192 s |
| falsify `suite1`, `suite2`, `suite3`, `tamper`, `mutants`, `search`, `watch` | each `FALSIFY every gate fails on what it should` (`h.restore-absent-lost` retargeted to `legacy.ts`'s identity restore, killed in 4 cases) |
| falsify `lies`, 32 slices | all 32 `every gate fails on what it should`, each under 191 s |

Not run: real-browser modes, Safari, `nub run verify`, the formatter and the linter (prototypes), the old mutant lists through `mutate.ts` (its control plus a mutant passes the 5-minute command limit).

## Not done, and stated

- The entity and stream front ends (D209's blocks stand); requirements for module Effects; event payload Schemas (the admission door).
- Guards that read `state` or `schedules` need a runtime change; `Flow.optional`, required-port types, `Flow.private` outside types, `Definition.guard`.
- `RecordQuarantined` does not name its cause (mid review L5); the seal still accepts hand forms vacuously (mid review L3), with `CompiledOutput` as the honest contract.
