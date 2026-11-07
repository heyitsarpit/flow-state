# Merge plan: Stories (merge 3) into machine-design.md

Status: **applied 2026-10-31** (change sets 1 and 2 and mechanics M1–M7; delegated-decisions.md rows 18–22). Written as proposed: under the
owner's overnight delegation ([delegated-decisions.md](../../delegated-decisions.md), "Widened again") and
[decisions-v2.md](decisions-v2.md) T1–T7, the main session approves this change list and resolves the small conflicts;
each is to be logged in delegated-decisions.md, marked "delegated". This plan found **no owner conflict** (1.5).
Written against `machine-design.md` at HEAD `7e7c430f` (last changed by the operations-in-fragments merge and its
check) and `proposal-v2.md` revision 3 (`10ae00f4`), whose model passes ([model/RESULTS.md](model/RESULTS.md)) and
whose last review has no High once T7 is applied ([reviews/v2-review-2.md](reviews/v2-review-2.md)). Method as in
[merged/fragment-operations/merge-plan.md](../fragment-operations/merge-plan.md) (OPP),
[reviews/fragments-merge-check.md](../../../../../../archive/flow-design-2026-11/machine-fragments/reviews/fragments-merge-check.md) and delegated-decisions.md.

Short names: **MD** [machine-design.md](../../machine-design.md); **SP** [proposal-v2.md](proposal-v2.md) (revision 3,
accepted for merging); **T** [decisions-v2.md](decisions-v2.md) (T1–T7); **MDL** the model's RESULTS; **M6**
[merge-6-streams/proposal-v2.md](../../merged/streams/proposal-v2.md) (held for the owner, **not merged**). The earlier
[proposal.md](proposal.md) and its reviews stay as prior art. "Before" quotes are copied from MD; "…" only shortens a
quote, and the edit replaces the whole sentence, row or block it names.

Marks: **small** (wording, numbering, a superseded clause), **small†** (a behaviour consequence the text leaves
unstated; the main session decides it under the delegation and logs it as a decision), **owner** (behaviour or code
shape beyond what T1–T7 decided). Every resolution is **proposed**. Wherever Stories reads streams evidence or
controls, MD gets ***Stream details: merge 6***.

---

# Part 1: compatibility

## 1.1 What was checked

| Source | Rows | Where it lands |
| --- | --- | --- |
| SP 6.1 (every *Story reads: merge 3* spot and the rest) | 17 | SA1–SA17 (1.2) |
| MD swept for every Story sentence, `story.*`, `Story.ending`, `process()`, `run.calls`, `checkpoint.exit`, fixture truth, `model()`, the policy suite | — | SA18–SA26 (1.2, "missing") |
| Testing O1–O4 (the plan and MD's rows on it), Inspection, playback, `model()` | 4 blocks | 1.3 |
| SP's six rules R-Settle … R-Owner | 6 | MD rules 61–66 (2.2) |
| SP 2.2–2.17 and section 3 | 16 + 6 tables | new MD 2.10.1–2.10.17 (SE17) |
| SP 2.1, 2.5's code, 2.13's code, section 4 | examples | change set 2 (2.6) |
| SP 6.2 (plans) | 24 rows | C69–C85 (2.5) |
| SP 8 (Q1–Q15, deferred) | 15 + 5 | decisions (SE32), section 7 item 21, open-items 28–32 (M6) |
| MDL A1–A6 | 6 | AX1–AX6 (1.4) |

## 1.2 The amendment list, row by row

"Clean" = the target text is as SP quoted it. "Changed" = a later merge edited the target; the amendment still
applies. "Missing" = an MD place SP's list does not name, found by the sweep.

| # | SP 6.1 target | Target now | State | Conflict |
| --- | --- | --- | --- | --- |
| SA1 | Header (line 15) and 2.8's intro | "Stories (merge 3) is last; parts of 2.8 that need Story reads are marked…"; 2.8 line 2580 | clean | SX1 |
| SA2 | Rule 11 | now `story.machine(fragment, { id, fixtures })`, traits in `.enter`/`.leave` (fragments merge) | changed; applies | SX3 |
| SA3 | Rule 21, `checkpoint.evidence` | same | clean | — |
| SA4 | Rule 47 | now also "a fragment's, through `Fragment.O.x` (rule 58; *Story reads*)" (fragments merge) | changed; both clauses go | SX4, SX5 |
| SA5 | Rule 58 | `story.machine(fragment…)`, `Story.ending(Autosave.O.save, …)` (OPP FX18's mark) | clean | SX4 |
| SA6 | 2.5, "How a Story reads this frame" | same | clean | — |
| SA7 | 2.7.2, "Server truth in Stories" | same | clean | — |
| SA8 | 2.7.3, mapped-events bullet | "…`Story.ending(O.like, "unknown", { id })`…; on a lane with nothing on the wire it is a Story error" | clean | SX5 |
| SA9 | 2.7.11, example and paragraph | same | clean; code in change set 2 | SX9 |
| SA10 | 2.7.13, "Stories and tests" | same; **also** "the storage refusal, Runtime disposal and the unacknowledged-restore cell belong to a policy suite…, not to an app's Stories" and the R8 L6 sentence | clean; missing ×2 | SX5, SX6 |
| SA11 | 2.7.16, Stories bullet | same | clean | SX5 |
| SA12 | 3.1's `lockout.test.ts` | same | clean; change set 2 | — |
| SA13 | 3.2's `Confirm` Story | same | clean; change set 2 | — |
| SA14 | 3.6 "New, plans" | `Story.ending (*Story reads*)`, `.checkpoint(name, ({ truth }) => …)` | clean | SX5, SX9 |
| SA15 | 3.6 "New, fragments" (SP RV2 L12) | `story.machine(fragment)` with `.enter` / `.leave` / `run.calls` / `checkpoint.exit`; **also** the fragments merge's "`fixtures` / `.enter` / `.leave` on a fragment Story" | changed; applies | SX3 |
| SA16 | Section 5: Testing O1 (fragments row), C16, C27's note, C30's note, C53, C63 | same; **also** Inspection O1 (fragments row), C51, C64 | clean; missing ×3 | SX7–SX9 |
| SA17 | Section 5, T2; section 7 items 17 and 19 | same; items 17 and 19 cite the earlier proposal's G10–G14, 3.14 and question 40 | clean | — |
| SA18 | — | header decisions table ("Six decisions") | missing | — |
| SA19 | — | 2.4's intro sentence (rule ranges) | missing | SX1 |
| SA20 | — | rule 17 "delivers exactly one ending" | missing | SX13 |
| SA21 | — | section 6 "Saved-state compatibility Stories (`story.restore(fixture)`)" | missing | SX11 |
| SA22 | — | 3.6 "Existing" `model` (marked for removal, T1); section 5 T1 | missing | SX12 |
| SA23 | — | F7 (fragment Stories "with `fixtures`, `.enter`, `.leave`") | missing | SX19 |
| SA24 | — | change log; decisions header | missing | — |
| SA25 | — | 2.7.3's code comment "Stories use a fixture" (line 1371) | missing; change set 2 | — |
| SA26 | — | rule 9 ("checked by Stories; repairs and dropped raises are Story-derived warnings"), 2.5's mapper warning, rule 51's decline warning, rule 57's `R`, 2.7.16's Typing line | **convergent**: SP's `listRepair`, `drop`, `turn` and `ending` records carry exactly these | — |

Left as history: the change log's merge 4 entry ("Stories-dependent parts are marked *Story reads: merge 3*") and the
OD23 decision text ("S15 with `Story.ending`"), as review 2 says.

## 1.3 Testing O1–O4, Inspection, playback, `model()`, items 17 and 19

| Area | MD now | SP | Verdict |
| --- | --- | --- | --- |
| Testing O1 | fragments row: `story.machine` accepts a fragment (`.enter`, `.leave`, `run.calls`, `checkpoint.exit`, host-event sends), `process()`; C63 | one constructor `Story.make` (T3), the stand-in host, `world`, addresses, `reload`, `openTab(…, { from })`; no-callbacks rule kept (T4) | compatible; C69 replaces, the fragments row and C63 point to it (SX3) |
| Testing O2 | C16 (with O3); the plan's `process()`, `advanceTo`, `advanceToNextTimer` | rule 61: every step settles on a microtask-only scheduler (T5 B1, T7); `advance({ next })`, `together`, `suspended` | compatible; C70 |
| Testing O3 | 2.7.2 row "no ending is injected (Testing O3)"; C16; C53's `Story.ending` "against Testing O3" | no injection (T2); `Fake.server`; fixtures stay as client halves; "cannot inject outcomes" kept | **convergent with T2**: C53's tension goes (SX5); C71 |
| Testing O4 | C27's note: "Testing.plan still says `pending`; the Testing amendment waits" | B4: a frame per publication, no collapse, no `frames` option (amends the accepted playback contract, T5); `Entity.get` → `{ data, predicted, … }`; `pending` → `Story.inspection.work` | compatible; C72; SX8, SX10 |
| Inspection | fragments row; C30, C51, C64 (lanes by identity, subject path, unplaced or releasing) | `inspect` gains `work`, `incarnations`, lane `binding`; event kinds gain the record kinds; `via` never redacted | compatible; C78–C80. `Story.inspection.lanes` lists "every non-`Idle` write lane", C64 "every lane": **convergent**, since a lane record exists only while non-`Idle` (a parked ending counts, 2.7.13). C30's `overloaded` removal: SX7 |
| Playback | MD has no playback text; playback.md is the accepted contract via Testing O4, O9 | the player steps by step cut; fragment-alone Stories are not playable (playback.md question 2 stays open) | compatible; playback.md's `minDwell` sentence is offered (M10), not edited |
| `model()` | T1 marks Testing O5 and the `model` export for removal; 3.6 lists `model` as existing, "marked for removal" | Package O1 removes `model`; Testing O5 and V5 removed; "After `model()`" is search on the real Runtime (SP 2.17) | **convergent** (SX12) |
| Item 17 | `Entity.get` with `predicted`, `Entity.queue` removals, settlement frames, `Overloaded` by fixtures, held lanes, truth vs store | 2.10.8, 2.10.6 (`queue` records), `checkpoint(…, { at: { settled } })`, hold plus sends, `Story.inspection.lanes`, `expect(fake)` vs `Story.entity` | closed (SE29) |
| Item 19 | `Story.ending` vs Testing O3; snapshot reads; dispose, rebind, restore drives; parked flags | removed (T2); rows on the snapshot; `dispose`, `ensure`, `reload`; `Held` with `uncertain: true` in `Story.inspection` | closed (SE29) |

## 1.4 Model ambiguities (MDL A1–A6): small text fixes in 2.10.17

| # | Ambiguity | Fix (applied in SE17) |
| --- | --- | --- |
| AX1 | A1: `release({ nth: k })` with fewer than k held items | rejects with `StoryInvalidCommand` `NothingHeld`, naming k: never a guessed reorder (correctness first; a generated one is skipped, 2.10.16). The model treats it as `release()`; its next run follows the text (M9) |
| AX2 | A2: `release()` on a stream `Open` connection ends standing rules with no `NothingHeld`; on `None`/`Closed` it is `NothingHeld` if none | one rule in every state, as 3.2's: `release()` with nothing held **and** no standing rule on its target is `NothingHeld`; the `Open` cell reads "ends standing rules; `NothingHeld` if none" |
| AX3 | A3: `enter` on `Frozen` after `reset(subject)` stored another subject | the latest names it: an `enter` that gives `{ subject }` uses it; one that gives none uses the subject `reset` stored |
| AX4 | A4: `duplicate()` on `Fake.storage`; a restore read held or refused | `duplicate` is not offered on `Fake.storage` endpoints (local storage has no network to repeat a request; a type error). While a restore read is held the tab has not finished bootstrap and its persisted actors are absent (`ActorAbsent`); refused, the tab reports `StorageFailure` and runs without persistence (Persistence O5) |
| AX5 | A5: an answer that arrives for a suspended tab | it waits in the tab's transport, like a push (2.10.3), and is delivered at wake after the tab's overdue deadlines, in arrival order; 3.2's "a tab is suspended" row says so for `Server` too |
| AX6 | A6: "ends standing rules whose target is its own" when a handle rule and an endpoint rule overlap | a held item belongs to the rule that held it: `release()` on a target delivers exactly the items its own rules held (a handle's, on any endpoint) and ends only its own standing rules |

## 1.5 Conflicts

| # | Conflict | Kind | Proposed resolution |
| --- | --- | --- | --- |
| SX1 | **Numbering and order.** SP's six rules need numbers; README's work order says Stories goes last ("confirmed last") and streams takes 61 onward (delegated-decisions row 15). Streams is held for the owner | small (ordering is the main session's under the delegation; precedent OPP FX1, row 15). **Flagged** for the owner, since README marks the order confirmed | Stories takes **rules 61–66** now (2.2); merge 6 renumbers from **67** when it merges (rebase, 2.8). README's work order swaps rows 4 and 5 with a note (M4). Row 15's "streams renumbers to 61" is superseded by a new row |
| SX2 | **Label clashes.** SP's decisions T1–T7 vs MD's tooling rows T1–T4; the brief's constraints C1–C19 vs MD's C rows; SP's N1–N4 vs MD's rules N1–N3; SP's section numbers (2.x, 3.x) vs MD's | small | In MD, Stories decisions are cited **"Stories T*n*"**; a bare T*n* keeps meaning a tooling row. The brief's constraints are cited **"brief C*n*"**; SP's new changes **"SP N*n*"**, its reviews "SP RV", "SP RV2", "SP MDL", "SP RC". SP 2.2–2.17 → MD 2.10.1–2.10.16, SP 3.1–3.6 → 2.10.17.1–2.10.17.6, SP 4 → 2.10.18; "MD 2.x" → "2.x"; R-Settle … R-Owner → rules 61–66; TST, INS, PER, MCH, PB → Testing, Inspection, Persistence, Machines, playback.md. STR*n*, STF*n* and SG*n* keep their labels (the brief's; unique) |
| SX3 | **Rule 11's "recording harness" and `.enter(input)`** vs SP's stand-in host: placement from the declaration alone, `guards(answers)` (default allow), `reset`, `leave({ end })`, `enter(input?, { subject })`; callbacks and exits are records | small (T3, decided) | rule 11 rewritten to SP's (SE4); rule 58 and 3.6 follow; the fragments row of Testing O1 and C63 point to C69 |
| SX4 | **OPP FX18, left to this merge:** `Story.ending(Fragment.O.x)` and how a fragment's read is addressed. `Fragment.O` exposes only write reads (rule 50), and SP's address field `operation` takes a handle (`Autosave.O.save`, `O.messages`) | small† | `Story.ending` is gone (T2). The address's `operation` takes a handle where one is visible: a definition's `O.x`, a fragment's write through `Fragment.O.x` (used only as a name, never acting, so rule 50 holds). **A fragment's read or stream** is named by `instance` plus the operation's name, typed against the subject's summary (rule 57), as a schedule is named by its string (2.10.3); in a fragment-alone Story the instance is `[]`. Stated in rule 65 and 2.10.6 |
| SX5 | **`Story.ending` everywhere**: rule 47 ×2, 2.7.3, 2.7.11, 2.7.13 (incl. R8 L6's "addresses the lane by identity"), 2.7.16, 3.6, C53, C63, item 19 | small (superseded by T2) | each sentence says endings come from fakes and lifecycle steps; an unbound lane's ending is its held request's answer; R8 L6's addressing is unneeded, since the wire does not care who is bound (SP 2.6) |
| SX6 | **2.7.13: "All 33 reachable cells…, the storage refusal, Runtime disposal and the unacknowledged-restore cell belong to a policy suite…, not to an app's Stories"** vs SP 2.16: app Stories reach every cell their transitions allow through fakes (`Fake.storage` refusal and `HeldConfirm`, `reload`), and only Runtime disposal is suite-only | small | the suite stays the owner of **coverage** of every cell; an app Story may reach the cells its machine allows, the storage refusal and restore cells included; only Runtime disposal is suite-only (`disposeRuntime`, Stories T2). The executable models stay design checks (brief C1) |
| SX7 | **C30: "`queue` events gain `superseded`, `cancelled` and `overloaded` removals"** vs rule 35 / C22 ("no partial join": an `Overloaded` write never joins) and SP 2.7 (an `Overloaded` commit is an `ending` record, not a `queue` removal; removals are `Superseded`, `Cancelled`, `Released`). C30's `Entity.queue` half waits on "merge 3's choice of read (its revision 3 reads removals from `ending` entries)", which is the earlier proposal; delegated-decisions row 3 (K11) deferred it here | small (C30 contradicts MD's own rule 35) | C30: "`queue` records gain `Superseded`, `Cancelled` and `Released` removals; an `Overloaded` write never joined and is an `ending` record (rule 35)". The deferred half resolves: removals are `queue` records (C84). Both marks go |
| SX8 | **C27's note** ("Testing.plan still says `pending`; the Testing amendment waits") | small, convergent | answered by C72 (`Entity.get` returns `{ data, predicted, uncertain, unconfirmed }`); the note points to it |
| SX9 | **C16's checkpoint predicate** `.checkpoint(name, ({ truth }) => …)` is a callback in a step, against Testing O1's "Scenario commands accept no arbitrary callbacks" | small (superseded by Stories T4) | C16 superseded by C71/C72: truth is read with `expect(fake, partial)` and `cut.read(fake)`; 2.7.11's paragraph and 3.6 follow |
| SX10 | **Testing O4 is an accepted contract** (playback.md); SP B4 changes its frames | stated (decided, Stories T5 B4) | C72 amends it; playback.md's `minDwell` reason is offered as a one-line edit (M10), not made here |
| SX11 | **Section 6 leaves out "Saved-state compatibility Stories (`story.restore(fixture)`)"**; SP makes upgrade Stories with `storage: Fake.storage.from(oldStory)` and `Fake.storage.seed` (STR41) | small | the bullet becomes "**Recorded-history replay** (Temporal's replay test): upgrade Stories exist (`Fake.storage.from`, 2.10.10); replaying recorded production histories stays out (SP 2.17, STR71; open-items 30)" |
| SX12 | **`model()`**: T1 marks it for removal; 3.6 still lists `model` as existing | small, convergent | 3.6's "Existing" drops `model`; the new "Removed (Stories merge)" row lists it with `story`, `process()` and the rest; T1 is annotated "applied by C82" |
| SX13 | **A cancelled Attempt whose acknowledgement was stored** before a crash restores as `unknown { Restored }` (T7; SP 2.5, 3.6), although this Runtime had delivered its `NotSent { Cancelled }`: two endings for one Attempt across a crash, against rule 17's "exactly one ending". It is already MD's behaviour (2.7.13's restore row, G1) but unstated | small† (stated; kept by Stories T7) | rule 17 gains: "Within one Runtime; across a crash, the restore row decides (2.7.13): an Attempt whose acknowledgement was stored restores as `unknown { Restored }` even if its `NotSent { Cancelled }` was delivered before its record was cleared (Stories T7)". SP Q15's option B (fence the cancel's capture) goes to section 7 item 21 **for the owner** |
| SX14 | **The stand-in's subject path.** SP places a trait as one `.each` copy keyed by `subject` with `resetOn` returning it, so rule 51 gives two parts; SP says records carry "a subject path made only of the Story's own `subject` (empty when none is given)" and `Story.inspection` is `inspect(runtime)` | small† | reads re-root at the fragment (STF57): the stand-in's two parts are reported as one, `[subject]`, or `[]` when no subject is given, in every read, `Story.inspection` included. Stated in 2.10.12 |
| SX15 | **The stand-in's path is not empty, so rule 20 would require `NotSent` mapped** (rule 51) on every writing fragment tested alone, even one only ever placed as a root trait | small† | at the stand-in, rule 20's placement check reads the path as `[]` until the Story changes the subject (`enter({ subject })` with another value, or `reset`), since only then can a decline from another path occur; `flow check` reads the Story (Stories are data, 2.10.14) and reports rule 20 at that step. The stand-in stays invisible and the check stays honest |
| SX16 | **Streams are not merged.** SP reads M6: `Feed.reconnect` and its `timer` sleeps, `Feed.callback`, `session` records and cells, rows `connection`, `drop`, `value`, `last`, `missed`, M6 3.1–3.5, M6's flags, `ReleaseOverdue` | small | ported with ***Stream details: merge 6*** at rule 65 (`timer`), 2.10.3, 2.10.6 (`session`, `diagnostic`), 2.10.9 (whole section), 2.10.14 (coverage), 2.10.15 (stream cells, the suite's adapter), C70, C79; SP 4.3 and 4.6 are not ported (2.6). SP 6.2's M6 row is merge 6's rebase (2.8) |
| SX17 | **SP 8's undecided rounds**: Q5–Q7, Q9, Q10, Q12–Q14 (Q1–Q4 are T6, Q8 and Q15 T7, Q11 T2) | small (process, as F10's "accepted with the proposal") | recorded as "Accepted with the proposal (delegated)", option A each, in the new decisions subsection |
| SX18 | **F7** (owner) names fragment Stories "with `fixtures`, `.enter`, `.leave`"; Stories T3 renames `story.machine` to `Story.make` and adds `guards`, `reset`, `leave({ end })` | small (amended by a delegated, big decision; the overnight widening covers it) | F7 annotated "*Amended by Stories T3 (delegated, big): `Story.make(fragment)`*". Listed for the owner's morning review |
| SX19 | **Rule 1's "Pending resets are not persisted"** and STF62's walk ("a reload that loses a pending reset", via `Fake.storage.seed`) | — | convergent: SP reaches rule 51's restore reset through seeded storage; no edit |
| SX20 | **Folder move includes `model/`**, which is not to be touched tonight | mechanics | M1 is a `git mv` with no content change, done with change set 2 when the main session says go |

## 1.6 Owner conflicts

**None.** Every behaviour and code-shape change in SP is decided by T1–T7 (T3, T5 and T6 are "delegated, big"), or is
a consequence of rules MD already has. The closest to the owner:

- **SX13**: two endings across a crash, kept by T7; its alternative (fencing) is section 7 item 21, for the owner.
- **SX1**: Stories merges before streams although README marks Stories "confirmed last".
- **SX18**: F7 is the owner's decision; T3 amends its spelling.

All three should be logged as "delegated" so the owner sees them.

---

# Part 2: the change list

## 2.1 Order and scope

1. **Change set 1, normative text** (SE1–SE32): header, rules, 2.4–2.8 prose, the new 2.10.1–2.10.17 (prose and
   the normative tables), 3.6, sections 5–7, change log, decisions.
2. **Change set 2, examples** (EX1–EX8): the new 2.10.18, the code blocks of 2.10.4 and 2.10.12, and MD's 2.7.11,
   3.1 and 3.2 Stories, after change set 1 is checked.
3. Each change set ends with a check in [reviews/fragments-merge-check.md](../../../../../../archive/flow-design-2026-11/machine-fragments/reviews/fragments-merge-check.md)'s form;
   then the mechanics (2.7).
4. Out of scope: `.plan` files (C rows only), playback.md (M10 offers a line), merge-6-streams/ (rebase, 2.8), the
   model folders, delegated-decisions.md (M7 lists its rows for the main session).

## 2.2 Rule numbering

Rules 1–60 keep their numbers. SP's six rules become, after rule 60:

| SP | MD rule | Title in MD |
| --- | --- | --- |
| R-Settle | 61 | Every step settles (Stories T5 B1, T7) |
| R-World | 62 | The world is fakes (Stories T2, T5 B2) |
| R-Data | 63 | Plans are data (Stories T4) |
| R-Cut | 64 | Every step has its own cut (Stories T5 B4) |
| R-Address | 65 | One address (Stories T6, SP N2) |
| R-Owner | 66 | The owner decides |

Each rule's text is SP section 1's, with SX2's substitutions, plus SX4 in rule 65 and SX16's mark in rule 65. In
ported prose, "R-Settle" … "R-Owner" read "rule 61" … "rule 66".

## 2.3 Change set 1 (32 edits)

| # | Target | Before | After | Source |
| --- | --- | --- | --- | --- |
| SE1 | Status paragraph | "Stories (merge 3) is last; parts of 2.8 that need Story reads are marked *Story reads: merge 3* (section 7 item 17)." | "Stories (merge 3, [merged/stories/proposal-v2.md](…), revision 3) was merged on 2026-10-31: a Story is a plan of the user's, time's and the world's inputs, run on the production Runtime against fake servers, with no ending injected (2.10, rules 61–66). Streams (merge 6) is not merged yet; where Stories reads streams, the text is marked *Stream details: merge 6*." | SA1 |
| SE2 | "Six decisions" and its table | "**Six decisions.** … decision 6 builds on decisions 1 and 5." | "**Seven decisions.** … decision 7 builds on decisions 5 and 6."; row "\| **7. Stories** \| 2.10, rules 61–66, rules 11, 17, 21, 47, 58 amended, 2.5, 2.7.2, 2.7.3, 2.7.11, 2.7.13, 2.7.16, 2.8, 3.6, sections 5–7, C69–C85, decisions Stories T1–T7 \| Testing O1–O4, O6–O9, V1–V9, Inspection O1/O4/O5, CommandLine O2/O5/O6, Package O1, Diagnostics, EntityDomains O2/O4, Persistence O7 \|" | SA18 |
| SE3 | 2.4 intro | "…and 48–60, after rule 47, let fragments declare operations (2.9)." | "…48–60, after rule 47, let fragments declare operations (2.9), and 61–66, after rule 60, are Stories (2.10)." | SA19 |
| SE4 | Rule 11 | "**Tested alone.** `story.machine(fragment, { id, fixtures })` fills every port with a recording harness … (rule 58)." | "**Tested alone** (Stories T3). `Story.make(fragment, { id, fixtures?, world? })` runs the fragment in an invisible **stand-in host** whose placement its declaration alone decides (2.10.12). `enter(input?, { subject? })` starts it; `leave()` ends it, or freezes a resumable trait; `leave({ end: true })` ends a frozen one; `reset(subject)` (traits) changes its reset value; `guards(answers)` sets the stand-in's guard answers (default: allow); public `events` and `hostEvents` may be sent. Notifications, `whenAbandoned` included, are `callback` records and exits are `exit` records, the same as in a host (rule 58)." | SX3 |
| SE5 | Rule 17 | "…or parked for it (rules 44, 53)." | append SX13's sentence | SX13 |
| SE6 | Rule 21 | "visible (*Story reads: merge 3*: the `checkpoint.evidence` shape)." | "visible in Inspection and in `Story.inspection`'s lane listing, the same listing (2.10.7)." | SA3 |
| SE7 | Rule 47 | "Stories drive endings through the operation, `Story.ending(O.x, …)` (*Story reads: merge 3*); a fragment's, through `Fragment.O.x` (rule 58; *Story reads: merge 3*)." | "Stories produce endings only through fakes and lifecycle steps; no ending is injected (Testing O3; Stories T2, rule 62)." | SX5 |
| SE8 | Rule 58 | "`story.machine(fragment, { id, fixtures })`; `.leave()` and `.enter(input)` on traits; `Story.ending(Autosave.O.save, …)` (*Story reads: merge 3*). Walks kept as Stories:" | "`Story.make(fragment, { id, fixtures })` (rule 11; Stories T3); `enter`, `leave`, `reset` on traits; a fragment's endings come from its fake's answers, its request named by address (`match: { operation: Autosave.O.save, actor, copy }`, rule 65). Walks kept as Stories, each written as steps (2.10.15):" | SX4 |
| SE9 | After rule 60 | — | new block: "**Stories** (2.10). Rules 61–66 are Stories' ([merged/stories/proposal-v2.md](…)); each names its decisions (Stories T1–T7)." then rules 61–66 per 2.2 | SP 1 |
| SE10 | 2.5, settlement | "How a Story reads this frame and asserts the gap is merge 3's (*Story reads: merge 3*)." | "The settlement is its own publication, hence its own frame; a Story names it with `checkpoint(name, { at: { settled: O.x } })` (2.10.6)." | SA6 |
| SE11 | 2.7.2 row | "\| Server truth in Stories \| the fixture (a stateful fake server behind the service) \| the Story reads the fixture; no ending is injected (Testing O3); `Story.ending` (rule 47) against this is merge 3's (*Story reads: merge 3*) \|" | "\| Server truth in Stories \| a fake server, one per run (rule 62) \| the fake's truth and request log, read at every step cut; no ending is injected (Testing O3, rule 62) \|" | SA7 |
| SE12 | 2.7.3 bullet | "Stories drive endings through the operation (`Story.ending(O.like, "unknown", { id })`, *Story reads: merge 3*); on a lane with nothing on the wire it is a Story error." | "Stories produce endings through fakes (rule 62); a lane with nothing on the wire has nothing to `release` (`NothingHeld`, 2.10.2)." | SX5 |
| SE13 | 2.7.11 paragraph | "A fixture may expose its truth; a checkpoint reads it. Every ending … (Merge 3 designs the Story API for all of this, `Story.ending` included, rule 47.)" | "A fake server holds the truth, and a Story reads it with `expect(fake, partial)` (2.10.4, 2.10.6). Every ending is produced through fakes and lifecycle steps (2.10.5): `unknown` by a dropped answer, `NotSent` by a cancel while the Attempt's acknowledgement is held, by `reject`, or by a refused acknowledgement (`StorageRefused`). `NotSent { why: "Overloaded" }` and record-queue order are reached by holding the head's request and sending enough commits (2.10.8)." The code block waits for EX5 | SA9, SX9 |
| SE14 | 2.7.13, "Stories and tests" | "…endings with `Story.ending(O.x, ...)` (*Story reads: merge 3*); … restore with the Story's reload. `Story.ending` on an unbound lane addresses … (R9 L6). All 33 reachable cells per holding policy, the storage refusal, Runtime disposal and the unacknowledged-restore cell belong to **a policy suite in Flow's own tests**, … (R6 L2)." | "…endings by the fakes' answers (an unbound lane's ending is its held request's; the wire does not care who is bound, 2.10.5); … restore with `reload` (2.10.10). **A policy suite in Flow's own tests** covers all 33 reachable cells per holding policy, the storage refusal, Runtime disposal and the unacknowledged-restore cell, driving the real Runtime under the TestClock (R6 L2); an app Story may reach any cell its machine allows, the storage and restore cells through `Fake.storage` and `reload`, and only Runtime disposal is the suite's alone (`disposeRuntime`, Stories T2; 2.10.15)." Rest unchanged | SX5, SX6 |
| SE15 | 2.7.16 Stories bullet | "Stories drive endings with `Story.ending` (*Story reads: merge 3*); a Story reaches the cells…" | "Stories: `ending` records name `operation`, `contract`, the verb and `key` (2.10.6); … Endings come from fakes (rule 62); `lane` records name their cell, so `flow stories --coverage` counts cells (2.10.14); a Story reaches…" | SA11 |
| SE16 | 2.8 intro | "Parts that need Story reads are marked *Story reads: merge 3* (section 7 item 17)." | "Stories read the store with `Story.entity` and its queues in `Story.inspection` (2.10.8)." | SA1 |
| SE17 | New 2.10 | — | "### 2.10 Stories": intro (where the inputs come from; the tier table of SP 1; what is removed); 2.10.1–2.10.16 from SP 2.2–2.17 (2.18 prior art stays in the record); 2.10.17 from SP 3 (normative), with AX1–AX6, SX4, SX14, SX15 applied; code blocks wait for change set 2 | SP 1–3 |
| SE18 | 3.6 "New, fragments" | "…state tokens in guard arrays, `story.machine(fragment)` with `.enter` / `.leave` / `run.calls` / `checkpoint.exit`;" and "…`fixtures` / `.enter` / `.leave` on a fragment Story," | "…state tokens in guard arrays;" and "…`Story.make(fragment)` with `enter`, `leave`, `guards`, `reset` (Stories merge),"; callbacks and exits are records | SA15 |
| SE19 | 3.6 "New, plans" | "`runtime.unsettledWrites()`; `Story.ending` (*Story reads: merge 3*);"; "`.checkpoint(name, ({ truth }) => …)`;"; "(the `model()` options … removed with T1)" | drop `Story.ending` and the checkpoint predicate; the parenthesis reads "(`model()` is removed: T1, C82)" | SX5, SX9 |
| SE20 | 3.6 new rows; "Existing" | "`check`, `model` (marked for removal, T1), `S`" | "`check`, `S`"; new row "**New, Stories**" (SP 7's words, tiers and marks); new row "**Removed** (Stories merge)": `story.app`, `story.machine`, `process()`, `advanceTo`, `advanceToNextTimer`, the `frames` option and frame collapse, `run.calls`, `checkpoint.exit`, the checkpoint predicate (C16), `Story.ending` (never adopted), `model` (T1), Testing O4's `pending` for work | SP 1, 7; SX12 |
| SE21 | Section 5 fragments rows | Testing O1 "…amended by C63 (operations in fragments)"; Inspection O1 "…amended by C64 (operations in fragments)" | append "; replaced by C69 (Stories)"; "; amended by C78 (Stories)" | SX3 |
| SE22 | C16 | "A Story checkpoint may read fixture truth (`.checkpoint(name, ({ truth }) => …)`); every ending can be produced through services" | "*Superseded by C70–C72 (Stories): truth is read with `expect(fake, partial)`; no checkpoint predicate (Stories T4); every ending is produced through fakes (Stories T2).*" | SX9 |
| SE23 | C27 | "Testing.plan still says `pending`; the Testing amendment waits (*Story reads: merge 3*)" | "Testing O4's `pending` becomes `predicted` in C72" | SX8 |
| SE24 | C30 | "`queue` events gain `superseded`, `cancelled` and `overloaded` removals; … (C51; *Story reads: merge 3*). *Story reads: merge 3:* EntityDomains O2's `Entity.queue` states … from `ending` entries)" | "`queue` events gain `Superseded`, `Cancelled` and `Released` removals; an `Overloaded` write never joined, so it is an `ending` record (rule 35); … (C51). EntityDomains O2's `Entity.queue` removals are `queue` records with their reason (C84)" | SX7 |
| SE25 | C51, C53, C63, C64 | C53 "`Story.ending(O.x, …)` drives an ending through the operation (*Story reads: merge 3*: against Testing O3's \"no ending is injected\");"; C63 "`story.machine(fragment, { id, fixtures })`; `.enter`/`.leave` on traits; `Story.ending(Fragment.O.x, …)` (*Story reads: merge 3*);" | C53: "Stories produce endings through fakes, never by injection (Testing O3 kept; Stories T2);"; C63: "`Story.make(fragment, { id, fixtures })`; `enter`/`leave`/`reset` on traits; a fragment's request named by address (rule 65);"; C51, C53, C63, C64 end "amended by C*n* (Stories)" | SX5 |
| SE26 | T1, T2 | T1 "**Marked for removal: …**"; T2 "`flow stories --coverage` lists transitions, exits, callbacks and ending handlers (current and late) no Story reaches" | T1 append "*Applied by C77 and C82 (Stories).*"; T2 append "; also write-lane cells, stream cells (*Stream details: merge 6*) and Flow reasons, from the records' `cell` and `route` (C81)" | SA17, SX12 |
| SE27 | Section 5, new subsection | — | "### For Stories" with C69–C85 (2.5) | SP 6.2 |
| SE28 | Section 6 | "**Saved-state compatibility Stories** (`story.restore(fixture)`), the analogue of Temporal's replay test. They matter more now that `orphaned` makes version changes first-class (durable R8)." | SX11's bullet | SX11 |
| SE29 | Section 7 | items 17, 19 | "~~**Story reads for entity domains**~~ **Closed (Stories merge):** 2.10.6–2.10.8 …"; "~~**Story reads for operations**~~ **Closed (Stories merge):** …"; new **item 21** (SX13, for the owner) | SA17, SX13 |
| SE30 | Change log | — | "- Stories (merge 3) merged on 2026-10-31 ([merged/stories/proposal-v2.md](…), revision 3; decisions Stories T1–T7; plan [merged/stories/merge-plan.md](…)): rules 61–66; 2.10 added (its examples in a second change set); rules 11, 17, 21, 47, 58, 2.4, 2.5, 2.7.2, 2.7.3, 2.7.11, 2.7.13, 2.7.16, 2.8, 3.6, sections 5–7 amended; C16, C27, C30, C51, C53, C63, C64, T1, T2 amended; C69–C85 added; every *Story reads: merge 3* mark resolved. Streams (merge 6) is not merged: its rules renumber from 67." | — |
| SE31 | Decisions header; F7 | "…and operations-in-fragments' F1–F10, which…"; F7 | "…, operations-in-fragments' F1–F10 and Stories' T1–T7 (cited \"Stories T*n*\"; a bare T*n* is a tooling row of section 5), which…"; F7 gains SX18's annotation | SX2, SX18 |
| SE32 | Decisions, new subsection | — | "### Stories (merge 3, [merged/stories/decisions-v2.md](…))": T1–T7 verbatim; "**Accepted with the proposal (delegated)**: SP 8 Q5–Q7, Q9, Q10, Q12–Q14, option A each"; "**Decided by the main session at merge (delegated)**: SX4, SX13, SX14, SX15 and AX1–AX6"; "**Also rejected**" (SP 1, 2.6, 2.10: injection B and C, `hold({ at: "close" })`, the host-time grace, `advance("next")` without an address, `lost` on endpoints, a trailing `{ tab }` option, storage that travels like a remote request, a handler's defect reaching the client, an app-shipped awaiting adapter) | T1–T7 |

Count: 32 edits; SE9 carries six rules and SE17 one section with seventeen subsections.

## 2.4 What becomes superseded

| MD text | By | What happens |
| --- | --- | --- |
| `story.machine`, `run.calls`, `checkpoint.exit`, `process()` (rule 11, 58, 3.6, Testing O1 row, C63) | Stories T3, T5 B1 | replaced (SE4, SE8, SE18, SE20, SE21, SE25) |
| `Story.ending` (rule 47, 2.7.3, 2.7.11, 2.7.13, 2.7.16, 3.6, C53, C63, item 19) | Stories T2 | removed (SX5) |
| C16's checkpoint predicate | Stories T4 | superseded (SE22) |
| C30's `overloaded` removal | rule 35 | corrected (SE24) |
| 2.7.13 "not to an app's Stories" | Stories T2, SP 2.16 | the suite keeps coverage; app Stories may reach cells (SE14) |
| Section 6 "Saved-state compatibility Stories" | `Fake.storage.from` | narrowed to recorded-history replay (SE28) |
| `model` in 3.6 "Existing" | T1 | removed (SE20) |
| F7's spelling | Stories T3 | annotated (SE31) |
| delegated-decisions row 15's "streams renumbers to 61" | SX1 | a new row (M7) |

Unchanged and safe: every rule except 11, 17, 21, 47, 58; the write-lane tables; 2.9; every MD example until change
set 2.

## 2.5 New C rows (C69–C85)

| # | Plan | Rule | Replaces or adds |
| --- | --- | --- | --- |
| C69 | Testing (title), O1 | Title "…checkpoints, models and property tests" → "…checkpoints and property tests". `Story.make(subject, options)` over an app setup, a machine, a trait or a subroutine (Stories T3); 2.10.2's steps; ids unique across the configuration; the stand-in host (placement from the declaration); the `world` option; addressed targets; `reload`, `openTab(…, { from })`; properties are options, printed by name; "Scenario commands accept no arbitrary callbacks…" **kept** (rules 61–66) | Replaces O1's `story.app`/`story.machine` sentences and "Both Story kinds support send, process, advance, advanceTo, advanceToNextTimer…"; "unique within its App" → "unique across the configuration"; replaces the fragments' Testing O1 row and C63's syntax |
| C70 | Testing O2 | Every step settles on a microtask-only run scheduler (Effect 4.0.5 `executionMode: "sync"`): no host task runs during a settle, which ends once Flow's queue and the microtask queue are empty; a fiber waiting on the host is `HostTimeWait`; the turn limit is per instant; 2.10.17.5's order (setup-scoped fibers, invocation order); `advance({ next: address })`, `together({ advance })`, `suspended` (rule 61; Stories T5 B1, T7; *Stream details: merge 6* for `Feed.reconnect`'s timers) | Replaces "process() drains currently eligible work…" and "These commands make work eligible without draining it…" |
| C71 | Testing O3 | Fixtures are client halves; `Fake.server` (run-scoped truth, endpoints, controls, the wire words `hold`, `release`, `drop`, `duplicate`); provenance (`via`); `Fake/Lost` mapped by the binding; a crashed server is the binding's failure plus an `issue`; `Fake.storage` with `purpose`, FIFO per tab, aborted on close, the scope lock; "fixtures cannot inject operation outcomes directly" **kept** (rules 62, 66; Stories T2, T5 B2) | Adds to O3; supersedes C16 |
| C72 | Testing O4 | A frame after every committed publication; a step per command, each with its step cut; frames never collapse; `checkpoint.actor(ref)` → `frame.read(ref)`; `pending` → `Story.inspection.work`; `Entity.get` returns `{ data, predicted, uncertain, unconfirmed }`; records in one list with `tab: { name, open }`; `expect` and properties; step cuts and checkpoints are never truncated (rule 64; Stories T5 B3, B4) | Replaces "a frame after every command by default … Consecutive identical frames collapse into one"; answers C27's note |
| C73 | Testing O6 | `propertyTest(story, { steps, properties, seed, runs?, length?, quietWithin? })`; invalid generated steps are skipped and left out of emitted Stories; shrinking keeps pairs; faults are steps; the domain form is a preset (Stories T5 B5; 2.10.16) | Replaces O6's generator shape |
| C74 | Testing O7 | Tabs share the run's fake servers and `Fake.storage`; remote requests in transit survive `closeTab`, local writes abort; a hydration source runs in the destination's world, may not set `world`, its requests carry `via.tab: { name: "server", open }`; `dehydrate` moves time as `advance` does (2.10.10, 2.10.11) | Adds |
| C75 | Testing O8 | Errors `StoryExpectationFailed`, `StoryInvalidCommand` (`ActorAbsent`, `AlreadyEntered`, `NotEntered`, `TabOpen`, `TabClosed`, `NothingHeld`, `NoDeadline`), `HostTimeWait`, `FramesTruncated`, `AmbiguousAttempt` (2.10.2, 2.10.6) | Adds |
| C76 | Testing O9 | The next-action highlight compares the addressed event; a closed tab renders nothing and reports the gap; fragment-alone Stories are not playable (a type error) (2.10.13) | Adds |
| C77 | Testing V1–V9, O5 | O5 and V5 removed (T1); V3 proves rule 61 and the instant order; V4 proves publication frames and steps | Applies T1 |
| C78 | Inspection O1 | `inspect(runtime)` adds `work` (with `waitsFor`) and `incarnations` (`status: active \| frozen`); lanes by identity with `binding` (`bound`, `unbound`, `unplaced`), `releasing`, parked endings; held wire items are not Runtime facts (2.10.6, 2.10.7) | Amends C51, C64 and the fragments' Inspection O1 row |
| C79 | Inspection O4 | Event kinds gain `ending`, `lane` (with `cell`), `life`, `callback`, `exit`, `listRepair`, `drop`, `session` (with `cell`; *Stream details: merge 6*), and for Story runs `step`, `request`, `control`, `verdict`; `turn` carries the keys its mappers read that it writes; every event gains the run-wide sequence and `tab: { name, open }` (2.10.6) | Adds |
| C80 | Inspection O5 | Fake truth and request inputs leave the process as digests; `via` is identity, never redacted | Adds |
| C81 | CommandLine O2, O5, O6 | `describe` prints subject, options, steps, checkpoints, expectations, properties and every fake reached; coverage by cells, handlers (current and late) and Flow reasons; Story-derived warnings from `verdict`, `listRepair`, `drop`, `ending` (rule 51's declines) and `turn` records; top-level Stories in `defineConfig` (`appId: null`); rule 20 at a stand-in after a subject change (SX15) (2.10.14) | Amends T2 |
| C82 | Package O1 | `flow-state/testing` exports `Story`, `Fake`, `propertyTest`, `StoryFrame`, `StoryPlayer`, `definePresentation`; `story` and `model` removed (T1); `flow-state/internal/testing` (not public) exports `disposeRuntime` for Flow's suite | Amends Package O1 |
| C83 | Diagnostics | The error names of C75 | Adds |
| C84 | EntityDomains O2, O4 | `Entity.queue` removals are `queue` records with their reason (`Superseded`, `Cancelled`, `Released`; an `Overloaded` write is an `ending` record); `propertyTest`'s domain preset `Domain.propertySteps(domains, inputs)` keeps O4's oracle, quietness and Inconclusive rules | Resolves C30's deferred half and delegated-decisions row 3 (K11) |
| C85 | Persistence O7 | The capture that removes a cancelled Attempt's acknowledgement queues behind that acknowledgement (one writer per scope); an acknowledgement stored before a crash restores as `unknown { Restored }` even if this Runtime had cancelled the Attempt (2.7.13's restore row; Stories T7; section 7 item 21) | Adds |

## 2.6 Change set 2: examples (8 edits)

| # | Target | Change | Checked against |
| --- | --- | --- | --- |
| EX1 | New 2.10.18.1 | SP 2.1 (before and after: the common case) | rules 61, 64; `expect`, `Story.attempt` |
| EX2 | 2.10.4 | SP 2.5's `Stripe` fake and `StripeFake` client half, in place | rules 62, 66 |
| EX3 | 2.10.12 | SP 2.13's `Lockout` alone, in place | rule 11, SX14, SX15 (no subject change: path `[]`) |
| EX4 | New 2.10.18.2–2.10.18.6 | SP 4.1 (checkout), 4.2 (autosave), 4.4 (board), 4.5 (wizard), 4.7 (a fragment on two hosts). **Not ported:** 4.3 (chat) and 4.6 (LLM), which run on merge 6's `Feed` and sessions; they port with merge 6 (2.8) | 4.2's `reopenedKeepsText` against rules 53, 54 (`binding: "unplaced"`, parked `Conflict`); 4.7's `likeAlone` against SX14 (`subject: []`) and SX15 (no subject change, so `LikeButton` needs no `NotSent` at the stand-in); 4.4's `overloaded` against rule 35 and SX7 (an `ending` record) |
| EX5 | 2.7.11's code block | SP 4.1's `busyThenPaid` | SE13 |
| EX6 | 3.1's `lockout.test.ts` | `Story.make(L, { id }).enter().send(L.E.Strike(), L.E.Strike()).checkpoint("locked").expect({ … }).advance("1 minute").checkpoint("cleared")`; calls read as `callback` records | rule 11 |
| EX7 | 3.2's `confirm.test.ts` | SP 4.5's `confirmYes` | rule 11 |
| EX8 | 2.7.3's comment "Stories use a fixture" | "Stories use a fake's client half (2.10.4)" | — |

Comments in ported code drop SP's keyword marks and review citations (as OPP did), keep `// user-defined` where it
helps, and cite MD rule numbers.

## 2.7 Mechanics

1. **M1.** `git mv merge-3-stories merged/stories` (proposal-v2.md, proposal.md, decisions-v2.md, brief.md,
   merge-plan.md, reviews/, model/), with change set 2. `model/` moves unchanged (SX20). Links inside change by one
   level: `../machine-design.md` → `../../machine-design.md`, `../merge-6-streams/…` → `../../merge-6-streams/…`,
   `../../playback.md` → `../../../playback.md`, `../audit-multiplicity.md` → `../../audit-multiplicity.md`,
   `../merged/x` → `../x`; in `reviews/`, one level more (`../../../../Testing.plan` → `../../../../../Testing.plan`);
   this plan's `../` links become `../../`. MD's new links (SE1, SE9, SE30, SE32) already point to `merged/stories/`
   and resolve after the move.
2. **M2.** Status headers: proposal-v2.md "**merged into machine-design.md on 2026-10-31; kept as the record behind
   it.** It became 2.10, rules 61–66, C69–C85 and decisions Stories T1–T7. Where this record and the design differ,
   the design wins (its 4.3 and 4.6 wait for merge 6)." One line in decisions-v2.md; proposal.md "prior art,
   superseded by proposal-v2.md".
3. **M3. Links to fix:** README.md (work order, the merges table, merge 6's row); MD's new links. Text-only mentions
   left as they are: delegated-decisions.md, open-items.md item 20 ("after merge 3"). History left: OPP,
   `reviews/*-check.md`, merge-plan-4-5.md.
4. **M4. README.** Work order: row 4 becomes "Stories: merged 2026-10-31 ([merged/stories/merge-plan.md](…))",
   position "done (delegated; merged before streams, SX1)"; streams becomes row 5, "held for the owner; its new rules
   renumber from 67". "…operations-in-fragments (2026-10-31) and Stories (2026-10-31) are merged into it". The
   "what is left" table drops merge 3's row; merge 6's "Depends on" adds "Stories (rules 61–66 taken; its 2.11 Story
   mapping becomes Stories 2.10.9)". "Merged proposals" gains "\| [merged/stories/proposal-v2.md](…) \| Stories, 2026-10-31 \|
   Stories as plans of user, time and world inputs on the production Runtime; fakes; no ending injected (design 2.10,
   rules 61–66, C69–C85, Stories T1–T7) \|".
5. **M5. Marks.** Every *Story reads: merge 3* mark is resolved by SE1, SE6, SE7, SE8, SE10–SE16, SE19, SE23–SE25,
   SE29. A grep after change set 1 finds the mark only in the change log's merge 4 entry (history).
6. **M6. open-items.md** gains 28–32, "deferred by Stories, 2026-10-31": a `Fake.fetch` route-table helper; a typed
   `match` on `via.subject`; the record-and-replay recorder (STR71); an exhaustive small-scope search over the policy
   suite's machines; `together` with an `{ advance }` that also runs turns. Item 20 (the from-scratch experiment,
   "after merge 3") becomes due; the main session decides when.
7. **M7. delegated-decisions.md** (main session) gains: one row for the small conflicts (SX1–SX3, SX5–SX12, SX16,
   SX17, SX19); one row each for SX4, SX13, SX14, SX15 and AX1–AX6, marked "delegated"; one for SX1's order, which
   supersedes row 15's "61 onward" with "67 onward"; one for SX18 (F7 amended by T3).
8. **M8.** NEXT.md by the main session. `workflow check` only if a Workflow record is touched (none planned). No commit
   by this plan; two commits (change sets 1 and 2), each followed by a check.
9. **M9. The model** (not edited): AX1 decides an error where the model plays `release()`; the model's next run
   follows the text.
10. **M10. playback.md** (offered, not planned): `minDwell`'s "frames from one `process()` share the same `now`" →
    "frames from one step share the same `now`".

## 2.8 Rebases owed by merge 6 (not edits to MD)

- **Numbering:** rules 61–66 are taken; merge 6's new rules start at 67, and every citation in its 6.1 and 6.2
  shifts. MD's "M6 rule 50" and "M6 rule 51" (OPP check nit 12) stay merge 6's.
- **SP 6.2's M6 row:** 2.11's control table and `.do` Story become MD 2.10.9's mapping; `checkpoint.evidence("feed")`
  becomes `session` records; `truth.fake.resumedFrom` becomes the socket endpoint's request log; the per-session
  evidence contract gains `cell`; `ReleaseOverdue` is reached in the policy suite; `Feed.reconnect`'s sleeps carry
  `timer` (`backoff`, `page`, `resetAfter`); M6's flags are `diagnostic` records.
- **Marks:** every *Stream details: merge 6* mark this merge adds (SX16) is merge 6's to resolve, with SP 4.3 and 4.6.

## 2.9 Single graph, runtime, static analysis, Stories, CLI

- **One runtime:** kept and strengthened. A Story runs the production Runtime; there is no second execution path
  (T1, rule 62); the executable models stay design checks.
- **Static analysis:** kept. Plans, controls and expectations are data (rule 63), so `flow check`, `flow graph` and
  `describe` read a Story without running it; SX15 adds one Story-derived check.
- **Stories:** the API changes shape (T3, T5, T6, delegated, big); the walks MD lists in 2.7.13 and rule 58 stay as
  Stories, written as steps.
- **CLI inspection:** extended: `work`, `incarnations`, lane `binding`; fourteen record kinds, each an Inspection O4
  member; nothing lost.

## 3. What blocks merging

- **Nothing in change set 1.** No owner conflict. SX4, SX13, SX14, SX15 and AX1–AX6 are the main session's decisions
  with the resolutions above; SX16's marks wait for merge 6.
- **Change set 2 and M1** wait for the main session's go (M1 moves `model/`).
