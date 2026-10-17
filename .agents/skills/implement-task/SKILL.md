---
name: implement-task
description: Implement an assigned bounded Task slice and return the patch and self-check evidence.
metadata:
  kind: procedure
---

# Implement the assigned slice

Before editing, check Task blockers and actual Git/base/dirty state against the assignment.
Return unresolved blockers or conflicting live state; preserve unrelated work.

1. Implement bounded slices; check acceptance before expanding.
2. For behavior-preserving refactors, capture or reuse a behavior baseline. Check each move; type
   checks alone do not prove preserved behavior.
3. For internal API replacements, inventory callers, migrate them, and remove the old path within
   the migration boundary. Preserve external compatibility. Give temporary adapters a removal
   condition; include cleanup in acceptance. Declare permitted intermediate failures and require
   final static/runtime checks at the boundary.
4. For repairs, apply fix-root-causes (Use the `fix-root-causes` skill). Use diagnose
   (Use the `diagnose` skill) only for unresolved causes; reuse settled reproduction.
5. Write missing assigned repeatable public-boundary tests using testing-policy (Use the
   `testing-policy` skill). Run the assigned checks on the final snapshot. Return actual results and
   explicit blocked or unrun scope; a build alone does not prove behavior.

Run the lint and formatting procedure below; repair diagnostics within scope.

Return the patch/snapshot, actual commands and results, conditions, defects, and remaining blockers.

## Lint and formatting

Use the `workflow-configuration` skill for configured lint and formatter commands.


1. Run the formatter. Apply required formatting if it only checks; inspect the diff.
2. Run lint. Fix every error and warning within the assigned write scope.
3. Rerun formatting and lint after repairs. Return commands, output, and snapshot identity.

Pass requires successful formatting and zero lint errors and warnings. Inspect output, not only
exit status. Do not suppress diagnostics or weaken rules. Return out-of-scope failures to the
caller.
Checkers assess final receipts; rerun only read-only commands. Return mutating checks to the
implementer.
