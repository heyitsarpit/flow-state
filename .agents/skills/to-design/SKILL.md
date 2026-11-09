---
name: to-design
description: >-
  Choose or review how to implement a module against its behavioral contract: the
  representation, who owns which state, the algorithm, and how the parts compose. Use for
  consequential algorithms, state ownership, module boundaries, or implementation choices.
  to-design owns implementation invariants; to-spec owns the behavioral guarantees and tests.
metadata:
  kind: procedure
  applies:
    - policy-code-correctness
    - policy-code-composition
    - principle-design-for-performance
    - principle-design-for-verification
    - policy-writing
---

# To Design

This skill works out how a module will actually meet its contract: what the data looks like, who
owns each piece of state, which algorithm keeps the guarantees true, and how the parts fit
together. Exploring the design also tests the contract. If no workable shape exists, report the
feasibility problem and name the commitment that needs revisiting: a missing decision, a
contradictory requirement, or an impossible budget. Finding that early is much cheaper than
finding it in code.

Implementation design is optional. A behavioral Spec is complete without it, and it never needs a
separate design file; notes go in the Spec when they help.

## Before you start

Read the request, the relevant Plan, Spec, and Task, the current code, and any findings you were
given. Name the implementation decision you are resolving, and reuse existing design when it is
good enough. Use `change-impact` when boundaries or pivotal facts are unclear.

Focus your effort on architecturally significant decisions: choices about structure,
dependencies, interfaces, or enforcement where the alternatives really change outcomes, failure
behavior, ordering, ownership, compatibility, or resource guarantees. That label sets priorities;
it never excuses skipping a behavioral obligation.

If exploring reveals a missing or changed behavioral guarantee, say so, and record it through
`to-spec` when that is in your scope.

## Steps

1. **Read the realization guide for your target.** Before writing concrete design, read
   [TypeScript](references/realization/typescript.md), [Effect](references/realization/effect.md),
   or [Rust](references/realization/rust.md), and apply it throughout the design, not only in a
   `realization` section. Check concrete APIs against the installed versions, and label
   conceptual pseudocode as such.

2. **Apply the standards that fit the decision.** Apply `policy-code-correctness` to
   representations, algorithms, state ownership, and resource lifetimes, and
   `policy-code-composition` to boundaries, protocols, and dependency contracts. Apply
   `principle-design-for-performance` when the workload, resource budgets, or resource guarantees
   shape the choice; for a full cost model, recommend running `performance` in modeled mode. When a
   significant decision needs stronger methods or evidence than you have, say so and suggest
   `reimagine-depth` to the user.

3. **Derive the implementation invariants for each candidate.** Identify the state, identities,
   ownership, relationships, and resource accounting. Derive the independent predicates that make
   the behavioral contract hold, including interactions across owners and operations, and name
   where each must hold. Show each is true from initialization and stays true through mutation,
   failure, interruption, retry, and competing operations, where those can occur. Keep unresolved
   cases explicit.

4. **Settle on one shape.** Combine your findings into one design. When their assumptions conflict,
   revisit the affected parts. For an unsettled significant decision, compare the viable shapes side
   by side. For empirical uncertainty, propose a `prototype`, and build it only if the user chooses
   it; until then, return the candidate shapes with the open question instead of picking one.

5. **Record what helps, in the Spec.** Read the owning Spec first, and use `workflow-cli` for the
   file mechanics. One module Spec can hold several owners when they implement one coherent
   contract. Keep optional proposals visibly separate from binding obligations; a chosen mechanism
   becomes binding only when the user agrees. Add a section only when it records a design decision
   the code cannot explain clearly:

   - `model`: concrete types and states; owner sections hold state authority and scoped Invariants.
   - `operations`: signatures, preconditions, postconditions, and failures.
   - `algorithm`: pseudocode, with branches, loops, updates, failure, and interruption.
   - `rules`: shared ordering and lifetime constraints, cited rather than repeated.
   - `composition`: boundaries, exchanged values, and dependency contracts.
   - `realization`: remaining target-specific mappings, not repeating the other sections.


   State each guarantee once and cite its ID. Explain the reason when the alternatives would change
   enforcement, coordination, compatibility, or resource costs; leave other details to the code.
   Write implementation notes as precise predicates over the chosen representation, with their
   scope. Include the important internal properties, not only the public ones, but keep normative
   Invariants about contract state: private design properties stay in design prose unless the
   representation is an agreed constraint. Show how the design enforces each behavioral guarantee,
   and keep design choices distinct from Requirements. Preserve stable IDs and unrelated content.
   For examples, see [Spec syntax](references/example.md) and
   [Invariants](references/invariant-examples.md). Use `principle-design-for-verification` to
   define how material design claims will be checked.

6. **Challenge the design.** Check on your own which standards should have applied, including the
   methods they depend on, and report any that were skipped. Check the combined shape against the
   contract and every applicable standard. Derive the required properties yourself and attack them
   with violating states and execution sequences; report missing properties and preservation gaps
   even when the recorded predicates hold, because a design can satisfy its own notes and still fail
   the contract. Check every code fragment and algorithm against the chosen realization and reject
   contradictory representations or lifecycle rules. When independent checking is required, someone
   other than the author does it. When authoring, fix what you find and repeat the affected checks;
   when reviewing, return the findings without editing.

7. **Save and validate.** Format each changed Spec, run `workflow check`, and read the diff.

## Example

```text
owner Queue
    state items, capacity, used, limit
    invariants
        I3 At dequeue, returned bytes equal the admitted bytes despite caller mutation. [@R6]
algorithm
    enqueue(item)
        charge = item.payload.byteLength
        if items.length == capacity: return Err(Full)
        if charge > limit - used: return Err(ByteLimit)
        entry = copyEntry(item, charge)  // allocation failure occurs before mutation
        items.append(entry); used += charge
```

## Watch out for

- **Changing the contract quietly.** Report behavioral changes and objective conflicts; never
  slip them in as design.
- **Treating judgment as evidence.** A convincing design is not a passing implementation.
- **Review that becomes rewriting.** In a review, apply the criteria within the assigned scope,
  return findings, and do not edit the Spec or start other phases.

## What to return

Open with a short plain-language walkthrough of one realistic example, saying which names are
reserved by the system and which the author chooses, and keeping new terms to the few the design
needs. Then the Spec paths and revision, the chosen shape and why, tradeoffs, checks, and
unresolved risks. For a review, return findings and a PASS, ISSUES, or BLOCKED verdict tied to the
revision you checked. Stop at the assigned boundary; this does not start implementation.
