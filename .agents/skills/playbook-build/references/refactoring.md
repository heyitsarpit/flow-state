# Refactoring

Change structure while preserving behavior. Keep unrelated feature requests and bugs in a separate
scope.

1. **Pin current behavior.** Use `explain-how` for missing caller or behavior facts; reuse valid
   findings. Pin outputs, failures, ordering, and side effects with an existing public-boundary
   check, a capture, or an equivalence harness. Compilation alone is not a behavioral pin.
2. **Name the burden and the target shape.** Apply `policy-code-composition` to boundaries and
   interface depth. Delete redundant paths before adding abstractions. A new layer must remove a
   real burden.
3. **Surface contract implications.** Return consequential contract changes to the user or
   `to-spec`. Draft or reuse Tasks first, refine them against settled contracts, and require
   readiness before code changes. For large migrations, plan the stages before starting.
4. **Move in bounded steps.** Keep the behavior pin green. For renamed APIs, inventory callers,
   strings, docs, and back-references. Migrate all in-scope consumers before removing an internal
   API. Preserve external compatibility commitments. Declare permitted intermediate failures and
   require final checks at the boundary.
5. **Check equivalence.** Compare baseline and final behavior with `check-task`. Return unjustified
   complexity to the author for removal and recheck. Recheck the assembled final snapshot against
   the behavior pin; keep failures and unrun scope in the Task.

Return the structural change, the pinned contract, equivalence evidence, the burden removed, and
remaining work.
