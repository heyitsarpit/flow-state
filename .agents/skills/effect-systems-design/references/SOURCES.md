# Source map and authority

Use this map after choosing the semantic direction. Use
[`codebases/effect-v4/`](../../../../codebases/effect-v4/) for usage evidence and
[`effect-api-documentation`](../../effect-api-documentation/SKILL.md) for exact exports,
signatures, and member behavior. The consuming package and lockfile remain the authority for
what this workspace can actually import.

## Version and status map

| Source | Version or status | Authority |
| --- | --- | --- |
| Flow State consuming package ([`package.json`](../../../../package.json)) | `effect` `4.0.0-beta.86` | Export surface and installed behavior for Flow State. |
| Vendored [`effect-v4` package](../../../../codebases/effect-v4/packages/effect/package.json) | `4.0.0-beta.98`, snapshot commit `3a1128c7684e04d34d9f541f77adaac38a513056` | Usage and source evidence only; this snapshot is not shipped behavior. |
| Other local consumers | May pin another or patched version | Evidence only; inspect that consumer's package file before reusing an API. |

When a snapshot and the consuming package disagree, do not infer availability from the snapshot.
Inspect the consuming package, lockfile, tests, and generated declarations, then route exact API
questions to the corresponding reference in
[`effect-api-documentation/references`](../../effect-api-documentation/references/).

## Evidence layers

- **Usage:** start with the vendored [`ai-docs`](../../../../codebases/effect-v4/ai-docs/), then
  inspect the relevant source under
  [`packages/effect/src`](../../../../codebases/effect-v4/packages/effect/src/).
- **Behavior:** inspect focused tests under
  [`packages/effect/test`](../../../../codebases/effect-v4/packages/effect/test/) for ordering,
  failure, interruption, timing, resource, and concurrency claims.
- **Exact API:** use the per-module references for [Effect](../../effect-api-documentation/references/Effect.md),
  [Context](../../effect-api-documentation/references/Context.md),
  [Layer](../../effect-api-documentation/references/Layer.md),
  [Cause](../../effect-api-documentation/references/Cause.md),
  [Exit](../../effect-api-documentation/references/Exit.md), and the
  [error-management guide](../../effect-api-documentation/references/guides/ErrorManagement.md).

## Use-case routing

| Decision | API reference starting points | Usage evidence |
| --- | --- | --- |
| Plain values, absence, expected outcomes, and decoding | [Option](../../effect-api-documentation/references/Option.md), [Result](../../effect-api-documentation/references/Result.md), [Schema](../../effect-api-documentation/references/Schema.md), [Config](../../effect-api-documentation/references/Config.md) | [`packages/effect/src`](../../../../codebases/effect-v4/packages/effect/src/) and focused tests. |
| Capabilities, requirements, construction, and runtime ownership | [Context](../../effect-api-documentation/references/Context.md), [Layer](../../effect-api-documentation/references/Layer.md), [ManagedRuntime](../../effect-api-documentation/references/ManagedRuntime.md), [Runtime](../../effect-api-documentation/references/Runtime.md) | [`ai-docs` service and integration recipes](../../../../codebases/effect-v4/ai-docs/). |
| Resource lifetime, scopes, state, and coordination | [Resource](../../effect-api-documentation/references/Resource.md), [Scope](../../effect-api-documentation/references/Scope.md), [Ref](../../effect-api-documentation/references/Ref.md), [Deferred](../../effect-api-documentation/references/Deferred.md), [Queue](../../effect-api-documentation/references/Queue.md), [PubSub](../../effect-api-documentation/references/PubSub.md) | Source declarations plus lifecycle and concurrency tests. |
| Fibers, scheduling, time, and deterministic tests | [Fiber](../../effect-api-documentation/references/Fiber.md), [FiberMap](../../effect-api-documentation/references/FiberMap.md), [Schedule](../../effect-api-documentation/references/Schedule.md), [Clock](../../effect-api-documentation/references/Clock.md), [TestClock](../../effect-api-documentation/references/TestClock.md), [TestConsole](../../effect-api-documentation/references/TestConsole.md) | [`packages/effect/test`](../../../../codebases/effect-v4/packages/effect/test/). |
| Temporal data and backpressure | [Stream](../../effect-api-documentation/references/Stream.md), [Sink](../../effect-api-documentation/references/Sink.md), [Channel](../../effect-api-documentation/references/Channel.md) | [`ai-docs` stream recipes](../../../../codebases/effect-v4/ai-docs/). |
| Durability, limits, and observability | [KeyValueStore](../../effect-api-documentation/references/KeyValueStore.md), [PersistedCache](../../effect-api-documentation/references/PersistedCache.md), [PersistedQueue](../../effect-api-documentation/references/PersistedQueue.md), [RateLimiter](../../effect-api-documentation/references/RateLimiter.md), [Logger](../../effect-api-documentation/references/Logger.md), [Tracer](../../effect-api-documentation/references/Tracer.md), [Metric](../../effect-api-documentation/references/Metric.md) | Inspect the corresponding unstable source modules and tests, then verify the consuming package. |

## Version-drift check

Before recommending an API:

1. Choose the use-case route above.
2. Read the matching API reference and its source-backed links.
3. Confirm the export and signature in the consuming package, lockfile, and tests.
4. Use the vendored checkout only to understand composition and behavior evidence.

For a bounded current-v4 schedule, the supported pattern documented here is
`Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 4 }))`; verify both exports in the
consuming package before copying it. See [Schedule](../../effect-api-documentation/references/Schedule.md)
and the vendored [Schedule.ts](../../../../codebases/effect-v4/packages/effect/src/Schedule.ts).

Do not treat this map, the vendored snapshot, or any local recipe as shipped behavior. Exact API
authority remains the consuming package plus
[`effect-api-documentation`](../../effect-api-documentation/SKILL.md).

## Local search

```sh
rg -n "SYMBOL" codebases/effect-v4/packages/effect/src \
  codebases/effect-v4/packages/effect/test
```
