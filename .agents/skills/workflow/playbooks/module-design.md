# Module design

Establish a correctness contract; explore implementation to test feasibility and expose decisions.
Use when designing a module: Requirements and implementation planning are both requested.
Reuse settled contracts or adequate design; do not require both to be rewritten.
Use the `coordination-policy` skill when assigning workers and independent checks.
Prioritize exhaustive Invariant discovery to eliminate entire families of bugs; independent review
must actively try to demonstrate incompleteness.

1. **Ground and specify.** Use the `change-impact` skill to establish current callers, contracts,
   reusable code, affected owners, and compatibility constraints. Reuse current findings.
   Use the `to-spec` skill to record Requirements, Invariants, and test
   obligations from agreed intent. Keep unresolved choices explicit. Establish enough behavior to
   guide design; do not invent implementation choices to complete the contract.
2. **Develop and record implementation.** Use the `to-design` skill against that Spec snapshot.
   Explore representations, algorithms, and enforcement to challenge the contract.
   Record consequential design notes only when useful; distinguish proposals from binding obligations.
   A complete Spec does not require implementation code or internal representations.
   Define where each holds: public boundary, internal state transition, or loop head.
   Both methods own Invariant creation within their scope; preserve unique IDs and clear provenance.
   Keep one active writer per file.
3. **Reconcile discoveries.** Return ambiguous, impossible, or changed guarantees to `to-spec`.
   Preserve agreed intent and approval gates. Revisit affected design after contract changes;
   repeat until behavior and implementation agree or an unresolved decision blocks the work.
4. **Check the combined snapshot.** Use the `check-spec` skill for the behavioral contract,
   included design, and verification coverage. Keep required reviewers independent of authors.
   Return findings to the owning method and recheck affected sections after repair.
5. **Return the recorded result.** Format changed Specs, run `workflow check`, and inspect the
   diff. Return paths, snapshot, behavioral and design verdicts, checks, and unresolved obligations.
   Refine affected Tasks when assigned. Stop before implementation unless execution is authorized.

Return preparation results to the user unless an explicit combined grant covers the next phase.
A valid Spec or passing design review does not establish passing product evidence.
