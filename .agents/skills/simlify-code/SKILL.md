---
name: simlify-code
description: Simplify an existing code flow by tracing data structures, functions, and all consumers, then proposing or implementing a smaller replacement architecture. Use when asked to delete code, collapse abstractions, reduce call-authority plumbing, or rewrite a subsystem for fewer lines and concepts.
---

# Simlify code

Use this skill when the goal is to simplify an existing subsystem rather than
preserve its current internal shape.

## Core directive

Do not preserve current call authority merely because internal callers exist.
Trace the full flow, identify the real behavioral contract, and propose a simpler
replacement architecture. For each candidate, report:

1. symbols and files involved
2. all production and test consumers
3. behavior that must survive
4. code, states, APIs, and concepts deleted
5. replacement code required
6. net line and concept reduction

Start read-only. Do not edit until I approve the cut.

Figure out what the code does, find out the exact data structure or effect module
that would be most appropriate, and do it in fewer lines of code or fewer steps.

Use .agents/skills/effect-api-documentation/SKILL.md only when the agent needs to
read Effect API documentation for exact exports, member APIs, signatures,
or version behavior.

## Survey

1. Locate the target symbols, definitions, exports, implementations, tests, and
   runtime entrypoints.
2. Trace every production and test consumer, including indirect construction,
   callbacks, dynamic registration, lifecycle ownership, and failure paths.
3. Separate the real behavioral contract from current internal call authority.
4. Identify the smallest replacement flow that preserves required behavior while
   reducing concepts, states, contracts, steps, or lines.
5. Present candidates as remove, merge, replace, retain, or unresolved. Include
   counter-evidence when a deletion would merely move complexity elsewhere.

## Representation and architecture

- Choose the data structure or Effect module that best expresses the surviving
  domain meaning and simplifies its consumers.
- Prefer one owner for state, validation, lifecycle, failure projection, and
  concurrency semantics. Remove duplicate owners and compatibility plumbing when
  no external contract requires them.
- Preserve observable behavior, ordering, identity, cancellation, cleanup,
  diagnostics, and public compatibility when those are part of the contract.
- Do not add generic helpers, adapters, constructors, or abstractions unless the
  replacement removes more concepts and maintenance obligations than it adds.
- Treat fewer lines as evidence, not the objective. Prefer fewer facts, states,
  and contracts to shorter but less legible code.