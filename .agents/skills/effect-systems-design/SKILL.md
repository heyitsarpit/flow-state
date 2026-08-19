---
name: effect-systems-design
description: Design and review purposeful Effect use and ergonomic Effect-native APIs in TypeScript through procedural IF/THEN decisions and import-first recipes covering values, errors, services, Layers, concurrency, resources, host integration, and deterministic tests. Use when deciding what should remain plain TypeScript, designing Effect-returning public functions, improving consumer call sites, selecting and composing Effect concepts, replacing ad hoc async or lifecycle machinery, or auditing an Effect codebase. Pair with effect-ts for exact version-specific APIs.
---

# Purposeful Effect design

Use Effect when the program needs typed failure, dependencies, asynchrony, cancellation,
concurrency, time, resource lifetime, or observability. Keep deterministic values and algorithms in
plain TypeScript.

For every design choice, ask first: **How does using Effect make life easier for the consumer?**
Count a choice as an ergonomic improvement only when the caller no longer has to parse, validate,
branch, wire dependencies, coordinate concurrency, retry, unsubscribe, clean up, or translate a
host boundary. A primitive that only simplifies the implementation belongs behind the API.

Use `$effect-ts` to verify every exact symbol against the consuming project's installed Effect
version. Let this skill choose the design; let `$effect-ts` confirm the API.

## Use one decision grammar

Answer each relevant design question in this form:

- **IF:** State the condition that makes the choice apply.
- **THEN:** Name the smallest design and the Effect concepts to compose.
- **BECAUSE:** State the semantic law the choice preserves.
- **CHECK:** Name the edge case, lifetime, or test that could disprove it.
- **CODE:** Add a short, version-checked example only when the composition is not obvious.

Do not dump every possible primitive. Follow the decisions from the user's concrete operation to
the system boundary, and stop when the design is complete.

## Procedure

1. **IF the operation is local, classify it first.** Write its input, success value, expected
   failures, dependencies, and whether it is pure, async, cancellable, timed, or resource-owning.
2. **IF Effect semantics are absent, keep it plain.** Do not wrap deterministic construction,
   branching, validation, encoding, or loops merely because a caller uses Effect.
3. **IF Effect semantics are present, keep `A`, `E`, and `R` honest.** Preserve success, expected
   failure, and required capabilities until an explicit boundary handles or provides them.
4. **IF work has a lifetime, name one owner.** Give every resource, fiber, queue, subscription,
   cache, runtime, and listener one reachable release path.
5. **IF work is concurrent, state policy before APIs.** Define bounds, ordering, backpressure,
   acknowledgment, sibling failure, cancellation, retry, and shutdown.
6. **IF a foreign host executes the program, adapt once at that edge.** Keep Promise, callback,
   response, process-exit, and framework conversion out of domain and service code.
7. **IF the code is reusable, design its call site before its implementation.** Write down what
   Effect removes from the caller, accept familiar domain inputs, preserve inferred `A`, `E`, and
   `R`, and make recovery, provision, timeout, retry, and tracing compose around the result.
8. **IF the answer depends on a particular API, inspect source.** Use [SOURCES.md](./references/SOURCES.md)
   and `$effect-ts`, then add deterministic proof for the claimed failure, race, time, or cleanup
   behavior.

## Route by question

- Read [FUNDAMENTALS.md](./references/FUNDAMENTALS.md) for nullability, values, transformations,
  loops, functions, errors, foreign APIs, and arguments versus services.
- Read [SYSTEMS.md](./references/SYSTEMS.md) for services, Layers, deep injection, state,
  concurrency, resources, streams, schedules, transactions, and host runtimes.
- Read [REVIEW_AND_TESTING.md](./references/REVIEW_AND_TESTING.md) for codebase audits and
  deterministic proof.
- Read [RECIPES.md](./references/RECIPES.md) when implementation needs import-first examples from
  value transformation through services, concurrency, resources, time, streams, and tests.
- Read [CONSUMER_ERGONOMICS.md](./references/CONSUMER_ERGONOMICS.md) when designing a public
  Effect-returning function, service method, options object, decoder, or host adapter from its
  caller's point of view.
- Read [SOURCES.md](./references/SOURCES.md) when an exact v4 signature or a production composition
  example would improve the answer.

## Invariants

- **IF a value is ordinary operation data, pass it as an argument.** Use a service for a
  substitutable capability or contextual dependency, and use a Layer to construct, compose, and
  release services.
- **IF behavior enters from a throwing, Promise, callback, platform, or wire API, normalize it once
  at the owning adapter.** Decode unknown input, translate expected failure, and preserve foreign
  cancellation when supported.
- **IF failure is expected, keep it in `E`.** Treat defects as violated assumptions and
  interruption as cancellation; use `Exit` or `Cause` only when the boundary needs the complete
  outcome.
- **IF work is forked, attach it to a parent, Scope, keyed supervisor, or named external owner.** A
  fork proves scheduling, so use a handshake when another operation depends on startup.
- **IF a primitive merely resembles custom machinery, compare laws before replacing it.** Match
  identity, ordering, capacity, freshness, backpressure, cancellation, persistence, and shutdown.

For a local question, return only the relevant IF/THEN chain, code, and checks. For a system design,
also state what stays plain, residual `R`, Layer ownership, failure policy, concurrency policy, host
adapters, and deterministic tests.
