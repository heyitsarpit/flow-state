---
name: beads
description: Inspect retained Beads records as historical migration provenance. Use only when a
  Workflow Plan or Task cites a Bead ID or receipt; never use Beads for current work tracking.
---

# Beads Historical Records

In this repository, Workflow Plans and Tasks own current requirements, readiness,
dependencies, status, and evidence. Use the [Workflow CLI skill](../workflow-cli/SKILL.md)
for current work.

The Beads database and exports remain read-only historical provenance. Their statuses
and dependency edges describe old snapshots; they do not establish current readiness or
acceptance. Preserve historical receipts without updating or regenerating Beads records.

## Inspect a cited record

1. Read the current Workflow Plan or Task that cites the Bead ID.
2. Inspect only the referenced historical record or receipt:

   ```bash
   bd show <id> --json
   ```

3. Report the receipt with its recorded snapshot or date. Do not treat it as evidence
   for the current checkout unless the snapshots match.

## Boundaries

- Do not use Beads to select, claim, assign, block, close, or remember current work.
- Do not run Beads commands that mutate records or exports, including `bd update`,
  `bd create`, `bd dep`, `bd close`, `bd remember`, or `bd export`.
- Do not edit `.beads/issues.jsonl` or other historical Beads files.
- Keep Bead IDs for traceability; link findings and current status to the owning Workflow
  Plan or Task.
