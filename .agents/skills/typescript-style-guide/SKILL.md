---
name: typescript-style-guide
description: Review or write Flow State TypeScript when ownership, Effect boundaries, schemas, public APIs, or behavior proofs matter. Do not use for generic TypeScript style or exact API lookup.
---

# Flow State TypeScript

Use this skill for a Flow State module, adapter, service, public entrypoint,
schema, or behavior proof.

Skip it for:

- Generic TypeScript formatting.
- Exact Effect v4 export or signature lookup. Use `$effect-api-documentation`.
- A frozen package or work outside Flow State TypeScript.

## Core shape

Prefer this flow:

```text
host input -> decode once -> domain value -> port/service -> live implementation -> host runtime
```

Keep these boundaries clear:

- One primary owner per module.
- Dependencies point inward: domain, ports, live code, then host adapters.
- Unknown data is decoded at its real boundary.
- Success, absence, expected failure, defects, interruption, and cleanup failure stay distinct.
- `Effect<A, E, R>` keeps its success, failure, and service requirements.
- Each resource and concurrent task has an owner, lifetime, and cleanup path.
- Public entrypoints expose a small, deliberate surface.
- Semantic changes get behavior proofs at the smallest real seam.

## Apply the guide

- Before editing, identify the module owner, required dependencies, pure versus
  effectful work, observable outcomes, lifetime/cleanup, and public versus
  internal boundaries.
- Read the changed module first.
- Follow callers, tests, contracts, or package boundaries only when they affect the decision.
- Choose the reference that matches the change.
- Verify in proportion to the changed behavior or type surface.
- Report what ran and what remains unverified.

Read only the detail needed for the current change:

- [Ownership and APIs](references/ownership-and-apis.md) for module boundaries, helpers, services, types, mutation, and public exports.
- [Effect and runtime](references/effect-and-runtime.md) for Effects, Layers, Promises, errors, retries, resources, and runtime edges.
- [Schemas and failures](references/schemas-and-failures.md) for validation, outcomes, `Diagnostic`, `Result`, and narrowing.
- [Behavior proofs](references/behavior-proofs.md) for tests, fakes, failure paths, cleanup, ordering, and concurrency.

## Local guardrails

- Keep project, contract, proof, and owner metadata out of production names and comments.
- Anti-slop rules own deterministic syntax, type shape, and configured imports.
  Formatters own layout. This skill owns composition, API shape, service cohesion,
  Effect boundaries, lifetime, failure meaning, copying, decomposition, fixture
  design, comments, spacing, and proof quality.
- Do not erase useful types or failure channels to satisfy a mechanical check.
  Apply mechanical replacements without erasing evidence.
- Keep comments for ownership, invariants, compatibility, failure, lifetime, or safety.
- Treat an intentional exception as local. State its owner and invariant beside the code.
