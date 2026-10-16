# Syntax starter

These examples demonstrate syntax, not project decisions or completed verification.
Use spaces for indentation. Preserve existing IDs when editing.
Plans live at `workflow/plans/ID.plan`. Tasks live inside `workflow/tasks/EPIC/PHASE.task`.
The canonical Spec index is `workflow/spec.index`; its entries are project-root-relative.
An ID mentioned in another file can be a citation. Read the owning record before editing.
Task references use `@task.Epic.Task`; omit the phase ID even when the file lives in a phase folder.

## Plan

```text
plan Example
title Example work
goal
    Deliver the agreed outcome.
outcomes
    O1 The user can complete the agreed operation.
questions
    Q1 Which failure cases must the operation handle?
verification
    V1 Complete the agreed operation
        Establish @O1 by performing the operation and observing its required result.
        Executable check not yet implemented; retain this as an unverified obligation.
```

Author titled Verification entries directly, with scenarios, pass conditions, and executable paths.
Use `@V1` within its Plan and `@plan.Example.V1` in supported provenance fields.
Task `satisfies` targets only Outcomes.
Link a Task to an existing outcome with `satisfies`: `@task.Example.T1` to `@plan.Example.O1`.

## Proposed Spec

For `create spec --file body=PATH`, supply only sections below the metadata header.
Edit body sections directly after creation. Preserve the supported example's section order.
Use each operation field once; put multiple guarantees in its indented text block.
Every coverage row needs `enforced_by`, including proposed mechanisms; retain unresolved `open_by`.

```text
spec Example
status proposed
basis Supplied brief
location src/example
requirements
    R1 Complete the agreed operation
        source Supplied brief.
        must The user must be able to complete the agreed operation.
open
    Q1 Implement and verify the operation.
invariants
    I1 Success is reported only after the agreed operation completes. [@R1]
coverage
    @R1
        enforced_by [@I1]
        open_by [@Q1]
tests
    T1 Planned behavior check for the agreed operation.
```

Use `spec-trace` from `@spec.Example` to an existing Plan or Task reference.
To trace this module Spec to two existing Tasks, run:

```sh
workflow link @spec.Example @task.Example.T1 --type spec-trace
workflow link @spec.Example @task.Example.T2 --type spec-trace
```

Top-level and owner invariants are both legal in one Spec; Invariant IDs are unique across both
placements.
Use local references such as `@R1` inside a Spec. Use qualified references across files.
Keep pending coverage `open_by` while status is `proposed`.
A test declaration does not establish that the test ran or passed.
