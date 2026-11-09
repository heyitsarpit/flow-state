---
name: effect-api-documentation
description: Write and review source-backed Effect v4 API references for exact exports, member APIs, signatures, examples, and version behavior. Route architecture and use-case decisions to effect-systems-design.
---

# Effect API documentation

Use this skill when the task needs exact Effect v4 exports, member APIs,
signatures, overloads, examples, or version-specific behavior. Write one
module reference per file. Use the [Effect systems design skill](../effect-systems-design/SKILL.md)
for architecture, use-case selection, or deciding whether a design should use
Effect.

## Authority and source workflow

- Read the consuming package's `package.json`, lockfile, installed declarations,
  and installed source first. They define the Effect version and available API.
  If sources disagree, follow the consuming package and lockfile and record the
  uncertainty.
- Use [`codebases/effect-v4`](../../../codebases/effect-v4/) for declaration
  links, implementation context, tests, and real-usage searches. It is
  corroborating source material, not version authority. Link a declaration with
  an exact line anchor when practical.
- Verify package-root and utility exports as root-level, namespaced,
  re-exported, or both. Do not assume every API is `Topic.method`. When checking
  an additional known API, search `codebases/effect-v4` for its exports and use.

## Reference authoring rules

- Keep one source-backed reference file per documented module. Keep API content
  in that file; this entrypoint is only routing and shared guidance.
- For every expanded API section or subsection, preserve the exact export or
  member name, signature, overloads, confirmed behavior, source link, and one
  accurate minimal TypeScript example.
- For type-focused modules, expand only public types that solve common
  application or library problems. Keep internal type plumbing names-only.
- Add a compact, names-only `### Additional known APIs (not expanded)` list
  for confirmed public APIs that are not expanded. Keep it separate from the
  index and method bodies; include no signatures, descriptions, or examples.
  Include root-level utility names such as `Function` and `Pipeable` when they
  are confirmed but not expanded.
- Distinguish source-confirmed behavior from design guidance. Preserve
  overloads and do not invent semantics.
- Keep cross-module recipe guides compact. Link each recipe to the exact local
  website recipe and pinned source that support it. Do not create duplicate
  module references or an extra index.

## Reference map

Choose one linked module or guide below, then read that reference's API content.
The map is routing; it does not duplicate module documentation.

### Core composition and host runtime

- [Effect](references/Effect.md), [Function](references/Function.md), [Pipeable](references/Pipeable.md), [Context](references/Context.md), [Layer](references/Layer.md), [ManagedRuntime](references/ManagedRuntime.md), [Service patterns](references/guides/Service.md), [Runtime](references/Runtime.md), [NodeRuntime](references/NodeRuntime.md), [Requirements management](references/guides/RequirementsManagement.md), [Runtime composition](references/guides/RuntimeComposition.md)

### Errors and outcomes

- [Exit](references/Exit.md), [Cause](references/Cause.md), [Option](references/Option.md), [Result](references/Result.md), [Error management](references/guides/ErrorManagement.md)

### State, coordination, and resource lifetime

- [Scope](references/Scope.md), [Ref](references/Ref.md), [SubscriptionRef](references/SubscriptionRef.md), [SynchronizedRef](references/SynchronizedRef.md), [Deferred](references/Deferred.md), [Latch](references/Latch.md), [Queue](references/Queue.md), [PubSub](references/PubSub.md), [Semaphore](references/Semaphore.md), [PartitionedSemaphore](references/PartitionedSemaphore.md), [Cache](references/Cache.md), [ScopedCache](references/ScopedCache.md), [RcMap](references/RcMap.md), [RequestResolver](references/RequestResolver.md), [Request resolution](references/guides/RequestResolution.md), [Resource](references/Resource.md), [Pool](references/Pool.md), [Resource management](references/guides/ResourceManagement.md)

### Fibers, scheduling, time, and testing

- [Fiber](references/Fiber.md), [FiberSet](references/FiberSet.md), [FiberMap](references/FiberMap.md), [FiberHandle](references/FiberHandle.md), [Schedule](references/Schedule.md), [Clock](references/Clock.md), [TestClock](references/TestClock.md), [Duration](references/Duration.md), [DateTime](references/DateTime.md), [FastCheck](references/FastCheck.md), [TestConsole](references/TestConsole.md)

### Domain data, types, and collections

- [Schema](references/Schema.md), [Data](references/Data.md), [Array](references/Array.md), [Iterable](references/Iterable.md), [Record](references/Record.md), [Tuple](references/Tuple.md), [Brand](references/Brand.md), [Types](references/Types.md), [Struct](references/Struct.md), [Predicate](references/Predicate.md), [Match](references/Match.md), [Graph](references/Graph.md), [Equivalence](references/Equivalence.md), [Order](references/Order.md), [Chunk](references/Chunk.md), [HashMap](references/HashMap.md), [HashSet](references/HashSet.md), [Request](references/Request.md), [Redacted](references/Redacted.md)

### Streams and host I/O

- [Stream](references/Stream.md), [Sink](references/Sink.md), [Channel](references/Channel.md), [Console](references/Console.md), [FileSystem](references/FileSystem.md), [Path](references/Path.md)

### External boundaries, persistence, and operations

- [HttpApi](references/HttpApi.md), [HttpApiEndpoint](references/HttpApiEndpoint.md), [HttpApiBuilder](references/HttpApiBuilder.md), [HttpApiClient](references/HttpApiClient.md), [HttpClient](references/HttpClient.md), [HttpServer](references/HttpServer.md), [HttpRouter](references/HttpRouter.md), [SqlClient](references/SqlClient.md), [SqlSchema](references/SqlSchema.md), [Migrator](references/Migrator.md), [KeyValueStore](references/KeyValueStore.md), [PersistedCache](references/PersistedCache.md), [PersistedQueue](references/PersistedQueue.md), [RateLimiter](references/RateLimiter.md), [Rpc](references/Rpc.md), [RpcClient](references/RpcClient.md), [RpcServer](references/RpcServer.md), [Config](references/Config.md), [ConfigProvider](references/ConfigProvider.md), [Logger](references/Logger.md), [Tracer](references/Tracer.md), [Metric](references/Metric.md)
