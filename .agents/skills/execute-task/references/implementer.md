# Implement the assigned slice

Before editing, check Task blockers and actual Git/base/dirty state against the assignment.
Return unresolved blockers or conflicting live state; preserve unrelated work.

1. Implement bounded slices; check acceptance before expanding.
2. For behavior-preserving refactors, capture or reuse a behavior baseline. Check each move;
   type checks alone do not prove preserved behavior.
3. For internal API replacements, inventory callers, migrate them, and remove the old path within
   the migration boundary. Preserve external compatibility. Give temporary adapters a removal
   condition; include cleanup in acceptance. Declare permitted intermediate failures and require
   final static/runtime checks at the boundary.
4. For repairs, apply [fix-root-causes](../../fix-root-causes/SKILL.md). Use
   [diagnose](../../diagnose/SKILL.md) only for unresolved causes; reuse settled reproduction.
5. Write missing assigned repeatable public-boundary tests using
   [testing-policy](../../testing-policy/SKILL.md). Run the assigned checks on the final snapshot.
   Return actual results and explicit blocked or unrun scope; a build alone does not prove behavior.

Run [lint and formatting](../../setup-workflow/references/lint.md); repair diagnostics within scope.

Return the patch/snapshot, actual commands and results, conditions, defects, and remaining blockers.
