# Next (written 2026-10-30, for 2026-10-31)

All paths are under `workflow/plans/flow/references/explorations/machine-fragments/`.

1. **Merge 5: five choices.** Fixes are done and committed (spike ALL PASS, 64 checks; record in
   `merged/entity-analysis/reviews/review-1.md`). Decide `merged/entity-analysis/proposal.md` section 9.2, each
   already written in with a recommendation: skipped predictions read `predicted`; unevaluable conditions match; keep
   array keys; no negated ordering of nullable values and `serverMatches` only under `and`; the
   `PredictionNotRetained` rename.
2. **Story lane reads (one decision).** `merge-3-stories/proposal.md`, section 3.14 and question 40: A (export commit
   values at module scope, recommended) or B (read by transaction and key).
3. **Story before/after session.** `merge-3-stories/proposal.md` (revision 3) against `../../Testing.plan`. Then
   accept merge 3.
4. **Merge 4 into the design: done 2026-10-30** (now `merged/entities.md`; plan `merge-plan-4-5.md`). Merge 3 goes last, on its own. Then a
   verification review.
5. **Merge 5 into the design** after merge 4.
6. **Merge 6 review, then merge.** `merge-6-streams/proposal.md` (accepted, not reviewed): one correctness review,
   fixes, then merge last.

Later, not blocking: review `../../EntityDomains.plan` against "client coherence, not a sync engine"; the `.plan` edits
(including removing `model()`, design T1) wait until the design itself is accepted.
