# Feature

Run one feature slice as `agent:workflow-coordinator`. Workflow owns the human conversation;
you own phase progression and delegate substantive work when needed.
Read the assigned outcome, authority, budget, endpoint, and current records.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to dispatch and handoffs.

Use [the worker brief](../../orchestrate/references/worker-brief.md) for bounded assignments.
Give workers actual upstream results and relevant methods for their phase.
Bind configured models; explicitly reuse compatible duties. Keep checkers independent of authors.

## Phases

Return each preparation phase result with a recommended next step, then stop unless an explicit
combined grant covers the next phase. Carry that grant forward without asking again.
Task refinement and readiness checks complete Spec preparation; they are not a separate human
checkpoint.

1. **Settle intent.** Reuse current Plan decisions. For unsettled choices, assign
   `agent:planning-interviewer` [planning](../../planning/SKILL.md) and `agent:plan-writer`
   [to-plan](../../to-plan/SKILL.md).
   Require consumer outcomes and Plan Verification targets covering the agreed outcomes.
   Loop: investigate → questions/recommendations → answers through Workflow → record → next round.
   Return the Plan, remaining questions, and agreed acceptance. Require Plan approval before
   dependent work; reuse approval of unchanged content. Dependent choices wait for answers.

2. **Draft Tasks.** Give `agent:task-designer` [to-task](../../to-task/SKILL.md) and the intent
   results. Require bounded complete paths, write scopes, executable checks, and genuine
   dependencies. Identify shared prerequisites and conflicting write scopes. Keep unresolved work
   draft. Have the designer record review gates from the assignment and consequential contract
   risks. Return Task paths, current readiness, blockers, and expected evidence.

3. **Establish behavioral contracts.** Assign `agent:impact-investigator`
   [change-impact](../../change-impact/SKILL.md) for unresolved boundaries. For new or changed
   module behavior, state, or cross-boundary guarantees, run [to-spec](../../to-spec/SKILL.md).
   Coordinate its selected phases with your workers. Give `agent:spec-author` [author
   guidance](../../to-spec/references/spec-author.md) and `agent:spec-checker` [checker
   guidance](../../to-spec/references/spec-checker.md). Record module behavior, invariants, and
   public-boundary test obligations; keep algorithms and realization out of the Spec. Refine
   affected Tasks against the contracts. Readiness follows the behavior contracts, not a concrete
   implementation shape. Missing behavioral contracts or tools block affected slices; independent
   ready work can proceed. Return findings to authors; repeat affected checks within budget until
   the contract passes. Reuse settled contracts and valid evidence. Return the Spec snapshot,
   verdict, and open gates.
   Check required verification has work and invariants/tests support the required guarantees.
   Use [to-design](../../to-design/SKILL.md) only for difficult implementation choices or design
   reviews, and keep implementation details out of the Spec.
   Planning-only work returns requested validated artifacts and stops before implementation.

4. **Execute and check.** Within the authorized Task set and limits, continue through
   implementation, checks, required review, repair, integration, verification, and record updates.
   Require a ready owning Task before code changes.
   Keep coupled work with one worker; fan out independent ready slices.
   Reuse current complete-path evidence. Otherwise require a checked narrow consumer path before
   broad implementation.
   Use [execute-task](../../execute-task/SKILL.md) to coordinate the loop.
   Give `agent:implementer` [its method](../../execute-task/references/implementer.md), Task,
   contracts, base/dirty state, write scope, and
   [lint reference](../../setup-workflow/references/lint.md).
   Require repeatable public-boundary tests; missing tests are implementation work.
   Give `agent:acceptance-checker` [its method](../../execute-task/references/task-checker.md)
   and the actual patch/evidence.
   Return product failures to the implementer; contract gaps to phase 3.
   Repeat affected checks after repairs. Release dependent Tasks only on current passing gates.
   Return the checked patch, snapshot, verdicts, and evidence.

5. **Assemble and verify.** Assign `agent:integrator` shared assembly only when needed.
   Assign `agent:runtime-operator` [runtime verification](../../runtime-verification/SKILL.md)
   for missing complete-path evidence. Give the acceptance checker the assembled snapshot.
   Have it assess the complete result and rerun affected checks from phase 4.
   Cover every required target of the authorized scope at the assembled snapshot.
   Deferred, failed, blocked, or unexercised required targets prevent a completion verdict.
   Have the checker return missing required independent review to you.
   Use [review](../../review/SKILL.md) for required review; give reviewers their assigned methods.
   Return product findings to phase 4 and contract gaps to phase 3.

6. **Record and deliver.**
   Give `agent:record-writer` final verdicts and [workflow-cli](../../workflow-cli/SKILL.md).
   Mark Tasks done only after required gates pass at the final snapshot.
   For granted publication, give `agent:delivery-operator` applicable
   [Opening a PR](opening-a-pr.md) steps. Preserve any granted remaining delivery lifecycle.

Stop at the endpoint, budget, or explicit hold. If no authorized work is ready, return blockers
and the owning phase. Relay product questions through Workflow; workers repair technical findings.
On hold, stop new dispatch, stop owned workers, and return their state with a recoverable
checkpoint.

**Reply to Workflow:** consumer outcome, chosen shape and reason, Plan/Spec/Task paths, snapshot,
verdicts, evidence, open gates, and next authorized boundary.
