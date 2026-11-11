# Re-check of the v3 test system after round 10, stage E

Commit `c3c4bf1e`, branch `flow-rewrite`. Run from a detached worktree in the scratchpad, 11:26 to 11:43. Scripts: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10e/scripts/run-mut.ts` (the 10d runner, plus the lies below). No subagents. No repo writes besides this file. No commits.

Marks: [ran] reproduced at c3c4bf1e; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: FAIL

One High blocks a pass. It sits in the space the reference model answers `unknown`, and that space is the shape entities have.

- **H1'''.** An ending delivered to the **wrong copy** passes every named oracle (727/727).
  - The lie: when two or more live copies of the op's fragment exist, a failure ending of an attempt goes to the first copy, whatever its subject.
  - The trigger fires in 4 cases (`probe.fan-fail-att`).
  - Only the whole-output compare sees it, in 1 case (FRAG-15, memory hashes). `mutate-one` reports `killedBy: "output"`.
  - Nothing in the suite asks where an ending was delivered. (j) counts that it was delivered. (ref) asks with subject `[]` and skips every placed fragment op.

H1'' is fixed, and so are M1'', M2'' and M3''. Two Mediums stand before entities: M1''' (a park on a keyed copy, and a decline park, are seen by hand cases only) and M2''' (`reference/model.ts` is outside the lock).

| Previous finding | Status | Evidence [ran] |
|---|---|---|
| H1'': a park to a live, bound owner | **Fixed** for root ops | `a3.park-like2nc`: 2 named fails, 2 by (j), "parked, and its live owner binds it (reference)". It was 0/727. `a3.park-save`: 26 named fails, but only 2 by (j). `save` is mostly a keyed fragment op, so the rest fall to A3' (M1''') |
| M1'': "owner moved" too broad | **Fixed**, thin | `d154.moved-like-released`: SURV-03 is now red by (j), "an ending reached nobody". It was a hand assert only. One case, which is the only one where the trigger fires (`probe.moved-like`) |
| M2'': ghost `turn` launders (j) | **Fixed** | `a1.ghost-like2`: 32 named fails, 32 by (j). `a1.ghost-save`: 55/55 by (j). The ghost turn is red in itself |
| M3'': `fence` / `Denied` clear a refusal | **Fixed** | `a4.refused-fence` and `a4.refused-denied`: 44 named fails each, 44 by (j). They were 0. Residue: A4' (a `turn` pays), below |
| L1: a typo under a directive | [read] only | D163 pins each directive's code and words. `falsify --part tamper` was not rerun |

## High

### H1'''. A wrong-row delivery among keyed copies passes every named oracle [ran]

- **Lie `e2.subject-fan-fail-att`** (in `admitEnding`, `turn.ts`):
  - `const path = item.attempt && <failure> && <2+ live copies of the op's fragment> ? bindingOf(tx, a, item.op, <first live copy's subject>) : bindingOf(tx, a, item.op, subject);`
  - The ending is delivered, the turn runs, and `delivered` is said truthfully. It runs in the wrong incarnation.
  - Rule 53 says it belongs to "the live incarnation at its operation's placement whose subject path is the lane's".

| Lie | Fires in | Named (`--no-output`) | By (j) | By (ref) | Whole output |
|---|---|---|---|---|---|
| `e2.subject-fan-fail-att` (failures, attempts, 2+ copies) | 4 cases (`probe.fan-fail-att`) | **0 fail (727/727)** | 0 | 0 | 1 fail, FRAG-15 `output: … actors … memory` |
| `e2.subject-fan-att` (every ending of an attempt, 2+ copies) | 6 cases (`probe.fan-att`) | 1 (FRAG-15's search: "copy d1 says saved c, the fake holds undefined") | 0 | 0 | |
| `e2.subject-fan-fail` (with declines) | | 2 (FRAG-07, REV5-S: hand asserts on the decline) | 0 | 0 | |
| `e2.subject-first` / `-last` (subject ignored everywhere) | | 6 / 7, all hand asserts | 0 | 0 | |

- `mutate-one.ts` on the narrow mutant gives `{"killedBy":"output","killers":["FRAG-15"]}` [ran].
- **What this shows:**
  - FRAG-15 is a bounded search over the notes fixture (`.each` copies) whose only check is the general oracles. It drives a failure into the wrong copy and stays green.
  - It goes red only when a success lands wrong, because the fake's held value then disagrees with the copy's text.
- **Why it is a High:**
  - Entities fan endings out to many targets by binding. Which row hears a write's failure is the thing they rely on.
  - The bug is plausible, not only a lie: a subject built wrong (order of the `resetOn` and `.each` parts, rule 51) or compared loosely gives exactly this.
  - (j) cannot see it by design: it settles counts, not destinations.
  - The reference model says `unknown` for every keyed placement (`placed`, `reference/model.ts:44`). (ref) calls `binding(actor, op, [])` and skips `want === "yes"` for any fragment op (`drive.ts`, the (ref) loop). So no oracle compares a delivery's incarnation with its lane's subject.
- **Fix:**
  1. The suite records each attempt's subject from its own driving. It knows the copy it sent the event to, and so the committing incarnation's path (rule 51: one part per `.each` key and per `resetOn` value, in placement order; `[]` for a definition's op).
  2. `delivered` evidence carries the incarnation path it ran in. A delivery whose path's subject differs from the attempt's is red, under a new or extended oracle.
  3. Extend `Reference.placed` for keyed placements to answer yes/no from the subject and the membership the actor publishes (the `.each` field in `memory()`), not `unknown`. Then the park check (D160) covers keyed copies too (M1''').
  4. Add `e2.subject-fan-fail-att` to `falsify.ts --part lies`, with its probe firing.
  5. Add at least one named case with two copies, a failure on the second, and an assert on the first copy's memory. Today 4 cases reach the shape.

## Medium

### M1'''. A3' in practice: a park on a keyed copy, and a decline park, are seen by hand cases only [ran]

- **The rule:** D160's park check pays a park wherever the reference says `unknown` (keyed `.each`/`resetOn`, nested, resumable) and wherever there is no attempt (a decline). The builder states this as A3'.

| Lie | Named fails | By (j) |
|---|---|---|
| `e1.park-keyed` (every keyed fragment op's ending parked on a live actor) | 57 | **0** |
| `e1.park-keyed-fail` | 27 | 0 |
| `e1.park-keyed-fan` (2+ copies) | 5 | 0 |
| `e1.park-keyed-fan-att` (attempts only) | 4 | 0 |
| `e1.park-frag` (every fragment op) | 79 | 16 (the unkeyed ones) |
| `a3p.park-decline` (a decline parked instead of delivered) | 23 | 0 |

- In FRAG-15 and REV4-L2, the trigger fires (`probe.keyed-fan`: 7 cases) but the park is not red. FRAG-15's general search does not see it.
- **Why Medium, not High:** every variant I built is red by some named case. The narrowest still dies in 4.
- **Why it blocks entities:** the guard that should speak is silent across the whole keyed space. Entity coverage would rest on hand cases.
- **Fix:** the same reference extension as H1''' step 3. For a decline, the suite holds the decline's actor and subject from the step it drove, so it can apply the same check.

### M2'''. `reference/model.ts` is outside the lock; one token disables H1'''s and H1''s fix [ran]

- **Where:** `main.ts:40-61` walks `scenarios/`, `search/`, `fixtures/` and `bench/`, then lists files by name. `reference/` is in neither. `expected.lock` has no `reference` line [read].
- **Tamper** (in the worktree, reverted after):
  - In `Reference.binds`, `if (o.fragment === undefined) return "yes";` became `"unknown"`.
  - The control gives `SUMMARY 727/727 …; unlogged expectation changes: none`.
  - `a3.park-like2nc` (H1'') goes back to **727/727**.
- **Why Medium:** it shows in `git diff`, and it takes a hand edit, not a wrong runtime. But D113 and D116 say what the suite leans on is an expected result, "by walking, so a new file cannot be forgotten", and this file was forgotten. Entity work will edit exactly this file.
- **Fix:** walk `reference/` in `main.ts`. Add a `falsify --part tamper` entry on `reference/model.ts`.

## The reference model, judged

- **Independent in imports** [read]. It has one import, `import type { Alternative, Compiled, Node } from "../fixtures/compiled.ts"`, which is the suite's own type file. Nothing comes from `round-*`.
- **Independent in logic** [read].
  - The runtime's `bindingIn` (`turn.ts:1039-1052`) walks live incarnations and compares subjects.
  - The reference walks the compiled graph statically, from the published leaf up through parent links, and reads placements.
  - Nothing is copied. (j)'s park check uses the reference, not `Instance.binding`. The runtime's `binding` feeds only (ref).
- **Right against `machine-design.md`** where it answers yes or no [read, reasoning]:
  - Rule 51/53: a definition's op is bound at the actor while it lives (`yes`). This is right, including a definition op committed from a copy's filling.
  - Rule 53: an unkeyed direct placement in the active chain binds (`yes`); with none, it parks (`no`). Two placements of one writing fragment are a `SharedContract` error, so `[]` is the only subject. Right.
  - Rule 60: `whenAbandoned.release` on leaving the placing state lets go. Right.
  - Rule 44: no actor means `no`. Right.
- **Limits that are conservative** (they can make a right runtime red, never a wrong one green) [reasoning]:
  - The park check reads the owner's leaf at the end of the batch. A park followed by an entry and adoption in the same batch (rule 54) would be called bound.
  - A rule 52 read ending after a leave and re-entry in one batch would look bound.
  - Neither fired in the suite (control 727/727).
- **The published leaf is the runtime's word.** The check rests on `inst.state`. Hand asserts on state are everywhere, so I rate it Low. It is not a self-excuse for the ending.
- **The `unknown` answers excuse.** The builder says they "excuse nothing". For (ref) that holds. For the park check (D160) and for `moveLetsGo`, `unknown` on a fragment op pays (`drive.ts`, `moveLetsGo`: `a === "unknown" && …fragment !== undefined`). That is A3' and D161's stated cost, and it is exactly where entity fan-out lives (H1''', M1''').
- **(ref) is close to vacuous** [read, ran]:
  - It checks only root ops (always bound) and fragment ops with no placing state (bound nowhere), with subject `[]`.
  - No lie in this re-check, of 30, made (ref) fire.
  - It is optional: an adapter without `binding` skips it silently.

## Allowances, by lie [ran]

All named-only, on a copy of `round-10`, edit at `admitEnding` unless stated.

| Allowance | Lie | Named fails | By (j) | Judgement |
|---|---|---|---|---|
| A2 `delivered` | `a2.deliv-like2nc` / `a2.deliv-frag` | 2 / 88 | 2 / 76 | Tolerable: red by (j) wherever it fires. It does not cover *where* (H1''') |
| A3' park on `unknown` / no attempt | `e1.park-keyed*`, `a3p.park-decline` | 57…4 / 23 | **0** | Medium, entity blocker (M1''') |
| A4' a `turn` pays a refusal | `a4p.refused-turn` (redelivery dropped, a `turn` of the owner said for its event) | 32 | **0** | Low: it takes a false turn of a known actor. PAY-11, REV8-KEPT and REV9-M1 catch it by hand. Fix later: pay a refusal only with a `turn` whose Slot runs the suite saw after it, as D162 does for `Denied` |
| A5 `UnmappedEnding` | `a5.unmapped-like2nc` | 2 | 0 | Tolerable: D130 (an unnamed issue fails) |
| A6 `AbandonedFiber` | `a6.abandoned-like2` | 3 | 0 | Tolerable: `checkMints` ("a minted Attempt vanished") |
| A7 `disabled` + `ModuleDefect` | not built | | | [reasoning] Tolerable, as in 10d: D130 makes the case name it |
| D161 cause by a move, keyed | `e3.keyed-moved-released` / `-plain` | 0 / 0 | 0 | **Vacuous**: `probe.keyed-moved` fires in no case. Unknown pays a fragment op's let-go on any move, and no case puts a keyed failure beside other mail of the owner. Owed a case (L1) |
| D161 keyed `Released`, no move | `e3.keyed-released` | 31 | 17 | Tolerable |

## Low

- **L1** [ran]. D161's keyed "owner moved" cause is unexercised: the trigger fires nowhere. Add a case: a keyed copy's failing save, with another event to the same actor in the batch.
- **L2** [ran]. `mutate-one.ts` from a fresh worktree is killed by `checks/types-check.ts`: "no tsc found".
  - D163 fixed `node_modules` lookup for `falsify.ts`, not for `types-check.ts:9`, which walks up from its own directory.
  - I linked `node_modules` into the scratch parent directory to run it. That is an environment artifact, not a gate failure. Worth the same git-common-dir lookup.

## Builder's unrun gates [ran]

| Gate | Result |
|---|---|
| `falsify.ts --part search` | 42 ok, `FALSIFY every gate fails on what it should` |
| `mutate-one.ts`, control | `{"killedBy":null,"killers":[]}`: the suite, `--swap`, typed compare, date check, CLI pins and the 5 s gate all pass. The first try was killed by "no tsc found" (L2) |
| `mutate-one.ts`, mutant `e2.subject-fan-fail-att` | `{"killedBy":"output","killers":["FRAG-15"]}` |
| `--swap` on that mutant, named only | `727/727` |
| 5 s gate on that mutant | `GATE-5S 29 failed, 29 expected; unexpected: none` |
| Lock on `reference/model.ts` | **Not locked** (M2''') |

So the wrong-row runtime passes the named suite, the swap pass and the 5 s gate. Only the whole-output compare, a change detector, stops it.

## To pass

1. H1''': each attempt's subject from the suite's driving; `delivered` with its incarnation path, checked against it; the narrow lie in `falsify --part lies`; a named two-copy failure case.
2. M1''': the reference answers keyed placements from the subject and published membership, so D160 covers keyed copies and declines.
3. M2''': walk `reference/` in the lock; add a tamper.

With those, the remaining limits are A4' (Low), A5 to A7 (tolerable), and L1 and L2.

## Not reached

- `falsify --part tamper`, `lies` and `mutants` were not rerun. The builder ran them.
- An A7 lie.
- Real Chrome runs, and the variant adapter's counts.
- Cross-actor fan-out: the prototype's entities module syncs records, and endings still go to one owner. Every fan-out lie here is across copies in one actor. When endings fan out across actors, the same destination check is owed per actor.
