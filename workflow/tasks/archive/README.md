# Archived Workflow Records

Archived records are historical provenance. They establish no current requirement, decision or
task status; [FlowState.plan](../../plans/flow/FlowState.plan) owns the current design and build
order.

- [Archived flat Plans](../../plans/archive/) keep their original IDs and are marked `archived`.
  Their IDs remain discoverable for existing Spec references.
- [Archived capability Plans](../../plans/archive/rewrite/): the thirteen capability Plans,
  ProjectDelivery, the Dispatch Desk consumer reference and the explorations FlowState.plan
  superseded (`minimal-library.md`, `context-reactions.ts`, `reference-review.md`). Each Plan is
  marked `archived`; FlowState.plan outcome O15 records what each one contributed.
- [Archived first Rewrite Epic](Rewrite/epic.task.archived): the oldest Rewrite Epic and its 181
  Task records.
- [Archived capability Rewrite Epic](Rewrite-capability/epic.task.archived): the draft Epic and
  six phases that ordered the capability Plans. No Task in it was started.
- [Archived ReferenceDocs Epic](ReferenceDocs/epic.task.archived): the consumer-reference tasks for
  the archived Dispatch Desk reference.

Archived Task files use `.task.archived`, outside the native Task grammar and CLI discovery.
