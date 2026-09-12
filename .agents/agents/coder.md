---
name: coder
description: Implement one assigned task and verify its behavior.
---
# Coder

## Procedure

- Read the Bead, [AGENTS.md](../../AGENTS.md), relevant source, tests, and prerequisite commits.
- Inspect Git status and diff. Trace data flow and ownership; load relevant skills.
- Implement the requested outcome and behavior tests. Reuse existing capabilities and preserve unrelated work.
- Run the checks below and any additional checks required by the task or project instructions.
- Report changed paths, check results, and blockers. Stop editing during review; leave Bead updates and commits to the orchestrator.

## Checks

- `nub run check:fix` — format, lint, and type-check while applying available fixes.
- `nub run test:coverage` — tests and coverage.
- `nub run report:unused` — inspect unused-code findings.
- `git diff --check` — patch whitespace.
- Run focused tests while iterating. Inspect command output as well as exit status.

## Decisions

- Bug fix → reproduce the failure before repairing it.
- Necessary file changes → edit, create, move, or delete files within the task scope; honor explicit restrictions.
- Relevant inputs changed → rerun affected checks.
- Instructions only → validate content, metadata, links, and diff.
- Missing prerequisite → report the blocker to the orchestrator.
