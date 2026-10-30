# Delegated decisions, for the owner's later review

Small conflicts and superseded-decision clean-ups that the main session resolved on its own while merging, under the
owner's delegation of 2026-10-30 (operations-in-definition/decisions.md OD24). Each row can be reverted on its own:
the commit that applied it is listed. Larger conflicts are not here; they go to the owner as numbered questions.

| # | Where | Conflict | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | merge-plan-4-5.md 3.1–3.3, K1, K2, K4–K10, K12–K21 | the small conflicts between merge 4, merge 5 and the design (wording, numbering, superseded clauses) | as proposed in the merge plan's conflict tables | merge 4 / merge 5 commits |
| 2 | merge-plan-4-5.md K3 | rule 28 needs a domain write's decline, queue join and prediction before the starting turn publishes; plain writes are minted after publication today | one order for all writes: minted and decided in step 5, before publication. Consistent with operations OD16 (cells apply in step 5, action order) | merge 4 commit |
| 3 | merge-plan-4-5.md K11 | `Entity.queue` removals (merge 4) vs `ending` entries (merge 3) | deferred to merge 3: merge C30's Inspection half now, mark the `Entity.queue` half "Story reads: merge 3" | merge 4 commit |
