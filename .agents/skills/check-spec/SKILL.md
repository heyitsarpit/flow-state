---
name: check-spec
description: Review Spec behavioral contracts, included implementation design, and verification coverage.
metadata:
  kind: procedure
---

# Check the Spec

Remain independent when the assigned gate requires it. Do not edit reviewed Specs or guarantees.
Read [recording criteria](references/recording.md) for coverage semantics and lifecycle checks.

1. Read the request, Plan/Task commitments, sourced requirements, and actual Spec snapshot.
2. Try to demonstrate incompleteness: independently derive properties from Requirements and their
   interactions, then review them and any included design using the criteria. Construct violating
   states and sequences; report missing properties even when all Requirements have linked Tests.
   Account for relevant relationships and transitions with obligations, unresolved questions,
   or reasons they cannot arise. Apply design checks only to included design; do not invent
   guarantees or require optional notes.

   Use the `to-spec` skill for behavioral contract criteria:

   Require independently falsifiable guarantees, sources, conditions, validity points, preserved
   scopes, and unique IDs. Separate Invariants, postconditions, progress, and optional design properties.

   For included design, use the `code-correctness` skill:

   - **Conservation and publication**: Preserve relationships and expose complete changes; challenge
     inconsistent totals and partial publication.
   - **Bounds and authority**: Let the responsible owner prevent overcommit; challenge competing
     admission, exhaustion, and stale current-state decisions.
   - **Identity and lifecycle**: Preserve authority across time and domains; check legal states,
     collisions, foreign identities, retries, interruption, cleanup, and stale work.
   - **Algorithm preservation**: Establish properties initially and preserve them through
     transitions; independently derive predicates and challenge mutation, failure, and concurrency.

   Use the `code-composition` skill for included boundaries and protocols:

   - **Established facts (“parse, don't validate”)**: Establish validity at admission and carry it
     inward; challenge raw-value leakage, redundant validation, and unchecked mutable facts. Keep
     current-state enforcement with its owner.
   - **Coherent concerns and protocols**: Give boundaries meaningful responsibilities and shared
     vocabulary; check owners, exchanged values, established facts, and unnecessary abstractions.
   - **Complete contracts and closure**: Make the composite usable without hidden coordination
     duties; check outcomes, failures, dependencies, caller control, and information hiding.

   Use the `to-design` skill to check realization consistency across all included code and algorithms.
   Assess its method triggers independently, including applicable dependencies; challenge omissions
   as well as application. Apply review criteria without starting authoring or experiment phases.
   It owns realization guidance and method selection.

3. Use the `design-for-verification` and `testing-policy` skills to assess observations, diagnostics,
   public production boundaries, and independently derived expectations.
   Trace checks to invariants and required outcomes, including relevant boundary and failure cases.
   Independently construct violating sequences; find undecided outcomes, tests that permit incorrect
   behavior, and previously promised guarantees that disappeared. Traceability alone is insufficient.
   Require coverage for every requirement and explicit unresolved implementation or evidence gaps.
   Check public-boundary scenarios for invalid-input rejection and preservation of admitted facts
   through later operations, without coupling tests to a private parser or representation.
4. Use the `workflow-cli` skill for read-only artifact checks. Keep reviewed files unchanged.
   Syntax success does not establish completeness or passing behavior.
   Read the Spec as one document: flag repeated claims, bundled obligations, inconsistent names,
   conflicts, and excessive prose. Prefer pseudocode for included algorithms, not behavioral duties.

Return separate contract and design verdicts: PASS, ISSUES, or BLOCKED, with snapshot, findings,
conditions, evidence, and open gates. Mark design NOT APPLICABLE when none is included.

Assess behavioral scope and supported recording without revising the reviewed Spec.
Do not require algorithms, internal representations, composition flows, or target realization.
Do not treat an unresolved implementation choice as missing behavior when the contract is complete.
Existing implementation sections can remain; return any conflict with behavioral guarantees.
Report behavioral defects and implementation-design findings separately.
A contract verdict judges specification quality. Planned checks are not executed product proof.
