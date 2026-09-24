---
name: pre-code-planning
description: "Route pre-implementation design between abstraction guidance and a coding spec derived from an existing Spec IR."
---

# Pre-code planning

Use this skill when non-trivial behavior needs an explicit abstraction design, a coding spec, or both. Choose only the reference needed for the current work.

## Route the work

- **Design how an abstraction should enforce behavior in Effect v4:** read [effect-abstraction.md](references/effect-abstraction.md). It contains the existing guidance on domain values, state, operations, algorithms, Effect services and layers, boundaries, guarantees, and verification.
- **Write a per-slice design spec for implementation:** read [spec-ir-to-design-spec.md](references/spec-ir-to-design-spec.md). It translates an existing Spec IR into language-neutral pseudocode and a coder-ready contract. Read [example.md](references/example.md) when a complete worked example will help.
- **Both are needed:** read the spec guide to determine slice boundaries and required guarantees, then read the abstraction guide to select Effect v4 forms for the design. Keep the Spec IR authoritative; send gaps back as `spec-feedback` rather than changing its meaning silently.

The spec-writing workflow starts from an existing Spec IR. It does not extract raw stakeholder prose into a Spec IR and does not write production code. The abstraction reference is Effect v4-specific; the design spec itself stays framework-neutral until realization.

Skip this skill for trivial changes or when the design and coding contract are already settled.
