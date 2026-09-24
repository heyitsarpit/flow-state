---
name: pre-code-planning
description: "Route slice design and implementation review across composition, correctness ownership, and coder-spec guidance."
---

# Pre-code planning

Use this skill for non-trivial slice design or read-only review of an implementation against that design guidance. It routes among guides with distinct jobs:

- **Composition:** read [composition-design.md](references/composition-design.md) to discover concerns, data flow, protocols, composition sites, and encapsulation boundaries.
- **Correctness and Effect realization:** read [effect-abstraction.md](references/effect-abstraction.md) to model valid values and states, place invariant and authority owners, choose algorithms and Effect forms, and derive enforcement and verification.
- **Coder-ready spec:** read [spec-ir-to-design-spec.md](references/spec-ir-to-design-spec.md) to turn an existing Spec IR into a per-slice design contract. Read [example.md](references/example.md) when a worked example helps.
- **Implementation review:** read [review-checklist.md](references/review-checklist.md) to compare the live codebase with the requirements and design, trace mismatches to concrete owners and proofs, and report findings. Keep the review read-only.

## Planning flow

Composition and correctness are interleaved, not independent passes:

```text
Spec IR
→ cut a slice
→ trace its initial data flow and concerns
→ translate domain rules and place correctness owners
→ refine concern and protocol boundaries around those owners
→ choose algorithms, APIs, and Effect realization
→ attack the design and derive verification
```

Read the composition and correctness guides together for non-trivial designs. State ownership can change concern boundaries; a protocol that carries an established fact can remove repeated validation or authority from downstream concerns. Revisit the flow after placing owners.

The composition guide calls units of decomposition **concerns** and semantic positions **levels**. Do not call generic architectural levels “layers”: Effect `Layer` specifically provides dependencies.

The spec-writing guide starts from an existing Spec IR; it does not extract raw stakeholder prose into Spec IR or write production code. Keep Spec IR authoritative and record gaps as `spec-feedback`.

Skip this skill for trivial changes or when the design and coding contract are already settled.
