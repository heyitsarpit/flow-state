# Check: operations-in-fragments merge into machine-design.md

Reviewed 2026-10-31. Scope: 48e3ca86 (change set 1, FE1–FE71, FE73–FE81) and HEAD (change set 2: FE72's 2.9.6 and
the move to `merged/fragment-operations/`), against `54531af0`, using
[merged/fragment-operations/merge-plan.md](../merged/fragment-operations/merge-plan.md),
[proposal.md](../merged/fragment-operations/proposal.md) (revision 3 with review 3's fixes),
[decisions.md](../merged/fragment-operations/decisions.md) (F1–F10) and [delegated-decisions.md](../delegated-decisions.md)
rows 12–16. Method as in [operations-merge-check.md](operations-merge-check.md) and [merge-4-5-check.md](merge-4-5-check.md).
Line numbers are of `machine-design.md` at HEAD. Only this file was written.

## Verdict

**Merged correctly, with 3 defects to fix and a few nits.** None of the defects changes a decided rule. All three are
places where the plan's own edits left an older sentence that now contradicts a new one. All 81 edits are present with
their intended text. Every conflict resolution is applied: FX1–FX27, the delegated FX6, FX7, FX8, FX13, FX14 and FX15
(rows 13 and 14), FX1's numbering (row 15: fragments take 48–60, so streams start at 61) and the open-items
renumbering to 21–27 (row 16). No rule, decision, C row or example was dropped.

Mechanical results:

- **Numbering.** Rules 1–60 are consecutive and unique (lines 392–1008), with N1–N3 at lines 694–707. D1–D21,
  E1–E18, M5-D1–D10, OD1–OD26 (with OD2a; OD24 sits after OD26, as before the merge) and F1–F10 have no duplicate and
  no gap. The D, E, M5-D and OD entries are the same 77 before and after. C1–C68 are consecutive, with P5–P8, P11,
  P15, P19–P21 and T1–T4 untouched, and the 15 new rows are C54–C68. Section 7 runs 0–20, the new item being 20.
- **No unlisted changes.** Every hunk of `git diff 54531af0 HEAD -- machine-design.md` traces to an FE edit or an FX
  resolution. Four go beyond the plan's wording, and each is consistent with it:
  - FE2's row says "Operations O3/O7", where the plan has O3; C68 amends O7 too.
  - FE16 also names 26–38 and 39–47; both are accurate.
  - Rule 44's "An ending with no binding actor" now reads "no live actor incarnation" (FX9's actor-level reading).
  - C33, C36 and C39 gained "amended by" marks (C68, C56).
  The issue page in 2.9.6 is ported in full rather than as the plan's "three-line note" (plan 2.8). It is the same
  code as FP 4.4's second host.
- **Fidelity (spot checks).** Rules 48–60 were compared sentence by sentence with FO0–FO12, and all 13 match. The only
  differences are the plan 2.2 substitutions (FO*n* → rule *n*, "MD rule" → "rule", RV → "FP RV") and the stated
  resolutions:
  - FX6 and FX7 in rule 51 (the restore reset as a pending reset; `NotSent` checked at the placement);
  - FX11 in rule 51;
  - FX9 and FX10 in rule 53 (unplaced vs unbound; "a trait: its own `on`");
  - FX13 and FX14 in rule 52;
  - FX16 and FX27 in rule 60;
  - FX17's mark in rule 52.

  Further checks:
  - **2.9.1–2.9.5** were diffed against FP 1.1, 1.2 and 2.3–2.8. The only changes are citation substitutions, and FP
    2.9's concept table was dropped because 3.6 holds those concepts.
  - **FO12's releasing mark** (rule 60, and 2.9.3's releasing rows, `cancel`/`allow`, order and capture) is exact.
  - **The subject path** (rule 51's second and third bullets, 2.9.4's upgrade rule) is exact.
  - **The freeze and thaw rows** of the 2.4 delta are exact, and so are rule 1's freeze bullet and rule 52.
  - **The 2.4 delta to the write-lane table** is 2.9.3, diffed line by line against FP 2.4.
  - **The 2.7.13 counterparts** are FE66's dispose row and hydration cell, FE68's parked note and FE66's "Delivered".
  - **F1–F10** match decisions.md verbatim (F10 marked as process).
  - **2.9.6's code** matches FP 4.1 After, FP 4.4 After (both hosts) and FP 2.10 token for token once comments are
    stripped.
- **Rule 3 and 2.2.2's ban.** It is superseded everywhere: section 1 (lines 50, 63, 69), 2.2.2 (319), 2.3 (331),
  rule 3 (443), section 4 D3, A5 and A7, and section 6. No "do no I/O", "run no operations" or "not I/O policy" is
  left. `principles.md` has M5's pointer.
- ***Stream details: merge 6* marks.** They are at rule 41 (810), rule 52's thaw bullet (938), 2.7.13's lifetime row
  (2057) and C57, which is where plan 2.10 puts them.
- **Links.** Every relative link in `machine-design.md`, `README.md`, `delegated-decisions.md`, `open-items.md`,
  `principles.md`, `merged/fragment-operations/` (proposal, decisions, exploration, reviews) and `reviews/` resolves.
  The only unresolved ones are in the plan's quoted After cells, the same pattern as in the operations plan. The path
  `operations-in-fragments/` survives only in merge-plan.md FE77's quoted Before. The plan's FX2 sweep is complete
  for OD20: no `OD20, F` is left.

## Defects

### Defect 1: rule 2 still says fragments' `internalEvents` come only from schedules

Line 438 reads: "`internalEvents` come only from the fragment's own schedules. On a definition or a fragment,
`internalEvents` come from its schedules or its operations' endings…". FE19 widened the second sentence but left the
first, so one bullet now says both things. Rule 49, H3 (line 4395) and the port table (FE9) all say schedules or
endings.

**Fix:** replace the bullet's first two sentences with "`internalEvents` come only from the declarer's own schedules
or its operations' endings (a fragment's too, rule 49); an event an operation maps comes only from endings (rule 47)."

### Defect 2: 2.7.13's Owner paragraph sends an unplaced lane's ending to evidence

Lines 2106–2110 read: "**With no binding incarnation** (decided, OD21…), an ending is applied…; if the lane's
identity has a saved actor record … **parked** … It is evidence only when no record of the identity survives (… a
non-persisted or local identity)." FE65 renamed the actor-level term. But for a lane that is unplaced in a live,
non-persisted actor, rule 53 (and the same paragraph's last sentence, line 2136: "parked … whether or not the
identity persists") parks the ending. Taken literally, this sentence makes it evidence. FX9 says that actor-level uses
read "actor incarnation".

**Fix:** "**With no live actor incarnation** (decided, OD21; R9 K25, H1)". Then, after "…in saved order (Persistence
O2, O4).", add: "With a live actor but no incarnation of the lane's path, the ending is parked for that path
instead (rule 53)."

### Defect 3: 2.8.4 parks every unbound-or-unplaced ending "for the identity's saved record"

Lines 2947–2948 read: "for a lane with no binding incarnation, the Runtime applies the cell when the ending lands and
parks the ending for the identity's saved record (rule 44)." FE73 changed only the term. For an unplaced lane the
ending is parked for the path on the lane record, not for a saved actor record.

**Fix:** "…parks the ending for the identity's saved record (rule 44), or, in a live actor, for the lane's subject
path (rule 53)."

## Nits

1. **Rule 60, line 1018–1020.** The grafted clause breaks the causal chain: "…reading no memory; `check()` applies
   no mark, so rule 22 does not apply…". Write instead: "…reading no memory, so rule 22 does not apply and OD8's
   `KeyRequired` does not apply to `whenAbandoned`; `check()` applies no mark."
2. **Rule 52, line 947.** "(amendment 23)" is FP section 7's numbering and means nothing in MD. Change it to "(C60)".
3. **Rule 14, line 576.** "With no binding incarnation the ending is parked for the lane's path (rule 53)" omits rule
   53's "unless the lane is releasing (rule 60)". Append it, as rule 8, N3 and 2.5 step 1 do.
4. **2.7.13 status bullet, line 2060.** "the Runtime's own steps for an unbound lane" should be "for an unbound or
   unplaced lane", matching FE59 and rule 27.
5. **2.7.3, line 1631.** "Two write operations on one write contract in one definition are a declaration error" is
   still true, but it no longer states the rule. Append: "per actor, counting every fragment placement (rule 40, F2)".
6. **Rule 41, line 812.** "A live operation is placed in one state at a time" should also cover a trait body. Write
   "in one state or trait incarnation at a time". The rule already carries the merge 6 mark, so this can wait for
   merge 6.
7. **2.9.3 header, line 3276.** "After (proposed)" is copied from FP, but F10 accepted the proposal. Change it to
   "After". The Before cell of the dispose row ("the binding actor ends") is pre-merge 2.7.13 text. That is correct as
   a Before, but say so: "Before (2.7.13 before this merge)".
8. **Typos.** Line 3332 reads "an rule 48 violation"; make it "a rule 48 violation". Line 3632 starts a sentence with
   lower-case "rule 48 admits it"; make it "Rule 48".
9. **Bare F-label outside OD20, line 4932.** "(F15, for the owner)" is the multiplicity audit's finding. After FX2, a
   bare F*n* means a fragments decision, so qualify it as "(audit F15, for the owner)", as line 4978 does with "audit
   F12".
10. **"On the definition" in 2.7 prose.** Rule 13's title (line 557) and 2.7's intro (line 1204, "A definition
    declares each server interaction once") are covered by FE28's reading rule only for rules 13–47. Optionally
    write "on the declarer" and "A definition or a fragment declares…".
11. **C18.** FX21 says C18 itself carries the `SharedContract` warning severity, and C18's type error "a key-less
    member outside its operation's ending (rule 43)" now has rule 60's exception. Both are reached only through
    "amended by C65". That is acceptable; add the two clauses to C65 if C18 should read on its own.
12. **For merge 6.** MD's "M6 rule 50" (line 1452) and "M6 rule 51" (line 2501) now sit beside MD rules 50 and 51 of a
    different meaning. Plan 2.10 leaves them to merge 6's renumbering to 61 and up. Listed so that rebase does not
    miss them.
