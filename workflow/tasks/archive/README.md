# Archived Workflow Records

The former flat rewrite Plans and older Rewrite Task graph are retained as historical
provenance.

- [Archived Plans](../../plans/archive/) keep their original IDs and are marked `archived`.
  Their IDs remain discoverable for existing Spec references.
- [Archived Rewrite Epic and Tasks](Rewrite/epic.task.archived) preserve the old Epic and all
  181 child Task records. The archived Epic file keeps its former `Rewrite` ID; it is a
  historical record, distinct from the [current draft Rewrite Epic](../Rewrite/epic.task).
  Archived Task references are historical and do not identify current Task records.
- [Current Rewrite Plans](../../plans/rewrite/) own the proposed capability semantics.

The archived Task files use `.task.archived` under `workflow/tasks/archive/`, outside the
current native Task grammar and CLI discovery. They do not activate or change the draft
current Rewrite Epic.
