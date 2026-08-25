---
name: effect-systems-design
description: Design and review purposeful Effect use and ergonomic Effect-native APIs in TypeScript through use-case-first IF/THEN decisions covering values, failures, services, Layers, lifetimes, concurrency, host integration, and deterministic tests. Use effect-api-documentation for exact APIs, codebases/effect-v4 for usage, and the consuming package for version authority.
---

# Purposeful Effect design

Choose the semantic shape before looking up a primitive. Use Effect when the operation needs
typed failure, dependencies, asynchrony, cancellation, concurrency, time, resource lifetime, or
observability. Keep deterministic values, validation, encoding, and algorithms in plain
TypeScript.

Start from the consumer: use Effect only when it removes caller work such as parsing, recovery,
dependency wiring, coordination, cleanup, or host translation. Keep implementation machinery
behind the smallest useful API.

For exact exports, signatures, and member behavior, **Call the Skill tool with `effect-api-documentation`.** Then verify the consuming package's installed package, tests, and
lockfile. Use [`codebases/effect-v4/`](../../../codebases/effect-v4/) as the primary usage and
composition reference, after reading its `AGENTS.md`; it is not version authority.

## Decision grammar

Answer each relevant question with:

- **IF:** the condition.
- **THEN:** the smallest design and concepts to compose.
- **BECAUSE:** the semantic law preserved.
- **CHECK:** the edge case, lifetime, or deterministic proof that could disprove it.
- **CODE:** a short example only when the composition is non-obvious and API-verified.

Do not catalog primitives. Follow the concrete operation to its boundary and stop when the
design is complete.

## Use-case-first procedure

1. **IF the operation is local,** classify its inputs, success, expected failures, dependencies,
   purity, async behavior, cancellation, timing, and ownership.
2. **IF Effect semantics are absent,** keep it plain. **IF they are present,** keep `A`, `E`, and
   `R` honest until an explicit boundary handles or provides them.
3. **IF the code is reusable,** design its call site first. Accept ordinary domain data as
   arguments, preserve inferred success/error/requirements for `Effect` helpers, and preserve
   output/error/requirements for `Layer` helpers. Do not widen types to hide missing design.
4. **IF a Layer composes services,** decide which outputs remain available downstream, which
   implementation services stay private, and whether state is fresh per use or intentionally
   shared. Check that construction and release have one owner.
5. **IF work has a lifetime,** assign one reachable owner to every resource, scope, fiber, queue,
   subscription, cache, runtime, and listener. Use `Resource` for scoped acquisition/release and
   `ManagedRuntime` at an application or host boundary when that boundary owns the runtime; a
   library must not create an unowned process-global runtime.
6. **IF work is concurrent,** define bounds, ordering, backpressure, acknowledgment, sibling
   failure, cancellation, retry, and shutdown before selecting a primitive. Attach fibers to a
   parent, scope, keyed owner, or named external owner; a fork alone does not prove startup, so
   use a handshake when readiness matters.
7. **IF a foreign host executes the program,** normalize throwing, Promise, callback, platform,
   wire, and framework behavior once at the owning adapter. Preserve `Cause`/`Exit` while
   supervision, diagnostics, recovery, or cleanup need the complete outcome; collapse to an
   HTTP response, callback error, process status, or framework result only at the host edge.
8. **IF the answer depends on a particular API,** verify it after semantic selection, inspect
   the relevant API reference, confirm the consuming package's exact export/signature, and add
   deterministic proof for the claimed failure, race, time, or cleanup behavior.

## Semantic routing

- **IF the question is about values, absence, expected failure, decoding, or input shape,** read
  [`FUNDAMENTALS.md`](./references/FUNDAMENTALS.md) and route exact details to the API references
  for [`Option`](../effect-api-documentation/references/Option.md), [`Result`](../effect-api-documentation/references/Result.md),
  [`Schema`](../effect-api-documentation/references/Schema.md), and [`Config`](../effect-api-documentation/references/Config.md).
- **IF the question is about pure pipelines, matching, refinements, or typed data reshaping,** read
  [`RECIPES.md`](./references/RECIPES.md#pure-pipelines-matching-and-data-shape); keep native
  TypeScript when the Effect-specific type or value behavior does not add a contract.
- **IF the question is about substitutable capabilities or construction,** read
  [`RuntimeComposition.md`](./references/RuntimeComposition.md) and [`SYSTEMS.md`](./references/SYSTEMS.md),
  then route exact details to [`Context`](../effect-api-documentation/references/Context.md) and
  [`Layer`](../effect-api-documentation/references/Layer.md). Use a service for a capability, a
  Layer for construction/composition/release, and ordinary arguments for operation data.
- **IF the question is about lifetime, reuse, or runtime ownership,** route exact API details to
  [`ResourceManagement.md`](./references/ResourceManagement.md), then to [`Resource`](../effect-api-documentation/references/Resource.md),
  [`Scope`](../effect-api-documentation/references/Scope.md), and [`ManagedRuntime`](../effect-api-documentation/references/ManagedRuntime.md).
- **IF repeated operations can be coalesced into one resolution,** read
  [`RuntimeComposition.md`](./references/RuntimeComposition.md#request-to-requestresolver) and route
  exact request APIs to [`Request`](../effect-api-documentation/references/Request.md) and
  [`RequestResolver`](../effect-api-documentation/references/RequestResolver.md).
- **IF the question is about continuous data,** escalate only as needed: `Stream` for pull/process
  composition, `Sink` for a consumer boundary, and `Channel` for custom pull/push, termination,
  or backpressure machinery. Route exact member semantics to the corresponding API references.
- **IF the question is about concurrency, time, persistence, observability, or host integration,**
  read [`SYSTEMS.md`](./references/SYSTEMS.md), [`CONSUMER_ERGONOMICS.md`](./references/CONSUMER_ERGONOMICS.md),
  and [`RECIPES.md`](./references/RECIPES.md); route exact APIs to the per-module references for
  fibers, schedules, clocks, persistence, logging/tracing, HTTP, and runtime execution.
- **IF the question is about proof or review,** read [`REVIEW_AND_TESTING.md`](./references/REVIEW_AND_TESTING.md)
  and use deterministic controls such as test clocks, test consoles, fake services, explicit
  scopes, and failure/cleanup assertions. Do not prove time or lifecycle behavior with sleeps.

## Boundary invariants

- **IF a value is ordinary operation data,** pass it as an argument; use a service only for a
  substitutable or contextual capability.
- **IF failure is expected,** keep it in `E`; treat defects as violated assumptions and
  interruption as cancellation. Preserve complete outcomes internally and translate them once.
- **IF a primitive resembles custom machinery,** compare identity, ordering, capacity, freshness,
  backpressure, cancellation, persistence, and shutdown before replacing it.
- **IF configuration or secrets enter,** keep config decoding and redaction at that boundary;
  if durability is required, use an explicit persistence adapter rather than calling an
  in-memory cache durable. Keep logs, spans, and metrics at service/host boundaries, not in
  domain values.

For a local question, return only the relevant IF/THEN chain, code, and checks. For a system
design, also state what stays plain, residual `R`, Layer privacy/output retention/freshness,
ownership, failure and concurrency policy, host adapters, and deterministic proof. See
[`SOURCES.md`](./references/SOURCES.md) only for example provenance and routing; exact API
authority remains with `effect-api-documentation` and the consuming package.
