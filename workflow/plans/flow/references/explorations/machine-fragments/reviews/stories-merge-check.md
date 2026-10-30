# Check: Stories (merge 3) merge into machine-design.md

Reviewed 2026-10-31. Scope: 43cbff2a (change set 1, SE1–SE32) and 5da6e558 (change set 2, EX1–EX8, and the move to
`merged/stories/`), against `43cbff2a^` (7e7c430f), using
[merged/stories/merge-plan.md](../merged/stories/merge-plan.md) (SE, EX, SX1–SX20, AX1–AX6, M1–M7),
[proposal-v2.md](../merged/stories/proposal-v2.md) (revision 3), [decisions-v2.md](../merged/stories/decisions-v2.md)
(T1–T7) and [delegated-decisions.md](../delegated-decisions.md) rows 18–22. Method as in
[fragments-merge-check.md](fragments-merge-check.md). Line numbers are of `machine-design.md` at 5da6e558, which is
also HEAD for that file. Only this file was written.

## Verdict

**Merged correctly, with 3 small defects and some nits.** None of the defects changes a decided rule. All 32 SE edits
and all 8 EX edits are present. Every SX resolution is applied: SX1 (rules 61–66, streams from 67), SX3–SX9, SX11–SX15,
SX17, SX18, and SX19 (no edit). SX16 is applied except for one mark (defect 1). AX1–AX6 are in 2.10.17. Nothing was
dropped. Two defects are places where the merge left text the plan replaces or adds to (defects 1 and 2). One is an
unlisted change to an example (defect 3).

Mechanical results:

- **Numbering.** Rules 1–66 are consecutive and unique, with 61–66 after rule 60 under a "Stories" block. That block
  says streams renumber from 67. N1–N3 are unchanged (lines 701–714). The counts of D1–D21, E1–E18 and M5-D1–D10 are
  the same before and after. OD1–OD26 (with OD2a; OD24 after OD26, as before) and F1–F10 have no duplicate and no gap.
  Stories T1–T7 are a new subsection, and the tooling rows T1–T4 are untouched. C1–C85 are consecutive, and the 17 new
  rows are C69–C85. Section 7 runs to 21, the new item being 21.
- **No unlisted changes.** Every hunk of `git diff 43cbff2a^ 5da6e558 -- machine-design.md` traces to an SE or EX edit
  or to an SX/AX resolution. Some go beyond the plan's wording, and each is consistent with it:
  - rule 61 names `MixedScheduler` and cites 2.10.17.5;
  - rule 62 ends with T2's "every ending comes from a fake's answer … No ending is injected (Testing O3)";
  - rule 63 says "Testing O1's no-callbacks rule holds";
  - 2.7.2's row cites 2.10.4;
  - 2.8's intro adds "and marks";
  - 2.10.15 gains "Rule 58's walks, as steps", ported from SP 5.2's STF62 (SE8's pointer);
  - 2.10.12's example binds `const L` (SP's version used an unbound `L`) and is renamed `lockout/paused`;
  - 3.1's Lockout gains `.enter()` and `callback` record expectations (EX6).

  The one change that is not consistent with the plan is 2.7.11's code block (defect 3).
- **Fidelity (spot checks: 6 rules and all 22 subsections).**
  - **Rules 61–66** were compared with SP 1's R-Settle … R-Owner, and all six match. The differences are SX2's
    substitutions, SX4 and SX16's mark in rule 65, and the additions listed above.
  - **2.10.1–2.10.17.6** were diffed sentence by sentence against SP 2.2–2.17 and 3.1–3.6, after SX2's substitutions.
    The only other differences are the stated resolutions:
    - SX4 (2.10.6's two address sentences);
    - SX14 and SX15 (2.10.12);
    - AX1 (2.10.2's `NothingHeld`, and the 2.10.17.2 and 2.10.17.3 `nth` rows);
    - AX2 (2.10.17.2, and 2.10.17.3's `Open`/`Silent` cells);
    - AX3 (2.10.17.4's two cells);
    - AX4 (2.10.4's storage words, and 2.10.17.6's `duplicate` line and restore-read lines);
    - AX5 (2.10.17.2's suspended row, and 2.10.17.3);
    - AX6 (2.10.17.2's ownership rule);
    - the *Stream details* marks;
    - "section 8, Q15" → "section 7 item 21".
  - **The points named for checking:**
    - R-Settle's `executionMode: "sync"` is exact, and it exists on `MixedScheduler` in the installed effect 4.0.5
      (`node_modules/effect/src/Scheduler.ts:176–185`).
    - Step cuts (rule 64, 2.10.6), the `world` option (2.10.1's start) and the address shape (rule 65) are exact.
    - `Fake` and its four wire words (rule 62, 2.10.4) are exact. 2.10.4's `Stripe`/`StripeFake` code matches SP 2.5
      token for token once the keyword marks are stripped.
    - No ending injection (T2) holds in rule 47, rule 62, 2.10.5 and 2.7.13.
    - `HeldConfirm` (2.10.17.6, with the T7 cell) and the stand-in host (rule 11, 2.10.12, 2.10.17.4) are exact.
  - **2.10.18.1–2.10.18.6** match SP 2.1, 4.1, 4.2, 4.4, 4.5 and 4.7 once the keyword marks are stripped. Citations are
    remapped, and 4.3 and 4.6 are left out as planned.
- **Decisions.** Stories T1–T7 match decisions-v2.md word for word. F7 carries SX18's annotation.
- **Marks.**
  - *Story reads: merge 3* is left only in the change log's merge-4 entry (line 6010, history, as plan 1.2 says).
    Items 17 and 19 are struck through and closed, with their "Was:" text kept.
  - *Stream details: merge 6* is at:
    - the status paragraph (18);
    - rule 65 (1070);
    - 2.10.3 (3833);
    - 2.10.6's `session` row (4048);
    - 2.10.9, the whole section (4112);
    - 2.10.14 (4252);
    - 2.10.15, its stream cells (4289) and its adapter (4299);
    - 2.10.18's intro (4511);
    - C70, C79 and T2.

    The marks the fragments merge placed (817, 944, 2103, C57) are untouched.
- **Old Story code.** No `story.machine`, `story.app`, `process()`, `run.calls` or `checkpoint.exit` code is left,
  except in 2.10.18.1's "Before" (4524, 4527). Prose mentions of these words fall into four groups:
  - they are listed as removed (rule 61, the 2.10 intro, 2.10.12, 3.6's "Removed" row);
  - they are kept as history (section 7's "Was:" text, the T3 and T5 decisions);
  - the Testing O1 fragments row keeps its old text, with "replaced by C69" appended, as SE21 says;
  - C69's and C70's "Replaces" cells quote the plan text they replace.
- **Testing O1–O4.**
  - O1: C69, the fragments row and C63 all point to C69.
  - O2: C70 matches rule 61 and 2.10.2.
  - O3: C71, C16 (superseded) and C53 agree with rule 62 and T2, with no remaining tension.
  - O4: C72 matches rule 64 and B4, and answers C27's note.
- **`model()`.** It is gone everywhere: 3.6 "Existing" no longer lists it, the "New, plans" parenthesis and the
  "Removed" row say so, and C77, C82 and T1 are annotated. The remaining mentions are history (change log, D-section
  text).
- **Links.** Every relative link resolves in these files:
  - `machine-design.md`, `README.md`, `delegated-decisions.md`, `open-items.md`, `NEXT.md`, `audit-multiplicity.md` and
    `principles.md`;
  - everything under `merged/stories/`, `merge-6-streams/` and `reviews/`.

  The merge plan's `(…)` placeholders are its own shorthand. The README (M4) and open-items 28–32 (M6) are applied,
  and so are delegated-decisions rows 18–22 (M7).

## Defects

1. **2.10.6, the `issue`/`diagnostic` row (line 4050): the *Stream details: merge 6* mark is missing.** The row names
   merge 6's flags `UnprovenValues`, `RegistrationChurn` and `ReleaseOverdue`, and SX16 places a mark at "2.10.6
   (`session`, `diagnostic`)". Only the `session` row got it.
   **Fix:** "merge 6's flags `UnprovenValues`, `RegistrationChurn`, `ReleaseOverdue` are `diagnostic` records" →
   "merge 6's flags `UnprovenValues`, `RegistrationChurn`, `ReleaseOverdue` are `diagnostic` records (*Stream
   details: merge 6*)".
2. **2.7.16, the Stories bullet (line 2563): SE15 is applied only in part.** SE15's After begins "Stories: `ending`
   records name `operation`, `contract`, the verb and `key` (2.10.6)". The merged text keeps the old "`ending`
   evidence names …", so 2.7.16 still uses "evidence", which 2.10.6 replaces with records.
   **Fix:** "- Stories: `ending` evidence names `operation`, `contract`, the verb (`commit`, `lookup`, `subscribe`)
   and `key`;" → "- Stories: `ending` records name `operation`, `contract`, the verb (`commit`, `lookup`,
   `subscribe`) and `key` (2.10.6);".
3. **2.7.11's code block (lines 2057–2064) is not SP 4.1's `busyThenPaid` (EX5), yet it has the same id.** It ends
   with `expect(Stripe, { charges: [ … Story.attempt(O.pay, { n: 1 }) ] })`, while SP 4.1 and 2.10.18.2 (line 4583)
   end with an `ending` records expectation. The variant is correct, and it suits 2.7.11's heading "Stories read the
   server's truth". But two different Stories under one id contradict 2.10.1's "unique across the configuration"
   (C69).
   **Fix:** keep the variant and change its id and name:
   - `const busyThenPaid = Story.make(CheckoutMachine, { id: "checkout/busy-then-paid", …` →
     `const busyThenCharged = Story.make(CheckoutMachine, { id: "checkout/busy-then-charged", …`;
   - add to the paragraph below it: "(2.10.18.2's `busyThenPaid` checks the same run by its `ending` records.)"

## Nits

1. **Header decision table, row 3 (line 37).** It still says "T1 and Testing O5 marked for removal", though C77 and
   C82 now apply T1. It could read "removed (C77, C82)". The plan did not list this.
2. **C84 (line 5788).** The "Replaces or adds" cell drops the plan's "and delegated-decisions row 3 (K11)".
   Delegated-decisions row 22 records it, so nothing is lost.
3. **3.6's "New, Stories" row.** It lists `Fake.storage.seed` and `Fake/Lost` among the words, while 2.10's tier table
   (from SP 1) has 5 rare words without `Fake.storage.seed`. SP 7 has the same gap, so this is inherited.
4. **SX16's list names 2.10.17.3 and C78, which carry no mark.** Neither reads merge 6 content: 2.10.17.3 is the
   generic stream-endpoint table, and C78 lists lanes and work. No mark is needed. The plan's list over-names.
5. **"Settled by the owner" (decisions intro, line 6527).** The sentence now also covers Stories T1–T7, which were
   delegated. The Stories subsection says so, and F10 and OD24 have the same precedent. It could read "Settled by the
   owner or under the owner's delegation".
6. **Stale `merge-3-stories/` text paths.**
   - `NEXT.md` lines 10 and 12 are live text, not history. NEXT.md is dated 2026-10-30, and M8 leaves it to the main
     session.
   - `delegated-decisions.md` rows 17 and 18 are left as text by M3. Row 18 was written in this merge, though, so
     "merged/stories/merge-plan.md" would be more accurate.
7. **Delegated-decisions row 18 says "16 small conflicts".** M7's list (SX1–SX3, SX5–SX12, SX16, SX17, SX19) has 14.
8. **The labels of moved links in `proposal-v2.md`.** Its header link labels still read `../machine-design.md` and
   `../merge-6-streams/proposal-v2.md`, while their targets are `../../…`, which is correct. Only the labels are
   stale.
