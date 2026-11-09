---
name: check-spec
description: >-
  Independently review a Spec: try to show its behavioral contract is incomplete, check any
  included implementation design, and judge whether its tests would catch wrong behavior. Returns
  separate contract and design verdicts. Use after to-spec or to-design; when independent review
  is required, someone other than the Spec's author runs it.
metadata:
  kind: procedure
  applies:
    - policy-code-correctness
    - policy-code-composition
    - principle-design-for-verification
    - policy-testing
    - principle-claim-only-what-you-checked
---

# Check the Spec

Your job is to find what the Spec gets wrong or leaves out before anyone builds against it. Treat
it as a contract someone else wrote: assume it is incomplete until you have tried hard to break
it. You review; you do not edit the Spec or its guarantees. When independent review is required (the
usual case for consequential Specs), you are not the author, and you do not take hints from the
author about what to skip.

For coverage semantics and lifecycle checks, read [the recording criteria](references/recording.md).

## Steps

1. **Read the Spec and the commitments it must satisfy.** Read the request, the Plan and Task
   commitments it serves, the sourced requirements, and the Spec itself, at the exact revision you
   are checking.

2. **Try to show the contract is incomplete.** Derive the properties you would expect from the
   Requirements and how they interact, on your own, before comparing them with the Spec's
   Invariants. Then build violating states and sequences: inputs, orders of events, failures, and
   retries that would break a guarantee. A Spec can have a test linked to every Requirement and
   still miss a property, so report missing properties even then. For each relevant relationship and
   transition in your review scope, the Spec should state an obligation, an open question, or why it
   cannot arise; note relevant ones outside your scope as gaps rather than reviewing them.

   A good contract has guarantees that can each fail independently, with their sources, conditions,
   the points where they must hold, the owner or boundary they apply to, and unique IDs. These are
   the same criteria `to-spec` writes against. It keeps Invariants, postconditions, progress
   guarantees, and optional design properties apart.

3. **Check included design, and only included design.** If the Spec carries implementation
   design, review it with the code standards. Do not invent guarantees or demand optional design
   notes the author chose not to write.

   With `policy-code-correctness`, look for:
   - **Conservation and publication.** Totals that can go inconsistent, or changes that become
     visible half-done.
   - **Bounds and authority.** Overcommit that the responsible owner does not prevent: competing
     admissions, exhaustion, decisions made on stale state.
   - **Identity and lifecycle.** Illegal states, ID collisions, foreign identities, retries,
     interruption, cleanup, and stale work.
   - **Algorithm preservation.** Properties that are not established at the start or not kept
     through every transition, failure, and concurrent operation. Derive the predicates yourself.

   With `policy-code-composition`, look for:
   - **Established facts ("parse, don't validate").** Raw values leaking past the boundary that
     should have validated them, the same validation repeated inward, or a mutable fact trusted
     without a check. Checks of current state belong with that state's owner.
   - **Coherent concerns and protocols.** Boundaries without a real responsibility, unclear
     owners, values exchanged without agreed meaning, abstractions that do no work.
   - **Complete contracts and closure.** A composite whose callers must coordinate hidden duties:
     check its outcomes, failures, dependencies, caller control, and what it hides.

   Also check that every code fragment and algorithm agrees with the chosen target realization, as
   `to-design` defines it. Ask whether each design method that should have been applied was applied,
   including the methods they depend on, not only whether the applied ones were done well. Review
   only; do not start writing design or running experiments.

4. **Judge whether the tests would catch wrong behavior.** Trace each check to the invariants and
   outcomes it protects, including boundary and failure cases. Build violating sequences and ask
   whether a test would fail on them. Look for outcomes no test decides, tests that would pass on
   incorrect behavior, and guarantees that were promised earlier and have quietly disappeared.
   Traceability alone is not coverage. Every requirement needs coverage or an explicit, visible gap.
   Tests should exercise public boundaries: invalid input is rejected, and facts admitted at the
   boundary still hold in later operations, without tying tests to a private parser or
   representation.

5. **Read it as one document.** Use `workflow-cli` for read-only checks; leave the files unchanged.
   A Spec that parses can still be incomplete or wrong. Flag repeated claims, obligations bundled
   into one entry, inconsistent names, contradictions, and prose that could be shorter. Included
   algorithms read best as pseudocode; behavioral duties do not.

## Watch out for

- **Asking for design the contract does not need.** A Spec is complete without algorithms,
  internal representations, composition flows, or a target realization. An open implementation
  choice is not missing behavior when the contract is complete.
- **Treating existing design sections as wrong because they exist.** Their presence is fine;
  review them with step 3 like any included design, and also report where they conflict with the
  behavioral guarantees.
- **Mixing the two judgments.** Behavioral defects and design findings are separate reports.
- **Counting planned tests as evidence.** A contract verdict judges the specification. Planned
  checks are not proof the product works.

## What to return

Two verdicts, each PASS, ISSUES, or BLOCKED: one for the contract and one for the design (NOT
APPLICABLE when the Spec includes none). For each, give the revision you checked, the findings
with their violating states or sequences, the conditions, the evidence, and the gates still open.
