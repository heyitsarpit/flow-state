---
name: to-spec
description: >-
  Write and revise a module's behavioral contract in a workflow Spec: its Requirements, the
  Invariants that must always hold, and the tests that would catch a violation. Use to establish,
  revise, or supersede observable guarantees from agreed intent and findings. Implementation
  design is to-design's job.
metadata:
  kind: procedure
  applies:
    - policy-writing
    - principle-design-for-verification
    - policy-testing
    - policy-code-correctness
    - policy-code-composition
    - policy-records
---

# To Spec

A Spec is a module's contract: what it must do for its callers, what must always be true about it,
and how we would know if it broke. This skill writes that contract. It derives Invariants from the
Requirements, as many independent ones as the behavior needs, because each one you find rules out a
class of failures before any code exists.

It does not design the implementation. `to-design` may add implementation notes to the same Spec;
leave them in place, but never treat them as guarantees. For the mechanics of reading, creating,
and revising a Spec file, follow [the author guidance](references/spec-author.md).

## Before you start

Read the agreed intent, the existing Specs, the relevant Plans and drafted Tasks, and any findings
you were given. Reuse guarantees that already exist rather than restating them.

One module Spec can cover several owners; split Specs where the contracts are independent, not by
owner count. One Task can touch several modules, and one Spec can serve several Tasks. You do not
need correctness or composition design phases just to write a Spec.

Put a Spec next to its module or in the project's spec folder; both work, because the Spec's
`location` field and `workflow/spec.index` find it either way (the user's decision, wiki proposal
item 8). Records about the Specs as a whole, such as how they are split, their change log and
their check scripts, live in `workflow/specs/`.

## Steps

1. **Pin down the behavior.** Identify what callers can observe: inputs, outcomes, failures, side
   effects, and the conditions under which each happens. Keep intended behavior separate from what
   the current code happens to do. When a fact is missing, find it with `change-impact` within your
   scope; if it still cannot be settled, record it as an open question. Product choices you cannot
   settle go back to the user.

2. **Record the Requirements first.** Each Requirement states one sourced behavior callers rely on.

3. **Derive the Invariants, exhaustively.** For every Requirement and every interaction between
   Requirements, ask what must always be true for it to hold, and write that down as a precise
   statement over domain state, ownership, identities, and lifetimes, at named points where it must
   hold. Write a separate Invariant for each property that can fail independently. State timing,
   failure, concurrency, and resource guarantees as behavior when they matter. Only require a
   private representation when it is an agreed constraint.

4. **Then the tests.** Define tests at public boundaries that would fail if an Invariant or
   Requirement broke, with expectations derived independently of the implementation. Use
   `principle-design-for-verification` for what to observe and `policy-testing` for where tests
   sit.

5. **Record sources, open questions, and coverage in the Spec**, so a reader can trust the
   contract. When a Requirement or Invariant rests on a choice made while writing the Spec, write
   the choice in its text as `Decision (agent|user, <date>): <choice>.`, then `Why:`, `Reverse:`
   and, for an agent's choice, `User's read: pending` (later `done`); a user's choice quotes the
   user. `workflow status` lists the pending ones; nothing checks the shape. Link cited code as
   `code:PATH#TEXT`, so `workflow check` fails when the cited text no longer exists. Do not
   prescribe internal types, algorithms, module layouts, composition flows, or target
   realization; those are design questions for `to-design`. They block contract work only when
   the behavior itself cannot be settled without them.

6. **Check it and stop.** Re-read the Spec as written against the intent, scenarios, Invariants, and
   test obligations. Fix what you find if you are the author, or send it to the author if someone
   else owns the edits, then recheck the passages that changed. Keep unresolved obligations visible.

## Example

```text
requirements
    R1 Prerequisite ordering
        source Agreed caller requirement.
        must Start a step only after all earlier declared steps succeed.
invariants
    I1 For every started step i, every declared step j < i has succeeded. [@R1]
tests
    T1 Hold step A unconfirmed; step B never starts while A waits.
```

## Who checks

A small clarification that does not change what callers can rely on can be authored and checked by
one agent. A consequential change needs an independent check through `check-spec`, by someone other
than the author, however small the diff: a one-line change to a compatibility guarantee is
consequential. If you were assigned only the authoring, return the Spec and what needs checking, and
leave the check to whoever owns it.

## Approval

Routine clarification of a contract needs no approval. For a large behavioral change, recommend
whether the user should approve the Spec before implementation, considering compatibility,
guarantees other modules rely on, and new product commitments. Keep any approval gate the user has
already agreed.

## Watch out for

- **Describing the code instead of the contract.** What the code does today is evidence, not the
  requirement.
- **Bundled Invariants.** "X holds and Y is published" is two entries; they fail separately.
- **Too few Invariants.** One per Requirement is rarely enough; most bugs live in the interactions.
- **Counting planned tests.** A planned test or a valid document is not evidence the product works.

## What to return

The Spec paths and revision, provenance, your own check's verdict, the checks still required, and
the open questions. Recommend the next step and stop at the requested boundary; building it needs
separate authority.
