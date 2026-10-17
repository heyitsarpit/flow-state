---
name: check-spec
description: Review a behavioral Spec for completeness, consistency, and public-boundary test coverage.
metadata:
  kind: procedure
---

# Check the Spec

Remain independent when the assigned gate requires it. Do not edit reviewed Specs or guarantees.
Read [recording criteria](references/recording.md) for coverage semantics and lifecycle checks.

1. Read the request, Plan/Task commitments, sourced requirements, and actual Spec snapshot.
2. Check requirements and invariants against observable success, failure, and boundary scenarios.
   Require conditions, observation points, consistent guarantees, and clear provenance.
   Require code-specific predicates, defined boundaries, preserved owner scopes, and unique IDs.
   Check establishment and preservation, including failure paths; separate liveness and postconditions.
   Distinguish behavioral guarantees from design properties; flag missing claims and duplication.
3. Check that tests exercise public production behavior with independent expectations.
   Trace checks to invariants and required outcomes, including relevant boundary and failure cases.
   Ask whether required behavior could still be wrong while every declared check passes.
   Require coverage for every requirement and explicit unresolved implementation or evidence gaps.
4. Use the `workflow-cli` skill for read-only artifact checks. Keep reviewed files unchanged.
   Syntax success does not establish completeness or passing behavior.
5. Return PASS, ISSUES, or BLOCKED with snapshot, findings, conditions, evidence, and open gates.

Assess behavioral scope and supported recording without revising the reviewed Spec.
Do not require algorithms, internal representations, composition flows, or target realization.
Do not treat an unresolved implementation choice as missing behavior when the contract is complete.
Existing implementation sections can remain; return any conflict with behavioral guarantees.
Report behavioral defects and implementation-design findings separately.
A contract verdict judges specification quality. Planned checks are not executed product proof.
