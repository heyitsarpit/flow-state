# Module design

Establish behavior, then choose and record its implementation in the same owning Spec.
Use when designing a module: Requirements and implementation planning are both requested.
Reuse settled contracts or adequate design; do not require both to be rewritten.
Use the `coordination-policy` skill when assigning workers and independent checks.

1. **Ground and specify.** Use the `change-impact` skill to establish current callers, contracts,
   reusable code, affected owners, and compatibility constraints. Reuse current findings.
   Use the `to-spec` skill to record Requirements, Invariants, and test
   obligations from agreed intent. Keep unresolved choices explicit. Establish enough behavior to
   guide design; do not invent implementation choices to complete the contract.
2. **Develop and record implementation.** Use the `to-design` skill against that Spec snapshot.
   Record consequential representations, algorithms, enforcement, and composition in supported
   sections of the same Spec, including important internal representation and algorithm Invariants.
   Define where each holds: public boundary, internal state transition, or loop head.
   Both methods own Invariant creation within their scope; preserve unique IDs and clear provenance.
   Keep one active writer per file.
3. **Reconcile discoveries.** Return ambiguous, impossible, or changed guarantees to `to-spec`.
   Preserve agreed intent and approval gates. Revisit affected design after contract changes;
   repeat until behavior and implementation agree or an unresolved decision blocks the work.
4. **Check the combined snapshot.** Use the `check-spec` skill for behavioral completeness and
   coverage. Review the implementation design through the `to-design` skill on the same snapshot.
   Keep reviewers independent of authors when the agreed gate requires it.
   Check that mechanisms enforce the Invariants and honor boundary contracts, failures, and
   lifetimes. Check realization consistency across all code and algorithm sections.
   Read the Spec as one document: remove repeated claims, split bundled obligations, reconcile names
   and conflicts, and replace procedural prose with code or pseudocode.
   Return findings to the owning method and recheck affected sections after repair.
5. **Return the recorded result.** Format changed Specs, run `workflow check`, and inspect the
   diff. Return paths, snapshot, behavioral and design verdicts, checks, and unresolved obligations.
   Refine affected Tasks when assigned. Stop before implementation unless execution is authorized.

Return preparation results to the user unless an explicit combined grant covers the next phase.
A valid Spec or passing design review does not establish passing product evidence.
