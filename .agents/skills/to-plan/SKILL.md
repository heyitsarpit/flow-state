---
name: to-plan
description: >-
  Read and maintain spec-lang Plans as understanding develops. Use to place outcomes,
  decisions, constraints, verification targets, and questions in their owning Plans.
  Detect conflicts before writing.
disable-model-invocation: true
metadata:
  kind: procedure
---

# To Plan

Record material understanding when it crystallises. Do not start another interview or invent
answers.
Use concise, concrete prose. Run from the project root; use command help for unfamiliar CLI syntax.

## Find the owner and check conflicts

Inspect `workflow/plans/` and `workflow/spec.index` first. If missing, run `workflow init`.
Read existing Plans before recording. Match each proposed change to the goal and scope it governs.
That Plan is its **owner**. Update it; create another only for a distinct, independently useful
scope.
Several Plans may be needed. Do not invent a hierarchy or duplicate shared decisions.

Before writing, compare the proposed understanding against relevant goals, outcomes, decisions,
and constraints across affected Plans. Check meaning, not just matching words or IDs.
If they contradict, return the existing statement, location, and conflicting proposal to the
user.
Do not record the proposal as settled or silently overwrite the existing commitment.
An unresolved conflict can be recorded as a question. Continue with unrelated settled material.

If the user has already explicitly resolved the conflict, apply that resolution without asking
again.
Reconcile replaced decisions and their references in the same coherent edit batch.

Record shared decisions once at their owner. Other Plans cite that owner and record local
implications.
State which Plan owns each change. Return uncertainty changing scope, ownership, or agreed
commitment to the user.
If no goal is known, surface that gap rather than inventing one.

## Record in the implemented format

Plans live at `workflow/plans/<id>.plan`; the header is `plan <id>` with the same ID.
`title` and an indented, nonempty `goal` are required. `status` is optional free text.
Read a valid artifact or the [syntax reference](../workflow-cli/syntax.md) when unfamiliar.

| Field                 | Meaning                                         |
|-----------------------|-------------------------------------------------|
| `goal`                | Objective, underlying problem, and context.     |
| `outcomes`, `O...`    | Consumer results: what must work.               |
| `decisions`, `D...`   | Chosen approaches, rationale, and alternatives. |
| `verification`, `V...` | Observable pass conditions for outcomes.       |
| `constraints`, `C...` | Binding limits, invariants, and commitments.    |
| `questions`, `Q...`   | Unresolved choices or unknowns.                 |

Objects have a title and an optional indented description. Put scenarios, sources, notes, and tables
in those prose blocks. Distinguish facts, assumptions, proposals, and agreed decisions.
Use the supported format; do not add schema fields or prescribe a Plan lifecycle.

Give each Verification entry its outcome reference, scenarios, pass conditions, and executable check
links.
Decisions explain the approach; they do not establish completion.
Define expected results independently of implementation; keep missing or pending checks visible.
Together, Verification entries must cover each outcome's intended scope; expose remaining
verification gaps.
Record actual runs and conditions in supported Task fields, not Plan status.

Cite local owners with `@D3` or `@V1`, and cross-Plan owners with `@plan.Other.V1` in prose.
Verify cited objects exist. Prose citations do not create enforced graph relationships.
Supported `derives_from` provenance can reference Verification entries; Task `satisfies` targets
Outcomes.
Plans do not declare workflow relationships to Tasks or Specs.

## Reconcile changes

1. Update the owning passage when its identity is unchanged. Preserve IDs and unrelated content.
   Add an object for a distinct concern. Do not renumber objects or change a Q ID into a D ID.
   Maintain Verification procedures and check links under the same ID while the target is unchanged.
   Changed agreed pass criteria require user agreement; routine check mechanics need no approval.
2. Record an answer in its owning decision, outcome, constraint, or supported prose.
   Find incoming references to the resolved question across Plans, Specs, and Tasks.
   Reconcile references and provenance before removing the question. A factual answer need not
   create a decision. Report out-of-scope reference edits with their locations.
   Defer removal until those references are reconciled.
3. Keep unresolved questions. When a settled premise becomes invalid, create a new question with
   a fresh ID and explain the changed premise. Preserve surviving IDs.
4. Replace unadopted proposals in place. Do not present implementation choices as user-confirmed.
   For an agreed reversal of a binding decision, mark the old decision superseded.
   Cite its replacement.
   Add the replacement decision with its predecessor and reason. Reconcile affected Plans.
   Keep enough context to explain the choice, without a transcript or separate decision ledger.

Run `workflow format PATH --write` for each changed artifact. Substitute its actual path for `PATH`.
Then run `workflow check`. Review the diff.
Check cross-Plan citations and report changed locations, unresolved conflicts, and validation
limits.
