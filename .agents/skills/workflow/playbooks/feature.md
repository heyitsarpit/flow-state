# Feature

Run one feature slice as `agent:workflow-coordinator`. Workflow owns the human conversation;
you own phase progression and delegate substantive work when needed.
Read the assigned outcome, authority, budget, endpoint, and current records. Use the
`coordination-policy` skill for dispatch and handoffs.

Use the worker brief (Use the `orchestrate` skill) for bounded assignments.
Give workers actual upstream results and relevant methods for their phase.
Bind configured models; explicitly reuse compatible duties. Keep checkers independent of authors.

## Phases

Return each preparation phase result with a recommended next step, then stop unless an explicit
combined grant covers the next phase. Carry that grant forward without asking again.
Task refinement and readiness checks complete Spec preparation; they are not a separate human
checkpoint.

1. **Design the affected modules.** Reuse approved Plan decisions. For unsettled intent, use the
   `planning` and `to-plan` skills to settle outcomes and Plan Verification targets.
   Return the Plan for approval before dependent work; reuse approval of unchanged content.
   Run [Module design](module-design.md) to establish Requirements, behavioral and internal
   Invariants, test obligations, and implementation planning in the owning Specs.
   Reuse adequate contracts and design. Investigate unresolved boundaries with the
   `change-impact` skill. Return cohesive Spec snapshots, review verdicts, and open gates.
   Preserve any agreed Spec approval gate. Planning-only work ends at the requested artifacts.

2. **Create and reconcile Tasks.** Use the `to-task` skill with the Plan and module designs.
   Require bounded complete paths, write scopes, executable checks, and genuine dependencies.
   Identify shared prerequisites and conflicting write scopes; reuse and refine existing Tasks.
   Assign work for required verification and unresolved implementation or tooling prerequisites.
   Keep blocked work draft; independent ready slices can proceed within authorization.
   Return Task paths, readiness, blockers, and expected evidence.

3. **Confirm readiness.** Check Tasks against the settled Specs and Plan Verification targets.
   Resolve missing contracts or design through Module design; refine affected Tasks after changes.
   Require applicable contract, tooling, and approval gates before execution. Valid artifacts and a
   plausible design are not passing product evidence. Return ready work and remaining gates.

4. **Execute and check.** Within the authorized Task set and limits, continue through
   implementation, checks, required review, repair, integration, verification, and record updates.
   Require a ready owning Task before code changes.
   Keep coupled work with one worker; fan out independent ready slices.
   Reuse current complete-path evidence. Otherwise require a checked narrow consumer path before
   broad implementation. Use the `execute-task` skill to coordinate the loop.
   Give `agent:implementer` its method (Use the `implement-task` skill), Task,
   contracts, base/dirty state, write scope, and lint reference (Use the `workflow-configuration`
   skill). Require repeatable public-boundary tests; missing
   tests are implementation work.
   Give `agent:acceptance-checker` its method (Use the `check-task` skill) and the actual
   patch/evidence.
   Return product failures to the implementer; contract or design gaps to phase 1.
   Repeat affected checks after repairs. Release dependent Tasks only on current passing gates.
   Return the checked patch, snapshot, verdicts, and evidence.

5. **Assemble and verify.** Assign `agent:integrator` shared assembly only when needed.
   Assign `agent:runtime-operator` runtime verification (Use the `runtime-verification` skill)
   for missing complete-path evidence. Give the acceptance checker the assembled snapshot.
   Have it assess the complete result and rerun affected checks from phase 4.
   Cover every required target of the authorized scope at the assembled snapshot.
   Deferred, failed, blocked, or unexercised required targets prevent a completion verdict.
   Have the checker return missing required independent review to you. Use the `review` skill for
   required review; give reviewers their assigned methods.
   Return product findings to phase 4 and contract or design gaps to phase 1.

6. **Record and deliver.**
   Give `agent:record-writer` final verdicts and workflow-cli (Use the `workflow-cli` skill). Mark
   Tasks done only after required gates pass at the final
   snapshot.
   For granted publication, give `agent:delivery-operator` applicable
   [Opening a PR](opening-a-pr.md) steps. Preserve any granted remaining delivery lifecycle.

Stop at the endpoint, budget, or explicit hold. If no authorized work is ready, return blockers
and the owning phase. Relay product questions through Workflow; workers repair technical findings.
On hold, stop new dispatch, stop owned workers, and return their state with a recoverable
checkpoint.

**Reply to Workflow:** consumer outcome, chosen shape and reason, Plan/Spec/Task paths, snapshot,
verdicts, evidence, open gates, and next authorized boundary.
