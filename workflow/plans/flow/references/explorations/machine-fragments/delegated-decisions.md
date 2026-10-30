# Delegated decisions, for the owner's later review

Small conflicts and superseded-decision clean-ups that the main session resolved on its own while merging, under the
owner's delegation of 2026-10-30 ([merged/operations/decisions.md](merged/operations/decisions.md) OD24). Each row can be reverted on its own:
the commit that applied it is listed. Larger conflicts are not here; they go to the owner as numbered questions.

**Wider delegation (owner, 2026-10-31):** for streams (merge 6) and operations-in-fragments, the main session takes both to the finish line (revisions, reviews, merges) without asking, including syntax changes and new vocabulary where needed. Every such decision is logged here or in the proposal's decisions file, marked "delegated", for the owner's later review.

| # | Where | Conflict | Resolution | Commit |
| --- | --- | --- | --- | --- |
| 1 | merge-plan-4-5.md 3.1–3.3, K1, K2, K4–K10, K12–K21 | the small conflicts between merge 4, merge 5 and the design (wording, numbering, superseded clauses) | as proposed in the merge plan's conflict tables | e4e9527b (merge 4), a88b24b6 (merge 5) |
| 2 | merge-plan-4-5.md K3 | rule 28 needs a domain write's decline, queue join and prediction before the starting turn publishes; plain writes are minted after publication today | one order for all writes: minted and decided in step 5, before publication. Consistent with operations OD16 (cells apply in step 5, action order) | e4e9527b |
| 3 | merge-plan-4-5.md K11 | `Entity.queue` removals (merge 4) vs `ending` entries (merge 3) | deferred to merge 3: merge C30's Inspection half now, mark the `Entity.queue` half "Story reads: merge 3" | e4e9527b |
| 4 | merged/operations/merge-plan.md 2, the small conflicts (25) | wording, renumbering, superseded clauses between operations revision 13 and the merged design | as proposed in the plan's conflict table | operations merge commit |
| 5 | operations merge-plan X7 | rule 20's `NotSent` requirement after OD5 | `NotSent` must be mapped under `reject` or `serialize` where the machine cancels, for a persisted identity, or for a domain write | operations merge commit |
| 6 | operations merge-plan X9 | MD says lanes change only at admission; under OD19/OD20 the Runtime applies cells outside turns | a Runtime step that changes a bound lane publishes like settlement does (as proposed in the plan) | operations merge commit |
| 7 | operations merge-plan X19 | MD examples 3.2 and 3.4 fail the new checks (3.2 deadlocks behind `idle`; 3.4's `PinUnsure` never releases) | port both examples to the decided model (as proposed in the plan) | operations merge commit |
| 8 | operations merge-plan X22 | per-tag `unknown` (OD23 Q36): exhaustiveness | exhaustive over the contract's unknown tags, as `failure`; Flow's own reasons optional in the type, required by `flow check` where they can occur | operations merge commit |
| 9 | operations merge-plan X27 | `Released` has no row in 2.8.6's store-effect table | add the row from the proposal's own words | operations merge commit |
| 10 | operations merge-plan X31 | a commit queued behind a hold heads its records' queues, so other actors' writes to those records wait while the hold lasts | stated as a limit (the lane model has no record queues); remedy: release or retry the hold | operations merge commit |
| 11 | lane model on revision 13 | flags of a parked lane under `cancel`/`allow` unstated | `uncertain: true` while a parked unknown holds the lane (it is `Held`) | operations merge commit |
