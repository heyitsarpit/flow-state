---
name: effect-api-documentation
description: Write and review detailed Effect v4 API documentation by routing each module to its own source-backed reference file. Use when documenting exact exports, member APIs, signatures, examples, or version-specific behavior; use effect-systems-design for architectural selection instead.
---

# Effect API documentation

Document one Effect v4 module per reference file. Use this skill for exact
exports, signatures, examples, and version-specific behavior; use the [Effect
systems design skill](../effect-systems-design/SKILL.md) for architectural
selection or deciding whether a design should use Effect.

## Documentation rules

- Treat the pinned package source and declarations as authoritative.
- Keep one source-backed reference file per documented module.
- Link each documented member to its declaration in `codebases/effect-v4`
  using an exact line anchor when practical.
- Include one accurate, minimal TypeScript example for every documented API
  section or subsection.
- For type-focused modules, expand only public types that solve common
  application or library problems; keep internal type plumbing names-only.
- Include a compact, names-only inventory of confirmed public APIs that are not
  expanded into full sections; keep it separate from the API index and method
  bodies, with no signatures, descriptions, or examples.
- Inspect package-root exports and utility modules, and search
  `/Users/arpit/Developer/flow-state/codebases/effect-v4` to verify additional
  APIs and their real usage.
- In each `Additional known APIs (not expanded)` list, include confirmed root-level
  and utility exports such as `Function` and `Pipeable` names when they are not
  expanded into full sections.
- Preserve overloads and distinguish confirmed behavior from design guidance;
  do not invent semantics.

## API table index

### 1. Core composition and host runtime

| Module or guide | Reference | General use |
| --- | --- | --- |
| `Effect` | [references/Effect.md](references/Effect.md) | Composes synchronous and asynchronous work while tracking its success value, failure channel, and service requirements. |
| `Function` | [references/Function.md](references/Function.md) | Provides root-level and namespaced function composition, adaptation, and small type-level helpers. |
| `Pipeable` | [references/Pipeable.md](references/Pipeable.md) | Defines the type-level contract and implementation helpers for custom `.pipe(...)` support. |
| `Context` | [references/Context.md](references/Context.md) | Defines typed service keys and retrieves the services that an Effect program requires. |
| `Layer` | [references/Layer.md](references/Layer.md) | Builds and composes service implementations while managing the resources they acquire. |
| `ManagedRuntime` | [references/ManagedRuntime.md](references/ManagedRuntime.md) | Keeps a Layer-built service environment alive so host code can run multiple effects against one managed runtime. |
| [Service patterns](references/guides/Service.md) | Guide | Connects Context services, Layers, managed runtimes, request-scoped overrides, tests, and ownership. |
| `Runtime` | [references/Runtime.md](references/Runtime.md) | Executes effects from host code with an explicit runtime environment and exposes their completion as an Exit. |
| `NodeRuntime` | [references/NodeRuntime.md](references/NodeRuntime.md) | Connects an Effect program to Node.js process startup, execution, and shutdown. |
| [Requirements management](references/guides/RequirementsManagement.md) | Guide | Shows how to declare A/E/R requirements, compose service Layers, memoize graphs, and replace dependencies in tests. |
| [Runtime composition](references/guides/RuntimeComposition.md) | Guide | Shows how to assemble reusable runtimes, cross host boundaries, keep resources and errors scoped, and use deterministic time in tests. |

### 2. Errors and outcomes

| Module or guide | Reference | General use |
| --- | --- | --- |
| `Exit` | [references/Exit.md](references/Exit.md) | Represents the final success or failure of an Effect computation, including its failure Cause. |
| `Cause` | [references/Cause.md](references/Cause.md) | Describes structured failure causes so programs can inspect, classify, or combine defects, interruptions, and typed failures. |
| `Option` | [references/Option.md](references/Option.md) | Models a value that may be present or absent without using null or undefined in domain flows. |
| `Result` | [references/Result.md](references/Result.md) | Represents a successful or failed value when a local computation should carry both outcomes explicitly. |
| [Error management](references/guides/ErrorManagement.md) | Guide | Shows how to model typed expected failures, recover selectively, retry transient work, fall back, and accumulate validation errors. |

### 3. State, coordination, and resource lifetime

| Module or guide | Reference | General use |
| --- | --- | --- |
| `Scope` | [references/Scope.md](references/Scope.md) | Owns a lifetime boundary for finalizers and other resources that must be released together. |
| `Ref` | [references/Ref.md](references/Ref.md) | Stores mutable state that effects can read and update with composable transformations. |
| `SubscriptionRef` | [references/SubscriptionRef.md](references/SubscriptionRef.md) | Combines a current value with a stream of updates so consumers can observe state changes. |
| `SynchronizedRef` | [references/SynchronizedRef.md](references/SynchronizedRef.md) | Provides a Ref whose updates are serialized through effectful operations that can depend on the current value. |
| `Deferred` | [references/Deferred.md](references/Deferred.md) | Coordinates one-time completion between fibers by allowing one effect to supply a result and others to await it. |
| `Queue` | [references/Queue.md](references/Queue.md) | Buffers values between producers and consumers with effectful offering, taking, and shutdown behavior. |
| `PubSub` | [references/PubSub.md](references/PubSub.md) | Broadcasts published values to multiple subscribers while keeping producer and subscriber lifetimes scoped. |
| `Semaphore` | [references/Semaphore.md](references/Semaphore.md) | Bounds concurrent work with a fixed number of permits that effects acquire and release. |
| `PartitionedSemaphore` | [references/PartitionedSemaphore.md](references/PartitionedSemaphore.md) | Allocates independent permit budgets by partition key for workloads that need differentiated concurrency limits. |
| `Cache` | [references/Cache.md](references/Cache.md) | Memoizes effectful lookups with bounded capacity and expiration so repeated requests can reuse results. |
| `RcMap` | [references/RcMap.md](references/RcMap.md) | Keeps keyed resources alive while they are referenced and releases idle entries when their scopes no longer use them. |
| `RequestResolver` | [references/RequestResolver.md](references/RequestResolver.md) | Defines how Effect requests are batched, grouped, delayed, cached, and completed. |
| [Request resolution](references/guides/RequestResolution.md) | Guide | Connects typed requests to resolvers, batching, caching, service requirements, and boundary failures. |
| `Resource` | [references/Resource.md](references/Resource.md) | Represents a scoped value that can be acquired once and refreshed manually or on a schedule. |
| `Pool` | [references/Pool.md](references/Pool.md) | Manages a bounded set of reusable resources and leases them to concurrent effects. |
| [Resource management](references/guides/ResourceManagement.md) | Guide | Shows how to bracket acquisition, use, and release, attach finalizers to Scope, roll back failures, and scope stream resources. |

### 4. Fibers, scheduling, time, and testing

| Module or guide | Reference | General use |
| --- | --- | --- |
| `Fiber` | [references/Fiber.md](references/Fiber.md) | Represents a lightweight running effect that can be awaited, interrupted, supervised, or inspected. |
| `FiberSet` | [references/FiberSet.md](references/FiberSet.md) | Tracks a set of fibers so applications can add work and interrupt or await the set as a unit. |
| `FiberMap` | [references/FiberMap.md](references/FiberMap.md) | Tracks running fibers by application key for keyed lifecycle management. |
| `FiberHandle` | [references/FiberHandle.md](references/FiberHandle.md) | Owns a replaceable fiber handle for starting, joining, interrupting, and observing one piece of background work. |
| `Schedule` | [references/Schedule.md](references/Schedule.md) | Describes recurring timing and retry or repetition policies that drive effect execution. |
| `Clock` | [references/Clock.md](references/Clock.md) | Provides the current time and sleep operations through an injectable clock service. |
| `TestClock` | [references/TestClock.md](references/TestClock.md) | Replaces real time in tests so scheduled effects can advance deterministically without waiting. |
| `Duration` | [references/Duration.md](references/Duration.md) | Represents time spans and supports constructing, comparing, and transforming timing values. |
| `DateTime` | [references/DateTime.md](references/DateTime.md) | Represents calendar date-time values for calculations and application data. |
| `FastCheck` | [references/FastCheck.md](references/FastCheck.md) | Provides property-based testing support through the fast-check integration exposed by effect/testing. |
| `TestConsole` | [references/TestConsole.md](references/TestConsole.md) | Captures Effect console output in tests so assertions can inspect logs without writing to the host console. |

### 5. Domain data, types, and collections

| Module or guide | Reference | General use |
| --- | --- | --- |
| `Schema` | [references/Schema.md](references/Schema.md) | Defines runtime-checked data models for decoding external input, encoding output, and deriving TypeScript types. |
| `Data` | [references/Data.md](references/Data.md) | Defines structural and tagged data values with predictable equality and hashing behavior. |
| `Array` | [references/Array.md](references/Array.md) | Provides immutable array transformations, safe lookups, non-empty array types, and collection utilities. |
| `Iterable` | [references/Iterable.md](references/Iterable.md) | Provides lazy iteration, range, search, transformation, grouping, and folding utilities. |
| `Record` | [references/Record.md](references/Record.md) | Provides typed immutable transformations and lookups for string- or symbol-keyed records. |
| `Tuple` | [references/Tuple.md](references/Tuple.md) | Constructs and transforms fixed-position arrays while preserving tuple element types. |
| `Brand` | [references/Brand.md](references/Brand.md) | Adds nominal meaning to structural TypeScript values so distinct domain identifiers are not mixed accidentally. |
| `Types` | [references/Types.md](references/Types.md) | Provides type-level helpers for expressing and transforming generic TypeScript relationships without runtime data. |
| `Struct` | [references/Struct.md](references/Struct.md) | Provides helpers for working with record-like object values and their fields. |
| `Predicate` | [references/Predicate.md](references/Predicate.md) | Provides reusable type guards and boolean predicates for narrowing and classifying values. |
| `Match` | [references/Match.md](references/Match.md) | Builds composable pattern matches that narrow inputs and make tagged branching explicit. |
| `Graph` | [references/Graph.md](references/Graph.md) | Models immutable directed or undirected graphs with data-bearing nodes and edges and common traversals. |
| `Equivalence` | [references/Equivalence.md](references/Equivalence.md) | Defines reusable equality relations for comparing values according to domain-specific rules. |
| `Order` | [references/Order.md](references/Order.md) | Defines reusable ordering relations for sorting and comparing values. |
| `Chunk` | [references/Chunk.md](references/Chunk.md) | Represents an efficient immutable sequence for batching, transforming, and traversing values. |
| `HashMap` | [references/HashMap.md](references/HashMap.md) | Provides immutable hash-map collections for keyed lookup, update, and traversal. |
| `HashSet` | [references/HashSet.md](references/HashSet.md) | Provides immutable hash-set collections for membership, insertion, removal, and traversal. |
| `Request` | [references/Request.md](references/Request.md) | Describes a typed request value that can be executed directly or handled through a RequestResolver. |
| `Redacted` | [references/Redacted.md](references/Redacted.md) | Wraps sensitive values so application code can carry them while avoiding accidental exposure in ordinary display or logging. |

### 6. Streams and host I/O

| Module or guide | Reference | General use |
| --- | --- | --- |
| `Stream` | [references/Stream.md](references/Stream.md) | Processes values incrementally with composable transformations, effects, backpressure, and scoped cleanup. |
| `Sink` | [references/Sink.md](references/Sink.md) | Consumes a Stream and describes how to fold, collect, or otherwise finish its elements. |
| `Channel` | [references/Channel.md](references/Channel.md) | Provides a low-level abstraction for direct pull, push, backpressure, and bidirectional stream composition. |
| `Console` | [references/Console.md](references/Console.md) | Provides an injectable console service for application logging and host-facing output. |
| `FileSystem` | [references/FileSystem.md](references/FileSystem.md) | Provides an injectable file-system service for effectful file, directory, and stream-based file operations. |
| `Path` | [references/Path.md](references/Path.md) | Provides an injectable path service for joining, resolving, and manipulating platform paths. |

### 7. External boundaries, persistence, and operations

| Module or guide | Reference | General use |
| --- | --- | --- |
| `HttpApi` | [references/HttpApi.md](references/HttpApi.md) | Describes schema-backed HTTP API contracts that can be implemented by a server and consumed by a client. |
| `HttpApiEndpoint` | [references/HttpApiEndpoint.md](references/HttpApiEndpoint.md) | Declares one schema-backed HTTP route with its method, path, request parts, successes, and errors. |
| `HttpApiBuilder` | [references/HttpApiBuilder.md](references/HttpApiBuilder.md) | Turns an HttpApi contract and typed handlers into router layers with request decoding and response encoding. |
| `HttpApiClient` | [references/HttpApiClient.md](references/HttpApiClient.md) | Derives typed client methods and URL builders from the endpoint schemas shared with an HttpApi server. |
| `HttpClient` | [references/HttpClient.md](references/HttpClient.md) | Provides an injectable HTTP client with composable request, response, retry, rate-limit, cookie, and scope policies. |
| `HttpServer` | [references/HttpServer.md](references/HttpServer.md) | Defines the injectable server service and layers that connect an HTTP response effect to a running server. |
| `HttpRouter` | [references/HttpRouter.md](references/HttpRouter.md) | Registers typed routes and middleware, decodes request data, and turns an application layer into an HTTP handler. |
| `SqlClient` | [references/SqlClient.md](references/SqlClient.md) | Provides an injectable SQL client boundary for executing database operations inside effects. |
| `SqlSchema` | [references/SqlSchema.md](references/SqlSchema.md) | Connects SQL statements with schema-based input and output decoding for typed database workflows. |
| `Migrator` | [references/Migrator.md](references/Migrator.md) | Runs ordered database migrations and coordinates the state needed to bring a schema up to date. |
| `KeyValueStore` | [references/KeyValueStore.md](references/KeyValueStore.md) | Provides a key-value persistence boundary for storing and retrieving encoded application data. |
| `PersistedCache` | [references/PersistedCache.md](references/PersistedCache.md) | Extends scoped in-memory caching with a named persistent store, expiration, and invalidation. |
| `PersistedQueue` | [references/PersistedQueue.md](references/PersistedQueue.md) | Provides named schema-encoded queues whose items can survive process boundaries and be retried after failure. |
| `RateLimiter` | [references/RateLimiter.md](references/RateLimiter.md) | Applies fixed-window or token-bucket consumption rules to limit effectful work and optionally delay it. |
| `Rpc` | [references/Rpc.md](references/Rpc.md) | Defines schema-backed procedures whose payload, success, failure, and transport metadata form a shared contract. |
| `RpcClient` | [references/RpcClient.md](references/RpcClient.md) | Derives typed RPC client methods and supplies protocol layers for communicating with an RPC endpoint. |
| `RpcServer` | [references/RpcServer.md](references/RpcServer.md) | Runs typed RPC handlers and exposes them through HTTP, WebSocket, socket, standard-input, or worker protocols. |
| `Config` | [references/Config.md](references/Config.md) | Builds typed configuration descriptions that load and validate values from a ConfigProvider. |
| `ConfigProvider` | [references/ConfigProvider.md](references/ConfigProvider.md) | Supplies the environment-backed lookup implementation used to resolve Config descriptions. |
| `Logger` | [references/Logger.md](references/Logger.md) | Defines structured logging services, levels, annotations, and formatting for application diagnostics. |
| `Tracer` | [references/Tracer.md](references/Tracer.md) | Provides tracing context and span instrumentation for following work across effect boundaries. |
| `Metric` | [references/Metric.md](references/Metric.md) | Defines counters, gauges, histograms, and other measurements for operational telemetry. |

The table is an index. Keep module API content, source links, and examples in
the linked reference file rather than in this skill entrypoint.

### Top-level and utility exports

Inspect package-root exports and utility modules before assuming every API is `Topic.method`; verify each name against the consuming package declarations as root-level, namespaced, or both.

These are recipe guides, not module catalogs. Keep them compact and link each
recipe to the exact local website recipe and pinned source that support it.
