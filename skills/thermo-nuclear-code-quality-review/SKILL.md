---
name: thermo-nuclear-code-quality-review
description: Run an extremely strict Effect-native TypeScript and Flow State code quality review, or use before implementing Flow State examples/runtime code. Triggers include thermo-nuclear review, thermonuclear code quality audit, harsh maintainability review, Effect-native review, Flow State API proving app review, or requests to maximize Effect semantics, type safety, abstraction quality, modularity, and code health.
---

# Thermo-Nuclear Effect Code Quality Review

Use this skill for an unusually strict review or implementation pass focused on
Effect-native TypeScript, Flow State API quality, maintainability, abstraction
quality, and codebase health.

This skill keeps the original thermo-nuclear bar: be ambitious about structure,
delete complexity where possible, and reject spaghetti growth. It adds a second
non-negotiable bar: code should be maximally Effect-native, service/layer based,
typed, deterministic, and honest about errors, requirements, streams, time, and
cleanup.

## Required References

Read references selectively:

- Read `references/effect-native-review.md` for every Effect or Flow State task.
- Read `references/effect-v4-api.md` when choosing an Effect API, naming a Flow
  facade, reviewing a runtime pattern, or deciding whether Flow should inherit
  an Effect concept directly. It is the full Effect-first discovery reference
  derived from this repository's `NOTES.md`.

Prefer grepping `references/effect-v4-api.md` for modules such as
`ManagedRuntime`, `Stream`, `Schedule`, `RequestResolver`, `Duration.Input`,
`Cache`, `Resource`, `Clock`, `Cause`, `Context.Service`, `Effect.fn`,
`Schema`, `Option`, `Queue`, `PubSub`, `Deferred`, `FiberMap`, `Scope`,
`KeyValueStore`, `Persistable`, `Rpc`, `HttpApi`, `Record`, `Array`, `Data`,
`Brand`, `Newtype`, or `Types`.

## Core Prompt

Start from this baseline:

> Perform a deep code quality audit of the current branch's changes.
> Rethink how to structure and implement the changes to meaningfully improve
> code quality without changing behavior.
> Work to improve abstractions, modularity, Effect-native semantics,
> type-safety, succinctness, and legibility.
> Be ambitious. If there is a clear path to improving the implementation by
> restructuring code, go for it.
> Be extremely thorough and rigorous. Measure twice, cut once.

When implementing rather than reviewing, apply the same bar before writing code:
choose the simplest Effect-native design first, then write the smallest code
that proves the intended API and behavior.

## Non-Negotiable Standards

### 1. Be Ambitious About Structural Simplification

- Search for "code judo" moves that make branches, helpers, modes, wrappers, or
  layers disappear.
- Prefer a design that feels inevitable in hindsight.
- Do not merely rearrange complexity. Delete it, move it to its owner, or change
  the model so it is no longer needed.

### 2. Use Effect As The Native Substrate

- Preserve `Effect<A, E, R>` semantics. Do not erase typed failures or service
  requirements.
- Use `Context.Service`, `Layer`, and `ManagedRuntime` for services and host
  bridges.
- Use `Effect.fn("Name")` for named service methods, resource lookups,
  mutations, and important operations.
- Use `Stream`, `Schedule`, `Duration.Input`, `Clock`, `TestClock`, `Exit`,
  `Cause`, `Schema`, `Option`, `Result`, `Redacted`, `Queue`, `PubSub`,
  `RequestResolver`, `Cache`, `Ref`, `Deferred`, `FiberMap`, and `Scope`
  directly where they own the concept.
- Add Flow wrappers only where Flow adds distinct resource, transaction,
  machine, trace, or UI read-model semantics.

### 3. Be 100% Type-Safe At Boundaries

- Treat `any`, broad `unknown`, `as never`, and cast-heavy plumbing as serious
  design smells.
- Prefer schema-backed boundaries, branded IDs, typed errors, explicit service
  requirements, and precise generics.
- Do not hide a type problem by weakening a public API.
- Use type tests when public inference is part of the feature.

### 4. Avoid Nullish Internal State

- Use `Option` for internal absence.
- Use `null` or `undefined` only at React, JSON, external API, or persistence
  boundaries where the boundary naturally speaks that shape.
- Normalize nullish external data into `Option` as soon as it enters
  Effect/Flow code.

### 5. Keep Expected Failure In The Error Channel

- Do not `throw` expected domain failures.
- Do not use `try/catch` inside `Effect.gen` to handle Effect failures.
- Use `Effect.fail`, `catchTag`, `catchTags`, `catchReason`, `Effect.result`,
  `Exit`, and `Cause` intentionally.
- Preserve success, typed failure, defect, and interruption as distinct lanes.

### 6. Prefer Effect Alternatives Over Local Clones

- Use `Stream` instead of primary `AsyncIterable`.
- Use `Schedule` instead of hand-rolled retry/polling/sampling loops.
- Use human-readable `Duration.Input` strings such as `"30 seconds"` and
  `"250 millis"` instead of custom duration objects.
- Use `Clock`/`DateTime`/`TestClock` instead of `Date.now()` in Effect code.
- Use `Schema`/`Data` for domain values and errors instead of ad hoc tagged
  object shapes.
- Use `Redacted` for sensitive values.
- Use `Record`, `Array`, `Struct`, `Tuple`, `Match`, `Predicate`, `Order`, and
  `Equivalence` instead of bespoke helper clones when they clarify code.

### 7. Do Not Let Files Sprawl Past A Healthy Boundary

- Treat a PR that pushes a file from below 1000 lines to above 1000 lines as a
  presumptive code-quality problem.
- Prefer extracting modules, services, descriptors, test fixtures, pure helpers,
  or focused views before the file becomes hard to scan.

### 8. Reject Spaghetti Growth

- Be highly suspicious of new ad hoc conditionals, scattered special cases,
  one-off flags, nullable modes, and feature checks in shared paths.
- Push logic into the canonical package, service, machine, resource, mutation,
  view, policy, or helper that owns the concept.
- Prefer a better model over centralized conditional soup.

### 9. Prefer Direct, Boring, Maintainable Code

- Treat brittle, ad hoc, or magical behavior as a code-quality problem.
- Be skeptical of generic mechanisms that hide simple data-shape assumptions.
- Flag thin abstractions, identity wrappers, pass-through helpers, and namespace
  symmetry that add indirection without buying clarity.
- Prefer direct domain code over clever generic machinery unless the abstraction
  removes real complexity.

### 10. Keep Logic In The Canonical Layer

- Call out feature logic leaking into shared paths or implementation details
  leaking through APIs.
- Prefer existing canonical utilities, helpers, services, and Effect modules
  over bespoke one-offs.
- Push code toward the package, service, module, resource, mutation, machine, or
  view that already owns the concept.
- Treat a near-duplicate helper as a design smell unless it captures a genuinely
  different invariant.

### 11. Question Sequential Orchestration And Partial Updates

- If independent work is serialized for no good reason, ask whether Effect
  concurrency or parallel composition would make the code simpler.
- If related updates can leave state half-applied, push for a more atomic
  resource transaction, mutation transaction, `Ref`/`SynchronizedRef` update, or
  scoped Effect structure.
- Do not chase micro-optimizations, but do flag orchestration that makes the
  implementation brittle or harder to reason about.

### 12. Keep Flow State Ownership Clean

- Canonical app data belongs in resources.
- Process state belongs in flows/machines.
- UI read models belong in `flow.view`.
- Views combine and simplify resource snapshots plus one or more flow snapshots;
  they are not merely renamed machine snapshots.
- Mutations are traceable transactions, not hidden side effects.
- Streams, timers, child flows, and resources must have clear ownership and
  cleanup.

### 13. Make Async Deterministic And Scoped

- Use `Scope`, finalizers, interruption handling, and managed runtimes for
  cleanup.
- Use `TestClock` for time in tests.
- Use controlled `Deferred`, `Queue`, or `PubSub` handles for async and stream
  tests.
- Do not rely on real sleeps, wall-clock timing, open fibers, or unbounded stream
  drains.

## Primary Review Questions

Ask these for every meaningful change:

- Is there a code-judo move that deletes complexity?
- Is the code using Effect's native concept, or did it invent a weaker clone?
- Does the API preserve `A`, `E`, and `R`, or did it erase failures/services?
- Does this logic live in the right owner: resource, mutation, machine, view,
  runtime service, or app service?
- Does the diff add branching complexity where a better model should exist?
- Does a view combine and simplify app data, or merely restate an actor snapshot?
- Is absence modeled with `Option` internally?
- Are expected failures typed, schema-backed where useful, and handled through
  Effect?
- Are streams, timers, resources, actors, and child work scoped and cleaned up?
- Did the code add casts, broad optionality, or loosely-shaped objects that hide
  the real invariant?
- Did the change create thin wrappers around Effect names that add no semantics?
- Did the diff enlarge a file or module past a healthy boundary?
- Did a cohesive module become more coupled, more stateful, or harder to scan?
- Are repeated conditionals signaling a missing model, helper, or policy?
- Is the implementation direct and legible, or does it rely on incidental
  control flow and special cases?
- Is feature logic leaking across a boundary?
- Is orchestration more sequential or less atomic than it needs to be?
- Is the abstraction earning its keep, or is it just a wrapper?
- Are tests deterministic and lane-aware: success, typed failure, defect,
  interrupt?

## What To Flag Aggressively

Escalate findings when you see:

- Promise-first service/domain logic where Effect should own errors and
  requirements.
- Primary `AsyncIterable` streams instead of `Stream`.
- Custom retry, polling, clock, duration, batching, redaction, cache, or stream
  mechanisms that duplicate Effect.
- `Date.now()` in Effect services.
- Real sleeps in tests.
- `null | undefined` spreading through internal state.
- `any`, broad `unknown`, `as never`, or cast-heavy public types.
- `try/catch` around yielded Effects.
- Expected domain failures thrown as exceptions.
- Feature-specific logic leaking into general-purpose modules.
- Flow context duplicating canonical resource data.
- Views that are just summaries of a single machine when the screen needs a
  real read model.
- Mutations that hide optimistic patch, rollback, invalidation, or trace facts.
- Streams or child actors without interruption and cleanup proof.
- Refactors that move complexity around without reducing it.
- A file crossing 1000 lines without a strong structural reason.
- One-off booleans, nullable modes, or flags that complicate existing control
  flow.
- Narrow edge-case handling implemented in the middle of an already busy
  function.
- Bespoke helpers where the codebase already has a canonical utility or Effect
  module.
- Sequential async flow where independent work could stay simpler with parallel
  execution.
- Partial-update logic that makes state less atomic than necessary.
- Temporary branching that is likely to become permanent debt.

## Preferred Remedies

Prefer suggestions like:

- Replace a custom abstraction with the native Effect module.
- Move service requirements into `Context.Service` and compose them with
  `Layer`.
- Make the failure channel explicit instead of throwing or casting.
- Replace nullish internal state with `Option`.
- Replace ad hoc validation with `Schema`, `Result`, or a typed domain model.
- Replace custom polling/retry/timing with `Schedule` and `Duration.Input`.
- Replace async-iterable plumbing with `Stream`, `Queue`, or `PubSub`.
- Move canonical data from flow context into a resource.
- Move UI shaping from components into a `flow.view` read model.
- Split a sprawling file into domain modules, service definitions, descriptors,
  fixtures, views, and tests.
- Delete wrappers that only mirror Effect names.
- Use direct Effect service tests plus Flow scenario tests.
- Reframe the state model so conditionals disappear instead of getting
  centralized.
- Change the ownership boundary so the feature becomes a natural extension of an
  existing abstraction.
- Turn special-case logic into a simpler default flow with fewer exceptions.
- Replace condition chains with a typed model, `Match`, explicit dispatcher, or
  domain policy.
- Separate orchestration from business logic.
- Collapse duplicate branches into one clearer flow.
- Parallelize independent work when doing so also simplifies orchestration.
- Restructure related updates into a more atomic flow when partial state would
  be harder to reason about.

Do not be satisfied with renames when the real issue is structural.
Do not be satisfied with a cleaner version of the same weak model if a simpler
Effect-native model is visible.

## Review Tone

Be direct, serious, and demanding about quality. Do not be rude, but do not
soften major maintainability or Effect-semantics issues into mild suggestions.
If the code makes the codebase messier, say so clearly. If the implementation
missed an opportunity for a dramatic simplification, say that clearly too.

Useful phrases:

- `this pushes the file past 1k lines. can we decompose this first?`
- `this adds another special-case branch into an already busy flow. can we move this behind its own abstraction?`
- `this works, but it makes the surrounding code more spaghetti. let's keep the behavior and restructure the implementation.`
- `this feels like feature logic leaking into a shared path. can we isolate it?`
- `this abstraction seems unnecessary. can we keep the direct flow?`
- `why does this need a cast or optional here? can we make the boundary more explicit instead?`
- `this looks like a bespoke helper for something Effect or the codebase already owns. can we use the canonical one?`
- `there is a code-judo move here that makes this much simpler. can we reframe this so these branches disappear?`
- `this refactor moves complexity around, but does not really delete it. is there a way to make the model itself simpler?`
- `this erases the Effect error or service channel. can we preserve A, E, and R instead?`
- `this uses nullish internal state where Option would make the invariant explicit.`
- `this stream/timer/child work needs scoped cleanup and interruption proof.`

## Output Expectations

Prioritize findings in this order:

1. Structural regressions and missed simplifications.
2. Violations of Effect semantics, typed failures, services, scopes, or streams.
3. Type-safety and boundary problems.
4. Flow ownership problems across resources, flows, mutations, and views.
5. Spaghetti branching and file-size/decomposition concerns.
6. Testing gaps that make time, streams, failure lanes, or cleanup unproven.
7. General legibility and maintainability issues.

Lead with high-conviction findings. Do not flood the review with cosmetic nits
when larger model or Effect-semantics issues exist.

For implementation tasks, close with:

- what was made Effect-native
- what remains stubbed or contract-only
- which checks ran
- any residual design questions that need review before runtime semantics are
  filled in

## Approval Bar

Do not approve merely because behavior seems correct. The approval bar is:

- no clear structural regression
- no obvious missed code-judo simplification
- no unjustified file-size explosion
- no spaghetti growth from special-case branching
- no obviously hacky or magical abstraction that makes the code harder to reason
  about
- no generic mechanism hiding a simple data shape
- no avoidable canonical-helper or Effect-module duplication
- no avoidable wrapper around an Effect concept
- no unnecessary casts, broad unknowns, or nullish internal state
- no erased Effect failure or requirement channel
- no expected failures thrown as exceptions
- no unscoped stream/timer/child work
- no architecture-boundary leak across ResourceStore, OrchestratorSystem,
  mutations, views, runtime services, and app services
- no avoidable sequential orchestration or partial update structure when a
  simpler atomic structure is visible
- no deterministic-test gap for time, streams, cleanup, or failure lanes

Treat violations as presumptive blockers unless the author can justify them
clearly.
