# Check: merges 4 and 5 into machine-design.md

Reviewed 2026-10-30. Scope: commits e4e9527b (merge 4: A1–A49, K1–K13, K18–K21) and a88b24b6 (merge 5: B1–B11, K14–K17)
against [merge-plan-4-5.md](../merge-plan-4-5.md), [delegated-decisions.md](../../../../flow/references/explorations/machine-fragments/delegated-decisions.md),
[merged/entities.md](../../../../flow/references/explorations/machine-fragments/merged/entities.md) and [merged/entity-analysis/proposal.md](../../../../flow/references/explorations/machine-fragments/merged/entity-analysis/proposal.md).
Line numbers are of `machine-design.md` at HEAD (a88b24b6). Nothing was edited except this file.

## Verdict

**Merged correctly, with 2 defects to fix (both small, neither changes a rule).** All 49 A edits, all 11 B edits and all
listed resolutions are present with the intended text. No design rule, decision, C row or example was dropped or
weakened except where an edit says so. Rule numbering 1–38 with N1–N3, D1–D21, E1–E18, M5-D1–D10 and C1–C30 (plus P
rows) has no duplicate and no gap. No stale `merge-4-entities/` or `merge-5-entity-analysis/` path remains outside the
merge plan (which cites them as the old names, on purpose) and `operations-in-definition/`. A link check over every
`.md` under machine-fragments (excluding `operations-in-definition/`) found no broken relative link.

## Defects

### Defect 1: "Story reads: merge 3" marks missing where the plan says they belong

Section 7 item 17 (line 2921) says "Each is marked *Story reads: merge 3*", and plan section 4 says the same. Only two
places carry the words: 2.7.11 (line 1407, `Overloaded` fixtures) and C30's `Entity.queue` half (line 2805). Missing:

| Plan section 4 row | Where the mark belongs | Fix |
| --- | --- | --- |
| Settlement-to-admission moment (A20: "Story read marked") | line 814, the paragraph "Settlement publishes without a turn" | append: "How a Story reads this frame and asserts the gap is merge 3's (*Story reads: merge 3*)." |
| Held unknown lanes in evidence (A10: "Story read marked") | rule 21, existence bullet, line 586, after "is visible (merge 4, "Lane lifetime")" | insert "(*Story reads: merge 3*: the `checkpoint.evidence` shape)" |
| Same row, C30 | line 2805, "held unknown lanes appear in actor evidence" | append "(*Story reads: merge 3*)" to that clause (the plan's A47 text puts the mark there, with K11) |
| `Entity.get` returning `predicted` in Stories (E16; Testing keeps `pending`) | C27 (line 2802) or 2.8.12 | append "Testing.plan still says `pending`; the Testing amendment waits (*Story reads: merge 3*)." |

Server truth versus the store (plan row 6) needs nothing: 2.7.11 already points to merge 3. If the owner prefers fewer
marks, the alternative fix is to change item 17's last sentence to "Only 2.7.11 and C30 carry the mark".

### Defect 2: stale citation artifacts from replacing line references

Replacing `MD:nnnn` citations with section numbers left self-references in two places:

- Line 1844: `(replaces the cache table of 2.7.1 for domain operations; C4, C4)`. M4 read "C4, MD:2136". Fix: `; C4)`.
- Line 1934: `(PER:123-127, C17 C17)`. M4 read "C17 MD:2149". Fix: `(PER:123-127, C17)`.

## Checks by item

**1. Completeness.** A1–A49: all present. Spot detail: A12 (rule 22 bullet "Callbacks" added, list shortened), A19 and
A35 (done per K3, see item 2), A23 (item 14 sentence removed), A32 (domain like excerpt plus plain-operation sentence), A40
(decided wording for E5, E10, E12, E15, E16; no `MD:` citations left), A41 (code verbatim), A46 (C2, C4, C10, C15, C17,
C18 all amended), A47 (C21–C30, with K11 split in C30), A48 (items 10 and 14 struck and closed; item 17 added), A49
(change log, intro, "Entity domains" decisions with "Lane lifetime" and "Also rejected"). B1–B11: all present (B2 in
2.8.2 and 2.7.8; B3 in 2.8.1 and B4 in 2.7.2; B5 in 2.8.13; B6 rule 34; B7 rule 35, 2.7.1 reasons row and C22; B8; B9
C18, the `import`, Package O1; B10 paragraph; B11 keywords, change log, M5-D1–D10 verbatim against M5 section 10). K1–K10,
K12–K21 and K3/K11 as recorded in delegated-decisions.md: all applied (K9 in the Machines O1 row, K7 in rule 31, K20 in
2.8.10, K5 as the D7 annotation).

**2. Unlisted changes.** Every deletion in the two design diffs (67 removed lines) traces to an edit. Hunks with no A/B
number, all justified:

- Step 5 "Starts" bullet (line ~790), the step-5 row in 2.7.12, rule 28's "(2.5 steps 5–6)", the rewritten "starting side"
  paragraph in 2.8.4 and "Start" in 2.8.13: these are K3 (one order for every write), as recorded in delegated-decisions.md
  row 2. Justified.
- B2's `(i, input)` line also in the 2.7.8 like excerpt: justified. That excerpt is copied from 2.8.2 (A32), so leaving the
  old line would put two forms of the same `setLike` in one document.
- README: the two merge rows removed, Order column renumbered (merge 6 now 1, merge 3 now 2). Justified: plan section 6.4
  asks for the removal, and the renumbering matches the work-order table at the top of the README (streams before
  stories). The merge 3 "Depends on" cell points to `merged/entities.md` as the plan says.
- Re-wrapped paragraphs (the multiplicity change-log bullet, the Decisions intro, several edited lines now longer than
  120 columns): formatting only, see nits.
- Extra words, not extra content: the intro sentence "Rules 13–25 and N1–N3 still apply" before rule 26; the 2.7.8 plain
  operation sentence is longer than the plan's one sentence (it keeps the content of the removed example). Harmless.

**3. Nothing dropped.** Checked the removed lines one by one: only text an edit replaces. The 2.7.8 example loses
`LikeSynced`/`LikeRefused`/`revertToConfirmed` by A32 (they still appear in 2.8.2's "what changed" table and 2.8.3, as
M4 has them). Nothing in D1–D21, rules 1–25, N1–N3, C1–C20, P rows or the examples was removed. D7 is annotated, not
changed.

**4. Fidelity.** A word-level diff of M4 section 2 and 3 against 2.8.1–2.8.13 shows only these differences: section
renumbering, citation rewrites, the K3 rewording in 2.8.4, the A40 proposal-to-decided rewrites (3.4 cancel, 3.7 keys, 3.8,
3.9, 3.11), the "Count" paragraph dropped (A39), and the merge 5 edits. Rules 26–38 differ from M4 section 4 only by the
listed re-pointing and K7 (rule 31), plus B6/B7. Rules and decisions spot-checked against the sources: 26, 27, 28, 29, 30,
31, 32, 33, 34, 35, 36, 37, 38; E1–E8, E10–E12, E14–E18 (all match M4 section 10, order kept); M5-D1–D10 (verbatim);
M5-D4/D5/D6/D8/D9. "Proposed" wording became decided wording only for E5, E10, E12, E15, E16, all decided in M4 section
10. The Decisions intro says merge 4 was accepted "with every recommendation of its section 9", which matches M4's own
section 10.

**5. Internal consistency.** No contradiction found between 2.8 and rules 26–38 (2.8.4 vs rules 27–28, 2.8.5 vs rule
29 and the `NotSent` table vs rule 35, 2.8.6 vs rules 30–32, 2.8.8 vs rule 34, 2.8.9 vs 36, 2.8.10 vs 37, 2.8.11 vs 38).
Cross-references to rules, 2.8.x sections, C rows and section 7 items resolve to the right targets. No "after publish"
or "Nothing is decided at settlement" remains. The only wrong-mark finding is Defect 1.

**6. References.** README, NEXT, audit-multiplicity, merge-3 (proposal and review-2), merge-6 (proposal and gaps),
operations-in-fragments and the entity-analysis folder (brief, proposal, reviews, spike) all point at the new paths. The
`../` to `../../` change is correct in the moved proposal; its status header is present.

## Nits (not defects)

1. NEXT.md still has item 1 ("Merge 5: five choices ... decide section 9.2") and item 5 ("Merge 5 into the design after
   merge 4"). Both are stale; the plan leaves NEXT.md to the main session's next write.
2. Dates: the design says merge 5 was merged on 2026-10-30, but its M5-D10 and the README say it was accepted on 2026-10-31,
   and the Decisions intro for merge 5 says "settled ... 2026-10-30". The multiplicity audit uses 2026-10-31 too, so this
   may be the project's convention; worth one look.
3. The merge 4 change-log bullet omits places the edits touched (2.1 snapshot list, 2.6 key order, D1 and D7); the merge 5
   bullet omits 2.7.1, 2.7.2, 2.7.8 and C22 and the keyword rows. Add them if the log is meant to be complete.
4. 2.7.9 (line 1347) still says "maps `success` and its failure tags"; rule 13 now says `failure:` also carries `Defect`
   and `Interrupted`. Not a contradiction, but "its failure tags (and Flow's `Defect` and `Interrupted`, rule 37)" would
   close the gap.
5. Line 1952 (2.8.13 "Start"): "(merge 5, A8)" is followed by "(ED:339)" on the next line, so the sentence reads awkwardly.
   Move "(ED:339)" before "(merge 5, A8)" or drop it.
6. Several merged paragraphs lost their hard wrap (lines over 120 columns: status paragraph, rules 31 and 35, the 2.7.1
   reads bullet, 2.7.3, 2.7.9, 2.7.11, change-log and decisions lines). Run the formatter or re-wrap.
7. Design question, not a merge error (K3): the new step-5 "Starts" bullet mints Attempts and joins queues before the
   paragraph that says a failing select or invalid duration rejects the turn (`InvalidTurn`). The text implies nothing is
   kept when the turn is rejected, but it does not say so. One clause in step 5 ("nothing is minted if the turn is
   rejected") would remove the doubt.
8. M5-D4 cites "rule A9" (merge 5's rule for entity-domain.md section 9) with no pointer in the design; 2.8.6 uses "merge 5,
   A9". Consistent, but a reader meeting "A9" in the design may look for A9 in section 4 (a problem id there is not
   "A"). Fine as is; the status paragraph explains where A1–A12 live.
