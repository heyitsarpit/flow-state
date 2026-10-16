# Refactoring

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Capture current behavior, settle changed boundaries, refactor, then prove behavioral equivalence.
Keep unrelated feature requests and bugs in separate scope.

1. `agent:source-investigator`: Use [runtime exploration](../../how/references/explorer-prompt.md)
   for missing caller/behavior facts; reuse valid findings. Pin outputs, failures, ordering, and
   side effects with an
   existing public-boundary check, capture, or equivalence harness. Compilation alone is not a
   behavioral pin.
2. `agent:composition-designer`: Name the structural burden and the target shape. Apply [code
   composition](../../code-composition/SKILL.md) to boundaries and interface depth. Delete redundant
   paths before adding abstractions. A new layer must remove a real burden.
3. `agent:composition-designer`: Return consequential contract implications to the coordinator.
   Request Arena for unsettled shapes or bounded run design for large migrations; reuse settled
   design.
4. `agent:workflow-coordinator`: Assign `agent:task-designer` [to-task](../../to-task/SKILL.md) to
   draft or reuse Tasks before contract work. Resolve consequential implications through
   [to-spec](../../to-spec/SKILL.md), with `agent:spec-author` using
   [author guidance](../../to-spec/references/spec-author.md). Refine affected Tasks against the
   settled contracts and require readiness before code changes.
   Assign bounded moves through
   [execute-task](../../execute-task/SKILL.md). Give `agent:implementer`
   [its method](../../execute-task/references/implementer.md); it keeps the behavior pin green
   and inventories callers, strings, docs, and back-references for renamed APIs.
5. `agent:implementer`: Migrate all in-scope consumers before removing an internal API. Preserve
   external compatibility commitments. Declare permitted intermediate failures and require final
   checks at the boundary.
6. `agent:acceptance-checker`: Apply [Task acceptance
   checking](../../execute-task/references/task-checker.md).
   Compare baseline and final behavior; request independent review through the coordinator when
   required. Return unjustified complexity to the `agent:implementer`
   for removal and rechecking. Route changed guarantees to step 3. Recheck the assembled final
   snapshot against the behavior pin; preserve failures and unrun scope in the Task.
7. `agent:record-writer`: Preserve Task evidence. `agent:delivery-operator` shapes authorized
   commits into verifiable units. Give it applicable [Opening a PR](opening-a-pr.md) steps only
   within the delivery grant. Mark Tasks done only after their required final-snapshot gates pass.

**Reply:** structural change, pinned contract, equivalence evidence, burden removed, and remaining
work.
