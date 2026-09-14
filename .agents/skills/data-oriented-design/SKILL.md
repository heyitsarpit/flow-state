---
name: data-oriented-design
description: Design programs data-first with Schema-owned validation and clear transformation phases. Use when modeling application data or simplifying scattered validation and procedural code.
---

# Data-oriented design

Use this skill to make data, ownership, and phase boundaries explicit. It is a
clean programming model, not a memory-layout mandate.

## Core model

- Treat configuration, state, intermediate results, facts, plans, and outcomes as
  application data.
- Let `Schema` own unknown-data admission and invariants that need validation; this
  applies to application data beyond user input. Preserve invariants as internal
  data changes.
- Let plain functions transform admitted data and make deterministic decisions.
- Let `Effect` coordinate execution: I/O, failures, concurrency, and lifetimes.
- Choose representations for their consumers. These are options, not required
  layers for every function.

## Route by concept

- Choosing `Schema`, `Result`, `Option`, `Data`, or a state owner: read
  [references/representations.md](references/representations.md).
- Designing admission, custom validation, absence, defaults, or context-dependent
  schemas: read [references/admission.md](references/admission.md).
- Splitting transformations, preparation, execution, facts, plans, or ownership:
  read [references/phases-and-ownership.md](references/phases-and-ownership.md).
- Choosing optional configuration patterns or schema-derived dispatch, comparison,
  and test data: read [references/proofs.md](references/proofs.md).

Read only the reference that matches the current question. Keep domain algorithms
with their owner; do not replace reflection, identity, ordering, or failure
semantics with duplicate generic validation.

## Boundary rules

- Decode unknown or authored data once. Pass the admitted value to later phases.
- Keep validation and error projection with the owner of that boundary.
- Preserve exact identity, diagnostic paths, deliberate error precedence, phase
  order, and mutation isolation when they are part of the domain contract.
- Keep mutable state and lifetimes in `Ref`, `MutableRef`, `Scope`, or an owning
  service. `Data` describes values; it does not manage transitions or lifetimes.
- Follow the repository's unconditional `anti-slop/no-readonly` policy: do not use
  `readonly`, `Readonly`, `ReadonlyMap`, `ReadonlySet`, `ReadonlyArray`, or custom
  `Readonly*` types. Use `Data` for immutable values and keep mutation behind its
  owner.
- Use optional patterns only when their invariant simplifies real consumers. Do not
  maintain duplicate definitions without an explicit conversion owner.

## Focused proof

- Admission changes: prove valid decoding, invalid values, diagnostic paths, and
  first-error or accumulation behavior when relevant.
- Transformation changes: prove phase order, successful results, failure short
  circuiting, and mutation isolation when relevant.
- Derived operations: prove the laws they claim, plus targeted invalid, identity,
  aliasing, or hostile-reflection cases where those semantics matter.
- Run checks proportional to the changed boundary. Generated valid data supplements
  targeted cases; it does not replace them.
