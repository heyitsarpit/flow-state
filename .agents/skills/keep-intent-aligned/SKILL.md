---
name: keep-intent-aligned
description: >-
  Keep Plans, Specs, and Tasks aligned with agreed user intent and material coworker findings.
  Apply when consequential decisions, contracts, acceptance, or evidence change; route updates
  to the skill that owns the affected record.
disable-model-invocation: true
metadata:
  kind: principle
---

# Keep Intent Aligned

Keep Plans, Specs, and Tasks aligned with agreed user intent and material findings from coworkers.
These are purpose-specific collaboration records, not a general memory dump.

Apply when a finding changes a consequential commitment, exposes a conflict, invalidates relied-on
evidence, or leaves material work unresolved for the next coworker. Routine activity and direct
explanations do not need recording merely because they occurred.

| Record | Record only | Routed skill |
|---|---|---|
| Plan | Outcomes, decisions and reasons, constraints, open choices. | `to-plan` |
| Spec | Behavioral requirements, invariants, test obligations. | `to-spec` |
| Task | Scope, acceptance, findings, evidence. | `to-task`, `execute-task`, `hillclimb` |

To-task creates or decomposes work. Existing Task updates belong to the owning procedure, such as
execute-task or hillclimb. Workflow-cli supplies file mechanics; it does not choose what to record.

When coding, review, or exploration leads an agent to propose a material change to recorded intent,
prefix the affected prose with `agent-proposed:`. Use it for Spec guarantees, especially invariants,
and for the rarer changes to Plan direction or decisions.
Routine Spec details and Tasks need no marker.
The marker lets humans quickly distinguish agent proposals from their own decisions.
Human review is not required for provisional work to continue within agreed intent.
The marker does not override explicit human commitments.
Later agents must not treat marked proposals as human-approved or beyond reconsideration.
Remove the marker when the human accepts the proposal.

## Reconcile records

1. **Read the relevant commitments and prior evidence.** Verify material historical claims
   against current code and conditions; records may be stale or incomplete.
2. **Compare before recording.** Separate an implementation defect from a missing contract,
   stale mechanism, or changed decision. Separate facts, hypotheses, proposals, and agreed changes.
   Surface conflicts; objective-level choices remain with the human.
3. **Route each change to its owner.** Use the table, preserve stable IDs, and reference commitments
   rather than copying them. The procedure that owns the record reconciles findings. Serialize
   writes to the same shared artifact.
4. **Keep the useful remainder.** Record only material reasoning, evidence and its limits, or open
   work that belongs in that file. Preserve reasons for reversals and invalidate affected evidence.
   Do not repeat the conversation, routine steps, or another record's contents.

A root cause is evidence, not automatically an invariant. If code violates an existing guarantee,
repair enforcement. If a consequential guarantee is missing, propose the required property and
its authority through to-spec. Updating a mechanism does not authorize weakening the guarantee.

Missing artifacts do not force the full workflow for a small repair or direct explanation.
Surface material findings when artifact edits are outside your assignment.
Project findings stay in project records; only reusable working-method lessons may inform reflect.
