# Consumer ergonomics

Ask one question before choosing an Effect feature:

> How does using Effect make life easier for the consumer?

A good Effect API removes something callers would otherwise have to remember, wire, validate,
catch, clean up, or coordinate while keeping the remaining semantics visible in `A`, `E`, and `R`.
If a primitive only helps the implementation, hide it behind an ordinary function, service, Stream,
or scoped callback.

## Contents

- [Accept useful inputs and return domain values](#accept-useful-inputs-and-return-domain-values)
- [Make outcomes easy to consume](#make-outcomes-easy-to-consume)
- [Remove dependency and policy plumbing](#remove-dependency-and-policy-plumbing)
- [Hide coordination machinery](#hide-coordination-machinery)
- [Own lifetimes and host boundaries](#own-lifetimes-and-host-boundaries)
- [Review the consumer surface](#review-the-consumer-surface)

## Accept useful inputs and return domain values

### IF Effect already has an input type whose forms are meaningful here

- **THEN:** Accept it and normalize once inside the API.
- **CONSUMER GAIN:** Callers use readable literals instead of constructing wrappers or converting
  units.
- **CHECK:** Reject forms the domain does not support after normalization.

```ts
import { Duration, Effect, Schedule } from "effect";

export const pollEvery = (interval: Duration.Input) =>
  poll.pipe(Effect.repeat(Schedule.spaced(interval)));

pollEvery("10 seconds");
pollEvery({ minutes: 1 });
pollEvery(Duration.seconds(30));
```

Validate positive-finite requirements after normalization. For dynamic configuration or wire input,
decode at the boundary with `Config.duration` or the relevant Schema codec; keep exact accepted forms
in the [Duration](../../effect-api-documentation/references/Duration.md),
[Config](../../effect-api-documentation/references/Config.md), and
[Schema](../../effect-api-documentation/references/Schema.md) references.

### IF unknown input crosses HTTP, CLI, storage, or message boundaries

- **THEN:** Decode once into the final domain type, including brands, transformations, defaults,
  and `Option` fields.
- **CONSUMER GAIN:** Handlers and services never repeat parsing, coercion, range checks, or brand
  constructors.
- **CHECK:** Use `decodeUnknownEffect` when decoding needs services; service-free Result, Option,
  synchronous, and Promise adapters must not silently discard those requirements.

```ts
import { Schema } from "effect";

const UserId = Schema.String.pipe(Schema.brand("UserId"));
export const decodeUserId = Schema.decodeUnknownEffect(UserId);
```

For shared HTTP protocols, prefer one schema-backed contract that owns decoding, typed errors, and
client/server adaptation; keep CLI parsing at the CLI boundary. See the
[Schema](../../effect-api-documentation/references/Schema.md) and
[HttpApi](../../effect-api-documentation/references/HttpApi.md) references.

### IF application configuration is currently read and parsed at use sites

- **THEN:** Declare one typed `Config` value and yield it where the owning Layer is built.
- **CONSUMER GAIN:** Callers stop reading environment variables, coercing strings, assembling
  missing-key errors, and accidentally printing secrets.
- **CHECK:** `withDefault` and `option` handle missing data; broad `orElse` can hide malformed
  deployment values. Keep `ConfigProvider` at the composition root.

```ts
import { Config, ConfigProvider, Duration, Effect } from "effect";

const AppConfig = Config.all({
  timeout: Config.duration("REQUEST_TIMEOUT").pipe(Config.withDefault(Duration.seconds(5))),
  token: Config.redacted("API_TOKEN"),
});

const program = Effect.gen(function* () {
  return yield* AppConfig;
}).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv())));
```

Choose `ConfigProvider` at the composition root; use `withDefault` only for missing values and keep
secrets redacted until the adapter that needs them. See [Config](../../effect-api-documentation/references/Config.md)
and [ConfigProvider](../../effect-api-documentation/references/ConfigProvider.md).

## Make outcomes easy to consume

### IF an operation can fail, needs services, or can be interrupted

- **THEN:** Return its exact `Effect<A, E, R>`.
- **CONSUMER GAIN:** Callers see what succeeds, what they may recover, and what they must provide;
  operators remove handled errors and provided services from the inferred type.
- **CHECK:** Do not widen to `unknown`/`any`, hide services in globals, or convert to Promise before
  the host edge.

```ts
import { Context, Data, Effect, Layer } from "effect";

class UserMissing extends Data.TaggedError("UserMissing")<{ readonly id: string }> {}

class Users extends Context.Service<
  Users,
  {
    readonly find: (id: string) => Effect.Effect<User, UserMissing>;
  }
>()("app/Users") {}

export const loadUser = Effect.fn("Users.load")(function* (id: string) {
  return yield* (yield* Users).find(id);
});

declare const UsersLive: Layer.Layer<Users>;

const runnable = loadUser("42").pipe(
  Effect.catchTag("UserMissing", ({ id }) => Effect.succeed(guestUser(id))),
  Effect.provide(UsersLive),
);
// Effect<User>
```

Use `Effect.fn("Name")` for an intentional trace boundary; use `Effect.fnUntraced` for an ordinary
reusable function that only wraps a generator.
Use `Function.dual` only for library operators whose data-first and data-last forms are both common;
optional parameters need predicate dispatch because arity dispatch counts supplied arguments.

See [Effect functions](../../effect-api-documentation/references/Effect.md).

### IF callers branch over a closed domain union

- **THEN:** Use `Match.typeTags`, `Match.tagsExhaustive`, or another exhaustive matcher.
- **CONSUMER GAIN:** Adding a variant breaks every incomplete consumer at compile time instead of
  falling into a default branch.
- **CHECK:** Use `Match.option` or `Match.result` when partial matching is intentional;
  `orElseAbsurd` is a runtime fallback, not proof of compile-time completeness.

```ts
import { Match } from "effect";

const renderState = Match.typeTags<State, string>()({
  Idle: () => "idle",
  Loading: () => "loading",
  Failed: ({ message }) => message,
});
```

### IF several operations return independently useful values or failures

- **THEN:** Choose a collection result contract deliberately.
- **CONSUMER GAIN:** Callers receive named values or accumulated outcomes without tuple indexing,
  manual loops, or error bookkeeping.
- **CHECK:** These policies capture typed failures; defects and interruption do not become ordinary
  Result values.

```ts
import { Effect } from "effect";

const page = Effect.all(
  {
    user: loadUser(userId),
    settings: loadSettings(userId),
  },
  { concurrency: 2 },
);

const outcomes = Effect.all(
  {
    user: loadUser(userId),
    settings: loadSettings(userId),
  },
  { mode: "result", concurrency: 2 },
);
```

Use named `Effect.all` for fail-fast results, `{ mode: "result" }` for per-operation outcomes, and
`partition`, `validate`, or `forEach` when their distinct continuation policies are required. See
[Effect collections](../../effect-api-documentation/references/Effect.md).

### IF absence or timeout is part of the domain contract

- **THEN:** Choose whether it means optional success, typed failure, or fallback before choosing an
  operator.
- **CONSUMER GAIN:** Callers don't write branches, `Promise.race`, timer disposal, or loser
  cancellation, and the chosen meaning remains visible in the return type.
- **CHECK:** Translate generic `NoSuchElementError` and timeout errors when the domain owns a more
  useful error.

```ts
import { Effect } from "effect";

const bounded = operation.pipe(Effect.timeout("2 seconds"));
```

Choose `timeoutOption`, `timeoutOrElse`, or `fromOption` only when their domain result is intended;
keep purely synchronous composition in `Option` or `Result`. See [Effect outcomes](../../effect-api-documentation/references/Effect.md).

## Remove dependency and policy plumbing

### IF a value is established once for the current request or operation

- **THEN:** Provide it as a contextual service at the boundary.
- **CONSUMER GAIN:** Deep code yields `CurrentUser`, tenant, correlation, or transaction context
  without threading it through unrelated intermediate parameters.
- **CHECK:** Ordinary operation data still belongs in arguments; a service represents a contextual
  or substitutable capability.

Middleware can decode credentials once and provide `CurrentUser`; protected operations then write
`yield* CurrentUser` and retain the missing-auth error or service requirement in their types. Layers
scale the same idea across application services: construct, share, and release once, then replace
one capability in tests without global mocks or alternate function signatures.

### IF callers should customize timing, retry, or concurrency

- **THEN:** Expose a small policy object with stable defaults, using `Duration.Input`, concurrency
  types, or `Schedule` only when that full expressiveness is part of the contract.
- **CONSUMER GAIN:** Callers state intent while loops, counters, clocks, jitter, and cancellation
  stay private.
- **CHECK:** Retry only classified transient failures; a raw Schedule exposes output, failure, and
  service semantics that many domain consumers shouldn't own.

```ts
import { Effect, Schedule } from "effect";

const transient = Schedule.exponential("100 millis").pipe(Schedule.jittered);

request.pipe(Effect.retry({ while: isTransient, schedule: transient, times: 4 }));
```

### IF logging, tracing, or correlation currently appears in every signature

- **THEN:** Add named Effect boundaries and contextual annotations; choose exporters and formatting
  in a Layer.
- **CONSUMER GAIN:** Callers invoke the domain function normally while lower services inherit spans
  and log context, so no logger, tracer, timer, or correlation callback is threaded through APIs.
- **CHECK:** Keep raw `Logger`, `Tracer`, and `Span` out of domain signatures unless they are the
  domain contract.

```ts
loadUser(id).pipe(Effect.annotateLogs("requestId", requestId), Effect.withSpan("http.loadUser"));
```

## Hide coordination machinery

### IF repeated lookups need coalescing, caching, or batching

- **THEN:** Hide `Cache` and `RequestResolver` behind an ordinary service method.
- **CONSUMER GAIN:** Callers keep writing `users.find(id)` and normal concurrent composition; they
  don't build Promise maps, TTL timers, batch windows, deduplication, or result correlation.
- **CHECK:** Cached failures and TTL change observable semantics. Return a Cache only when callers
  genuinely own invalidation, refresh, inspection, and key identity.

```ts
const result = Effect.gen(function* () {
  const users = yield* Users;
  return yield* Effect.forEach(ids, users.find, { concurrency: "unbounded" });
});
```

The implementation may coalesce misses through `Cache` or `RequestResolver`; neither mechanism
belongs at this call site. Keep refresh, leasing, health, and cleanup behind the service API. See
[Cache](../../effect-api-documentation/references/Cache.md),
[RequestResolver](../../effect-api-documentation/references/RequestResolver.md),
[Resource](../../effect-api-documentation/references/Resource.md), and
[Pool](../../effect-api-documentation/references/Pool.md).

### IF concurrent requests can share one backend batch

- **THEN:** Hide a `RequestResolver` behind the domain service and choose delay, grouping, and batch
  bounds in the adapter.
- **CONSUMER GAIN:** Callers keep making ordinary requests; batching and result correlation stay
  private.
- **CHECK:** Prove grouping keys, maximum batch size, delay, cancellation, and per-request failures.

### IF an API produces values over time

- **THEN:** Return a domain `Stream<A, E, R>`.
- **CONSUMER GAIN:** Each caller chooses filtering, buffering, debouncing, collection, iteration, or
  host adaptation without owning listener registration, backpressure, cancellation, or cleanup.
- **CHECK:** A single finite answer should remain Effect; do not expose Queue, PubSub, or
  SubscriptionRef merely because the implementation uses them.

```ts
import { Stream } from "effect";

const recent = watchOrders().pipe(
  Stream.debounce("250 millis"),
  Stream.take(20),
  Stream.runCollect,
);
```

For “current value plus future changes,” back the implementation with `SubscriptionRef.changes` and
return the Stream. That removes the consumer's racy `get()` then `subscribe()` sequence while keeping
mutation and shutdown private.

### IF state must survive process boundaries

- **THEN:** Use `KeyValueStore` for durable keyed data or `PersistedQueue` for retryable work, and
  select the backend Layer at the composition root.
- **CONSUMER GAIN:** Domain code keeps typed reads or queue operations while storage, encoding, and
  retry ownership stay behind one capability.
- **CHECK:** These are unstable v4 APIs; verify the pinned package and prove schema compatibility,
  missing keys, retries, and shutdown.

See [KeyValueStore](../../effect-api-documentation/references/KeyValueStore.md) and
[PersistedQueue](../../effect-api-documentation/references/PersistedQueue.md).

### IF a domain operation repeatedly needs lookup, authorization, transaction, and cleanup

- **THEN:** Offer a callback combinator such as `groups.with(id, use)` that preserves the callback's
  `A`, `E`, and `R`.
- **CONSUMER GAIN:** The caller describes work with the resolved entity; the API owns find-or-fail,
  authorization, transaction scope, tracing, and release.
- **CHECK:** Do not bury recovery decisions the caller genuinely owns or convert expected failures
  to defects merely to shrink `E`.

## Own lifetimes and host boundaries

### IF every use must acquire and release a resource

- **THEN:** Export a bracketed callback operation; retain `Scope` in `R` only when callers must
  compose several operations over the live resource.
- **CONSUMER GAIN:** Consumers cannot forget cleanup, even on typed failure, defect, interruption,
  or timeout.
- **CHECK:** Name one owner for every resource, subscription, fiber, cache, runtime, and listener.

```ts
export const withConnection = <A, E, R>(use: (connection: Connection) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(openConnection, use, closeConnection);
```

Use `Effect.tryPromise` or `Effect.callback` at the adapter so consumers can compose timeout and
cancellation without owning AbortControllers, unsubscribe registries, or `finally` blocks. See
[Effect boundaries](../../effect-api-documentation/references/Effect.md).

### IF a Promise, framework, process, or browser host executes the program

- **THEN:** Keep the core Effect-native and adapt once at that edge.
- **CONSUMER GAIN:** Effect callers retain composition and cancellation, while host callers receive
  the Promise, response, exit code, or event protocol they understand.
- **CHECK:** Give a `ManagedRuntime` one host owner; don't expose it or construct/dispose it per
  request.

Reuse one host-owned `ManagedRuntime` and translate only at the final boundary. See
[ManagedRuntime](../../effect-api-documentation/references/ManagedRuntime.md) and
[HttpApi](../../effect-api-documentation/references/HttpApi.md).

### IF tests currently need globals, real sleeps, or production-only hooks

- **THEN:** Put dependencies behind services and time behind Effect's Clock, then replace Layers and
  advance `TestClock`.
- **CONSUMER GAIN:** Test authors substitute one capability at the provision edge and run time-based
  behavior instantly; they don't monkeypatch modules, reset globals, inject `now`, or wait.
- **CHECK:** A partial mock proves the exercised methods only; retain integration proof for the full
  Layer and its cleanup.

## Review the consumer surface

For every exported API, finish this sentence:

> Because this API uses Effect, its consumer no longer has to _____; the remaining _____ is visible
> in the type or options.

Reject the design if the blank is only “use our Queue/Cache/Fiber/Runtime wrapper.” Those are usually
implementation tools. Return them only when scheduling, mutation, invalidation, or ownership is the
caller's actual domain responsibility.

Check these from a real external call site:

- Inputs arrive in useful forms and decode once into the final domain type.
- Success values retain names, brands, defaults, and narrow types.
- Absence, timeout, partial success, and typed failure have deliberate contracts.
- Recovery removes only handled errors from `E`; provision removes only supplied services from `R`.
- Batching, caching, retries, tracing, subscriptions, and cleanup stay private unless callers own
  their policy.
- Effect and host adapters share one implementation and one error translation policy.
- Tests substitute services, control time, and prove interruption and cleanup without special
  production hooks.

## API handoff

Keep this skill use-case-first. Use the [Effect API documentation index](../../effect-api-documentation/SKILL.md)
and its per-module references for exact exports, signatures, member semantics, and version checks;
use `codebases/effect-v4` only to validate the selected composition and the consuming package for
the final version.
