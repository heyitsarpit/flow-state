# Visual parity

Make the implementation match an agreed appearance. A missing baseline blocks the parity claim.

1. **Fix the baseline and conditions.** Read the agreed source appearance, components, and states.
   Fix viewport, fonts, theme, scale, seed data, animations, and capture conditions. Define masks
   and tolerance before migration. Pixel-exact parity means zero differences outside agreed masks.
   Assessment alone needs no new Task; changes need a ready owning Task first.
2. **Establish a capture and diff harness** on the baseline. Reuse the project's harness or build
   the smallest missing tool (`principle-make-work-rerunnable`). Never edit baselines, masks, or
   tolerance to make a patch pass.
3. **Migrate.** Shared primitives first. Give authors isolated write scopes with exact states and
   capture gates. Keep behavioral changes outside the visual migration. For assessment alone,
   capture the current target without repairing it.
4. **Compare.** Drive each state through `check-runtime`. Compare matched captures by image diff
   and inspect the deltas. A screenshot does not prove pixel equivalence.
5. **Check the assembled screens.** Intentional appearance changes need stated acceptance and a
   reviewed baseline update; unresolved conditions stay blocked. Route product failures to the
   author and capture defects to the harness owner. Recheck affected states on the assembled
   revision, keeping masks, tolerance, and the agreed baseline unchanged.
6. **Keep the evidence.** Store captures and diffs in the established evidence location, including
   failed and blocked states. Clean up only after evidence is retained.

Return the states and components covered, measured differences, baseline and capture conditions,
and remaining gaps.
