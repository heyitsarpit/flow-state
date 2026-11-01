---
name: effect-systems-design
description: Choose and review purposeful Effect use in TypeScript through use-case-first IF/THEN decisions for values, failures, services, Layers, lifetimes, concurrency, host integration, and deterministic tests. Use effect-api-documentation for exact APIs; the consuming package and lockfile are version authority, and codebases/effect-v4 is usage evidence only.
---

# Effect systems design

Choose the semantic boundary from the operation and its consumer. Keep pure, deterministic
domain work in plain TypeScript or `Result`. Use `Effect` when it owns typed effectful failure,
capabilities, asynchrony, interruption, time, concurrency, resource lifetime, observability, or
host translation, or when it removes caller work such as recovery, coordination, or cleanup.
These are conditional choices: a pure helper can remain plain inside an Effect program.

This skill chooses architecture and composition. For exact exports, signatures, and member
behavior, use [`effect-api-documentation`](../effect-api-documentation/SKILL.md), then verify the
consuming package's installed declarations, tests, and lockfile. Use
[`codebases/effect-v4/`](../../../codebases/effect-v4/) only for source and composition usage
evidence after reading its `AGENTS.md`. Treat the consuming package and lockfile as version
authority.

## Decision shape

For each relevant question, give the smallest applicable chain:

- **IF:** state the use-case condition.
- **THEN:** choose the smallest design and concepts to compose.
- **BECAUSE:** name the semantic law preserved.
- **CHECK:** name the edge case, owner, lifetime, or deterministic proof that could disprove it.
- **CODE:** include a short example only when the composition is non-obvious and API-verified.

Follow the concrete operation to its boundary. Do not turn the answer into a primitive catalog.

## Core decisions

### Values, failures, and requirements

- **IF** work is local, deterministic, and has no capability, cancellation, time, concurrency, or
  resource lifetime, **THEN** keep it plain. Use ordinary transformations, matching, validation,
  encoding, and algorithms directly.
- **IF** a pure computation has one bounded typed success/failure outcome, **THEN** use `Result` or
  the project's established result type. Typed failure alone does not require an Effect runtime.
- **IF** `unknown`, serialized, or untrusted data crosses a boundary, **THEN** decode it once at
  that boundary with the established decoder; keep trust and parse-error policy explicit.
- **IF** an effectful operation needs capabilities or lifecycle semantics, **THEN** keep
  `Effect<A, E, R>` honest until an explicit boundary handles or provides its channels. Preserve
  inferred success, error, and requirements; do not widen types to hide missing design.
- **IF** a value is operation data, **THEN** pass it as an argument. Use a service for a
  substitutable or contextual capability.
- **IF** failure is expected, **THEN** keep it in `E`; treat defects as violated assumptions and
  interruption as cancellation. Preserve `Cause`/`Exit` while supervision, diagnostics, recovery,
  or cleanup need the complete outcome, then translate once at the owning boundary.

### Services, Layers, and privacy

- **IF** a reusable capability travels through deep calls, **THEN** model it as a service and let a
  `Layer` construct, compose, provide, and release it. Keep IDs, payloads, commands, and filters
  as ordinary arguments.
- **IF** construction is effectful, fallible, or resource-backed, **THEN** keep those dependencies
  and failures in the Layer graph. Check every Layer's output, error, and residual requirements.
- **IF** a higher service uses a lower service as an implementation detail, **THEN** provide the
  lower Layer privately. Retain it downstream only when consumers intentionally need both. Decide
  whether state is fresh per use or intentionally shared, and give construction and release one
  owner.
- **IF** an operation is reusable, **THEN** design its call site first. Accept domain data directly
  and preserve inferred A/E/R rather than adding plumbing or erasing requirements.

### Lifetimes and runtime ownership

- **IF** work acquires or retains anything, **THEN** assign one reachable owner to every resource,
  scope, fiber, queue, subscription, cache, runtime, and listener. Make acquisition, failure,
  interruption, shutdown, and release converge on that owner.
- **IF** acquisition is scoped, **THEN** use `Resource` or an equivalent scoped constructor. **IF**
  an application or host runs many programs against one environment, **THEN** use one
  `ManagedRuntime` for that host lifetime and give one owner responsibility for disposal.
- **IF** freshness is a test or request concern, **THEN** provide values at that boundary and use
  an explicit fresh Layer or rebuild policy. A library must not create an unowned process-global
  runtime.

### Concurrency, time, and continuous data

- **IF** work is concurrent, **THEN** define bounds, ordering, backpressure, acknowledgment,
  sibling failure, cancellation, retry, and shutdown before choosing a primitive. Attach fibers to
  a parent, scope, keyed owner, or named external owner; use a readiness handshake when startup
  matters because a fork alone proves neither readiness nor ownership.
- **IF** repeated operations can share one resolution, **THEN** use request resolution only when
  coalescing or a real batch endpoint is part of the contract. Preserve key identity, grouping,
  result order, per-entry failure, completion exactly once, and shutdown.
- **IF** values form a temporal process, **THEN** use `Stream` for pull/process composition, `Sink`
  for a consumer boundary, and `Channel` only when custom pull/push, termination, or backpressure
  machinery is required.
- **IF** custom machinery resembles a primitive, **THEN** compare identity, ordering, capacity,
  freshness, backpressure, cancellation, persistence, and shutdown before replacing it. Treat
  in-memory caches as non-durable unless an explicit persistence adapter owns durability.

### Host boundaries and observability

- **IF** a foreign host executes the program, **THEN** normalize throwing, Promise, callback,
  platform, wire, and framework behavior once at the owning adapter. Forward host cancellation into
  interruption where the foreign API supports it; classify status before decoding unknown responses.
- **IF** configuration or secrets enter, **THEN** decode and redact them at that boundary. Keep
  logs, spans, and metrics at service or host boundaries rather than in domain values.
- **IF** the host needs an HTTP response, callback error, process status, or framework result,
  **THEN** collapse the complete internal outcome only at that host edge.

### Deterministic proof

- **IF** behavior depends on time, I/O, services, fibers, races, or cleanup, **THEN** use test
  clocks, test consoles, fake services, explicit scopes, and direct failure or cleanup assertions.
  Do not use sleeps or scheduler luck to prove time or lifecycle behavior.
- **IF** code is pure, **THEN** test it without an Effect runtime. **IF** Layers or host adapters
  are under test, **THEN** use focused fake Layers and assert the public success/error boundary.
- **IF** a claim concerns failure, ordering, race, time, cancellation, or cleanup, **THEN** add a
  deterministic behavior proof. Examples such as `Ref.make`, `Deferred.make`, and `Queue.bounded`
  construct Effects, so keep their construction inside Effect composition and verify exact APIs
  against the consuming package.

## Route to references

- **IF** the question concerns values, absence, expected failure, decoding, or pure reshaping,
  **THEN** read [`FUNDAMENTALS.md`](./references/FUNDAMENTALS.md) and, when code helps,
  [`RECIPES.md#pure-pipelines-matching-and-data-shape`](./references/RECIPES.md#pure-pipelines-matching-and-data-shape). Route exact details to [`Option`](../effect-api-documentation/references/Option.md), [`Result`](../effect-api-documentation/references/Result.md), [`Schema`](../effect-api-documentation/references/Schema.md), or [`Config`](../effect-api-documentation/references/Config.md).
- **IF** it concerns capabilities, services, Layers, state, runtime ownership, concurrency, or
  request resolution, **THEN** read [`SYSTEMS.md`](./references/SYSTEMS.md) and
  [`RuntimeComposition.md`](./references/RuntimeComposition.md). Route exact details to
  [`Context`](../effect-api-documentation/references/Context.md), [`Layer`](../effect-api-documentation/references/Layer.md), [`Request`](../effect-api-documentation/references/Request.md), or [`RequestResolver`](../effect-api-documentation/references/RequestResolver.md).
- **IF** repeated operations can be coalesced into one resolution, **THEN** read
  [`RuntimeComposition.md#request-to-requestresolver`](./references/RuntimeComposition.md#request-to-requestresolver)
  and route exact request APIs to [`Request`](../effect-api-documentation/references/Request.md)
  and [`RequestResolver`](../effect-api-documentation/references/RequestResolver.md).
- **IF** it concerns acquisition, refresh, scope, or disposal, **THEN** read
  [`ResourceManagement.md`](./references/ResourceManagement.md). Route exact details to
  [`Resource`](../effect-api-documentation/references/Resource.md), [`Scope`](../effect-api-documentation/references/Scope.md), or [`ManagedRuntime`](../effect-api-documentation/references/ManagedRuntime.md).
- **IF** it concerns continuous data, time, persistence, observability, or host integration,
  **THEN** read [`SYSTEMS.md`](./references/SYSTEMS.md),
  [`CONSUMER_ERGONOMICS.md`](./references/CONSUMER_ERGONOMICS.md), and
  [`RECIPES.md`](./references/RECIPES.md). Route exact members to the corresponding API reference
  for streams, schedules, clocks, persistence, logging/tracing, HTTP, and runtime execution.
- **IF** it concerns review or proof, **THEN** read
  [`REVIEW_AND_TESTING.md`](./references/REVIEW_AND_TESTING.md). Use
  [`SOURCES.md`](./references/SOURCES.md) only for provenance and source routing.

For a local question, return only the relevant IF/THEN chain, code, and checks. For a system
design, also state what stays plain, residual `R`, Layer privacy/output/freshness, ownership,
failure and concurrency policy, host adapters, and deterministic proof. Version authority stays
with the consuming package and lockfile; exact API authority stays with
`effect-api-documentation` and the consuming package.
