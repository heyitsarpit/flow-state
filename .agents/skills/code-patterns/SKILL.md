---
name: code-patterns
description: Review Flow State TypeScript and Effect by concept for contract-aware ownership, lifecycle, admission, publication, concurrency, type safety, and proofs.
---

# Code patterns

Use this skill for contract-aware review of Flow State TypeScript and Effect.
These are review signals, not blanket syntax laws.

- Add a syntax rule only for a narrow, contract-backed unsafe operation.
- Keep names, generic relationships, and ownership judgments as review signals.

Route each review to the concept that owns the changed behavior:

- [Data and type boundaries](references/data-and-type-boundaries.md) — admitted data, type relationships, variants, and provider channels.
- [Ownership and state](references/ownership-and-state.md) — persistent state, snapshots, publication, and controller identity.
- [Effect and lifecycles](references/effect-and-lifecycles.md) — execution, cleanup, concurrency, and owned lifetimes.
- [Coordination and delivery](references/coordination-and-delivery.md) — owners, transitions, infrastructure privacy, and delivery retention.
- [Proofs and tests](references/proofs-and-tests.md) — real-owner behavior and lifecycle proofs.

Start with the owning concept; read another reference when the changed boundary crosses concepts.
