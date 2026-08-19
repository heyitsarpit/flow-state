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

`Duration.Input` also accepts numbers as milliseconds, bigints as nanoseconds, tuples, additive
objects, negative values, and infinity. Validate positive-finite requirements after normalization.
A dynamic string from config or the wire should use `Config.duration` or
`Schema.DurationFromString`; the template-literal type only checks literal strings. Treat
`DateTime.Input` more cautiously because it accepts arbitrary strings, epoch numbers, and partial
date objects; domain operations usually benefit from accepting `DateTime` after boundary decoding.

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
export type UserId = typeof UserId.Type;

export const decodeUserId = Schema.decodeUnknownEffect(UserId);

class CreateUser extends Schema.Class<CreateUser>("CreateUser")({
  email: Schema.String,
  displayName: Schema.optionalKey(Schema.String),
}) {}
```

When the same protocol has client and server consumers, prefer one declarative HTTP contract that
owns path and payload decoding, success and error schemas, middleware, generated client methods,
and OpenAPI. The payoff is a call such as `client.users.get({ path: { id } })`, with no method/URL,
JSON, status, or DTO drift at the call site. The same rule applies to typed CLI declarations: parse,
defaults, aliases, cardinality, prompts, and help should produce a ready handler input rather than
an `argv` array.

### IF application configuration is currently read and parsed at use sites

- **THEN:** Declare one typed `Config` value and yield it where the owning Layer is built.
- **CONSUMER GAIN:** Callers stop reading environment variables, coercing strings, assembling
  missing-key errors, and accidentally printing secrets.
- **CHECK:** `withDefault` and `option` handle missing data; broad `orElse` can hide malformed
  deployment values. Keep `ConfigProvider` at the composition root.

```ts
import { Config, Duration, Effect, Redacted } from "effect";

const AppConfig = Config.unwrap({
  timeout: Config.duration("REQUEST_TIMEOUT").pipe(Config.withDefault(Duration.seconds(5))),
  token: Config.redacted("API_TOKEN"),
});

const program = AppConfig.pipe(
  Effect.map(({ timeout, token }) => ({ timeout, token: Redacted.value(token) })),
);
```

Use `Redacted<A>` in public inputs when a password or token must remain hard to log or inspect by
accident. Unwrap it only at the adapter that needs the raw value.

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

Use `Effect.fn("Name")` for ordinary callable domain functions that deserve a trace boundary.
Use `Function.dual` only for library operators whose data-first and data-last forms are both common;
optional parameters need predicate dispatch because arity dispatch counts supplied arguments.

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

- `Effect.all(record)` preserves names and fails fast.
- `Effect.all(record, { mode: "result" })` preserves each name with its `Result<A, E>`.
- `Effect.partition` returns all failures and successes but loses input association unless values
  carry identity.
- `Effect.validate` returns successes only when every operation succeeds, otherwise it fails with
  a non-empty collection of errors.
- `Effect.forEach` replaces a manual async loop and can declare concurrency or `discard: true`.

### IF absence or timeout is part of the domain contract

- **THEN:** Choose whether it means optional success, typed failure, or fallback before choosing an
  operator.
- **CONSUMER GAIN:** Callers don't write branches, `Promise.race`, timer disposal, or loser
  cancellation, and the chosen meaning remains visible in the return type.
- **CHECK:** Translate generic `NoSuchElementError` and timeout errors when the domain owns a more
  useful error.

```ts
import { Effect } from "effect";

Effect.fromOption(cache.get(id), () => new UserMissing({ id }));

operation.pipe(Effect.timeout("2 seconds"));
operation.pipe(Effect.timeoutOption("2 seconds"));
operation.pipe(
  Effect.timeoutOrElse({
    duration: "2 seconds",
    orElse: () => cachedValue,
  }),
);
```

Keep purely synchronous composition in `Option` or `Result`; `Option.all`, `Result.all`, their
generators, and `Result.try` avoid introducing Effect when there is no async, dependency, time, or
lifetime behavior.

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
const users = yield * Users;

const result =
  yield *
  Effect.forEach(ids, users.find, {
    concurrency: "unbounded",
  });
```

The implementation may coalesce concurrent misses through `Cache.get` or turn independent
`Effect.request` calls into one resolver batch. Neither mechanism needs to appear at this call site.
The same rule applies to refreshable values and pools: expose `catalog.current`/`catalog.refresh` or
`withConnection(use)`, while `Resource` and `Pool` retain scheduling, replacement, leasing, health,
and cleanup internally.

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
return the Stream. That removes the consumer's racy `get()` then `subscribe()` sequence while
keeping mutation and shutdown private.

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

Use `Effect.tryPromise({ try: signal => ..., catch })` for abortable Promise APIs and
`Effect.callback` with interruption cleanup for callback APIs. Then consumers can apply timeout or
cancellation without constructing `AbortController`, unsubscribe registries, or `finally` blocks.

### IF a Promise, framework, process, or browser host executes the program

- **THEN:** Keep the core Effect-native and adapt once at that edge.
- **CONSUMER GAIN:** Effect callers retain composition and cancellation, while host callers receive
  the Promise, response, exit code, or event protocol they understand.
- **CHECK:** Give a `ManagedRuntime` one host owner; don't expose it or construct/dispose it per
  request.

```ts
export const loadUserPromise = (id: string) => runtime.runPromise(loadUser(id));
```

An Effect HTTP contract can remove more host work than a raw framework adapter: it keeps wire
decoding, typed errors, client generation, middleware, and OpenAPI in one definition. Use the raw
adapter when the foreign framework is fixed, but count its manual parsing and translation as a
consumer cost.

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

## Source anchors

Use the vendored Effect v4 checkout for design discovery, then verify imports and behavior against
the consuming project's installed version.

- Effect v4 [Config.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Config.ts),
  [Duration.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Duration.ts),
  [Effect.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Effect.ts),
  [Match.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Match.ts),
  and [Schema.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Schema.ts)
  for inputs, decoding, outcomes, matching, timeout, retry, and cancellation.
- Effect v4 [Cache.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Cache.ts),
  [RequestResolver.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/RequestResolver.ts),
  [Resource.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Resource.ts),
  [Stream.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/Stream.ts),
  and [SubscriptionRef.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts)
  for hidden coordination and multi-value APIs.
- Effect v4 [HTTP client](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/50_http-client/10_basics.ts),
  [HTTP contract](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/51_http-server/10_basics.ts),
  [batching](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/05_batching/10_request-resolver.ts),
  and [tests](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/09_testing/20_layer-tests.ts)
  for complete consumer call sites.
- Phoenix [CurrentUser.ts](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/packages/fate-effect/src/CurrentUser.ts),
  [Walk.ts](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/packages/fate-effect/src/Walk.ts),
  and [orphan-sweep CLI](/Users/arpit/Developer/flow-state/docs/codebases/phoenix/packages/orphan-sweep/src/bin.ts)
  for contextual auth, transparent request batching, and typed CLI inputs.
- Effect examples [TodosApi.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-examples/templates/monorepo/packages/domain/src/TodosApi.ts),
  [TodosClient.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-examples/templates/monorepo/packages/cli/src/TodosClient.ts),
  [GitHub.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-examples/packages/create-effect-app/src/GitHub.ts),
  and [Groups.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-examples/examples/http-server/src/Groups.ts)
  for contract-derived clients, Stream/Sink pipelines, and domain callback combinators.
- Accountability [AuthMiddleware.ts](/Users/arpit/Developer/flow-state/docs/codebases/accountability/packages/api/src/Definitions/AuthMiddleware.ts)
  and [MembershipApi.ts](/Users/arpit/Developer/flow-state/docs/codebases/accountability/packages/api/src/Definitions/MembershipApi.ts)
  for request-scoped services and a useful counterexample where unbranded paths force repeated
  handler decoding. These codebases may use older Effect versions; copy the design, then recheck the
  exact v4 symbol.
