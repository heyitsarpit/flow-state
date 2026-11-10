# The lint-bomb style

Start with [the TypeScript reference](examples/style.ts), [booking demo](examples/booking.ts),
and [routing-policy demo](examples/routing.ts).
Run `nub run demo` or `nub run demo:policy`.
`nub run check:demo` checks the examples against types, behavior, and all current lint-bomb rules.
Examples target pinned Effect 4.0.5. HTTP and SQL recipes need real adapter Layers.

Draft for review. Guides future rule prescriptions; existing rules may need alignment.

Build from records, closed variants, exhaustive handling, functions, and owned services.
Prefer representations that prevent invalid states. Add primitives only for required behaviors.

## Choose the feature by its job

| Reach for                | When you need                                                          | Example in `style.ts`          |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------ |
| Plain record or function | Trusted facts or a deterministic calculation                           | `describeState`                |
| `Data`                   | Trusted domain variants, value equality, or internal tagged errors     | `JobState`, `Unavailable`      |
| `Schema`                 | Runtime validation, refinements, construction, or encoding/decoding    | `Request`, `Command`, `Person` |
| `Context.Service`        | An injectable capability, shared state owner, or contextual dependency | `Counter`, `Settings`          |
| `Layer`                  | Construction, dependency wiring, and resource lifetime for services    | `CounterLive`, `SettingsLive`  |

### Alternative Service implementations

Declare one capability contract with `Context.Service`; supply alternative implementations as Layers.
Keep the consumer dependent on the Service, never on a concrete Layer or an implementation switch.
Use `Layer.succeed` for an already constructed implementation and `Layer.effect` when construction
needs capabilities or resources. Preserve each Layer's construction errors and remaining requirements.
Matching TypeScript shapes are necessary; shared public-boundary checks establish behavioral agreement.
A memory implementation does not prove the real adapter works: exercise the real adapter separately too.

[announcements.ts](examples/announcements.ts) supplies memory and filesystem implementations of one
`AnnouncementSource`. [Its tests](examples/announcements.test.ts) run the same consumer and schema
expectations against both, using actual files for the filesystem implementation.

### Data or Schema?

Use `Data.TaggedEnum` for alternatives created inside trusted code.
Its constructors do not validate inputs.
Use `Schema.TaggedUnion` when those alternatives need a runtime admission or serialization contract.
Once Schema owns the variants, use its constructors and matching helpers; avoid a parallel Data
model.
Keep simple records plain unless value equality, constructors, or runtime contracts add needed
behavior.
Use `Data.TaggedError` for internal expected failures; use `Schema.TaggedError` for encoded error
contracts.

Use Schema inside the application when construction must enforce runtime relationships.
A schema-backed class models a validated value. Having methods does not make that value a service.

### Value or Service?

Pass IDs, commands, payloads, and per-operation options as arguments.
Use a service for a reusable capability such as storage, a clock, or an owned application counter.
Services can be stateless; injection or resource ownership can justify them without mutable state.
Build state and acquire resources in the owning Layer.
Register scoped release when acquisition needs cleanup.
Use plain functions for pure transformations without an injected capability.

The demo combines these roles: Schema admits a BookingRequest, BookingLedger owns reservations,
and Data models BookingOutcome.
A service can accept schema-defined values and return Data variants. These roles work together.
BookingRequest and BookingOutcome describe different facts; they do not duplicate one contract.

## 1. Model meaning once

| Meaning                             | Default representation                               |
| ----------------------------------- | ---------------------------------------------------- |
| Facts that belong together          | Named records; `Schema.Struct` when admitting data   |
| Mutually exclusive domain cases     | `Data.TaggedEnum` and `Data.taggedEnum` constructors |
| Expected absence                    | `Option`                                             |
| Pure recoverable success or failure | `Result`                                             |
| Total case handling                 | Enum `$match`, `Option.match`, or `Result.match`     |
| A value computed from other values  | A derived view; store only the facts                 |
| A lifecycle with phases             | One closed variant of phases and one transition      |

Put required case-specific fields in their variant, not independent flags and optional fields.
Require every case in total handlers. Adding a variant must force an explicit decision.
`$is` and `isAnyOf` answer one yes/no question; routing four or more variants of a union uses
`$match` with every case named and no catch-all.
Represent partial matches explicitly.

### Store facts, derive views

Store facts; derive views. A fact was decided at a moment (a price paid); a view follows from facts (a total, a count).
Never store a view beside its facts, even in one owner. Cache only when measured, updated by the same transition.
See [booking.ts](examples/booking.ts).

### No implicit state machines

Name every state machine: one closed variant of phases, each holding only its own facts.
Never rebuild a phase from flags, optional fields, or comparisons.
Change phase only in one pure transition, exhaustive over phase and event; refuse unaccepted, late or repeated events explicitly.
See [lifecycle.ts](examples/lifecycle.ts).

Use `Schema` for external or serialized contracts; derive the admitted type and decode once.
Declare each codec once; derive only the parser functions its consumers use.
Reuse parsers at boundaries. Avoid wrappers that only forward to another parser.
Preserve inferred codec types; broad `Schema.Schema<T>` annotations can erase wire and service
types.
Keep conversions in Schema.
Use existing schema-aware HTTP or storage adapters before adding parsers.
Use `Schema.Class` when a value needs a schema-backed constructor and associated behavior.
Keep simple trusted records plain.
Pass checked facts inward without repeating validation.
Classify distinct omission/null/undefined meanings before normalizing through Schema or an adapter.
A tag check does not validate an unknown payload.

Use `Schema.OptionFromOptionalNullOr` when missing, null, and undefined share one absence meaning.
For schema-owned variants, use `Schema.TaggedUnion` or `Schema.toTaggedUnion`.
Derive exhaustive `.match` and typed `.isAnyOf` selection from that union.
These operations consume admitted values; they do not validate unknown payloads.

Express field constraints with `.check` and refinements; use `Schema.makeFilter` for relationships.
Attach relational failures to the responsible fields.
Preserve deliberate error ordering or accumulation.
Use `Schema.NonEmptyArray` when empty is invalid.
Use finite-key `Schema.Record` for complete tables.

Derive related schemas with `.mapFields` and `Struct.pick`.
Preserve required relational checks explicitly.
Parent-level checks are dropped by default. Use `Schema.toType` for the decoded representation.
Use `Schema.withDecodingDefaultKey` when omission has a defined admission default.
Use `Schema.withConstructorDefault` for construction defaults.
These do not establish decoding defaults.
Keep meaningful absence as `Option`.

### Encoding and decoding

| Boundary                              | Default API                          |
| ------------------------------------- | ------------------------------------ |
| Unknown object into Effect            | `Schema.decodeUnknownEffect(schema)` |
| Typed encoded input into Effect       | `Schema.decodeEffect(schema)`        |
| Domain value into encoded output      | `Schema.encodeEffect(schema)`        |
| Synchronous parsing with failure data | `Schema.decodeUnknownResult(schema)` |

Typed parsers still validate. Encoding validates and reverses transformations; it can fail.
Prefer Effect parsers inside Effect workflows.
Use Promise adapters at Promise-based host boundaries.
Use Option adapters only when validation details are unnecessary; Sync adapters throw.
Synchronous adapters cannot execute asynchronous transformations successfully.
Result and Option adapters handle schema mismatches; defects and other failures can still throw.
Decoding and encoding track their service requirements separately.

Use `Schema.fromJsonString(schema)` to combine JSON syntax parsing with schema decoding.
Use `Schema.toCodecJson(schema)` to derive JSON representations for rich domain values.
Compose both when the boundary carries JSON text and needs a canonical JSON representation.
Custom declarations may need serialization annotations.
Derivation cannot invent every representation.
Keep explicit wire encodings when the protocol requires them.

Choose excess-property policy at the boundary: the default strips unknown keys; `"error"` rejects
them.
Use `errors: "all"` when callers need multiple available issues. Keep checks enabled for admission.
Preserve structured schema issues until their presentation or domain translation boundary.

Construct domain values with `.make` or `.makeEffect`; decode their encoded representations with
parsers.
`.make` throws. `.makeEffect` exposes `SchemaIssue.Issue`; Schema Effect parsers use `SchemaError`.
Constructor defaults and decoding defaults remain separate contracts.

Test supported directions and intentional normalization.
`decode(encode(value))` should preserve domain meaning when the codec promises that round trip.
`encode(decode(input))` may normalize input; original JSON text need not be reproduced.
For example, `OptionFromOptionalNullOr` normally encodes `None` as an omitted key.
Test invalid values, relational constraints, and meaningful absence distinctions explicitly.

## 2. Keep transformations plain

Use ordinary functions and collections for deterministic calculations.
Use `pipe` or `.pipe` for clear left-to-right transformations; use `flow` to reuse a composition.
Reserve `Function.dual` for APIs that deliberately support data-first and data-last calls.
Compose functions through meaningful protocol values. Reuse unchanged protocols.
Return complete values; keep ordering, branching, and retry policy at the composition site.
Extract boundaries for real knowledge, ownership, or reuse; remove pass-through wrappers.

Preserve inference, generic relationships, and `Effect<A, E, R>`.
Declare service contracts explicitly. Narrow with schemas or named predicates, not runtime `typeof`.
Use `Predicate` helpers and `Option.isSome`/`isNone` for local narrowing.
Compose present values with `Option.map`/`flatMap` and results with `Result.map`/`flatMap`.
Choose `Array`, `Record`, and `Struct` helpers when their types or semantics improve the operation.
These helpers do not replace complete boundary validation.
Avoid unchecked assertions and parallel handwritten types for schema-owned data.

Avoid internal readonly/freeze boilerplate; preserve public contract guarantees.
Copy and validate caller-owned values when a boundary retains them. Return detached mutable records
when callers must not be able to change retained facts. Readonly types alone do not provide runtime isolation.
`Data` does not own transitions or resource lifetimes.

## 3. Services own application state and lifetimes

Use `Context.Service` and `Layer` for mutable application state and capabilities needing injection
or lifecycle ownership. Extend an existing owner before introducing another.
Keep pure helpers plain.
Allocate state when the Layer builds. Expose domain operations instead of mutable collections.
Keep operation inputs as arguments. Service identities, lazy Layers, and static lookup tables may
live at module scope; mutable application instances must not.

Follow the [Effect AI service examples](https://github.com/Effect-TS/effect/blob/main/ai-docs/src/01_effect/03_services/01_service.ts):
declare an explicit `Context.Service<Self, Shape>` contract and construct it through a Layer.
Define reusable operations inside construction, then return `Service.of({ operations })`.
Use named `Effect.fn` for useful trace boundaries and `Effect.fnUntraced` for small internal operations.
Do not require a separate `make` member. Include the package and module path in Service identifiers.

Use `.layer` for service construction; the inferred Layer type records remaining dependencies.
Use the explicit Service name in `Layer.effect` and `Layer.succeed`, not `this`.
For alternatives, use named implementations that each expose `.layer`, such as
`AnnouncementMemory.layer(text)` and `AnnouncementFile.layer(path)`.
Keep small implementations in the same module; separate them when an actual module boundary helps.
Use `Layer.unwrap` only when an Effect or configuration must choose the implementation.

Construct services with `Layer.effect`; use `Layer.succeed` for existing stateless implementations.
Wire dependencies with `Layer.provide`; merge independent services with `Layer.mergeAll`.
Use `Layer.provideMerge` to retain dependency outputs.
Capture stable dependencies during construction; supply request context at its boundary.
Reuse the same Layer value for shared construction in one graph; factory calls create distinct Layers.
Separate `Effect.provide` executions ordinarily build separate instances.
`Layer.fresh` changes sharing, not lifetime.

Read typed configuration through `Config` and `ConfigProvider` during construction.
Use `Config.schema(schema, path)` to reuse Schema rules for provider-supplied configuration.
Keep secrets in `Redacted` until their foreign boundary.

Represent one protocol with one coherent state value. Recheck changing-state facts and publish
the decision atomically through their owner. Use `Ref.modify` when a Ref owns the transition;
keep external work outside that callback.
Register resource release during acquisition with `Effect.acquireRelease` in the owning scope.
Use `Scope` and `Effect.forkScoped` to own resource and background-work lifetimes.
Separate application and request scopes. Use `ManagedRuntime` when host code needs repeated Effect
calls; dispose it at a supported host shutdown boundary.
Effect processes use a platform runner such as `NodeRuntime.runMain`.

## 4. Compose execution and failures

- Use `Effect.sync` for synchronous side effects not expected to throw.
- Use `Effect.gen` for inline workflows when yielded sequencing makes control flow clearer.
- Use `Effect.fnUntraced` for reusable generators; named `Effect.fn` adds a useful trace span.
- Use `Effect.suspend` to defer a factory that returns an Effect.

Prefer reusable function constructors over functions that only wrap and return `Effect.gen`.
Keep a single synchronous operation as `Effect.sync` rather than adding a generator wrapper.
A function returning an existing Effect primitive can remain a plain function.
Construction stays inert. Generator bodies already defer synchronous code.

| Combinator             | Role                                                   |
| ---------------------- | ------------------------------------------------------ |
| `Effect.map`           | Transform success with a pure function                 |
| `Effect.flatMap`       | Choose an Effect from the successful value             |
| `Effect.andThen`       | Sequence subsequent work                               |
| `Effect.tap`           | Perform an Effect while retaining the successful value |
| `Effect.as` / `asVoid` | Deliberately replace or discard the successful value   |

Use pipelines for linear transformations; use generators for clearer branching or dependencies.
Lift a pure `Result` into execution with `Effect.fromResult`; keep the decision itself pure.

| Failure concept    | Meaning and prescription                                                  |
| ------------------ | ------------------------------------------------------------------------- |
| JavaScript `Error` | Exception payload; its class alone does not classify the failure          |
| Expected error `E` | `Data.TaggedError` internally; `Schema.TaggedError` for encoded contracts |
| `Cause<E>`         | Structured typed failures, defects, interruptions, and combined reasons   |
| `Exit<A, E>`       | Complete outcome: success `A` or failure `Cause<E>`                       |

Signal expected failures with `Effect.fail`; use `Effect.die` for invariant defects.
`Data.Error` is untagged; prefer tagged errors for case-specific recovery.
Classify foreign exceptions with `Effect.try` or object-form `Effect.tryPromise` at adapters.
Recover known tags with `Effect.catchTag`/`catchTags`; translate error vocabularies with `mapError`.
Use `Effect.exit` when a supervisor or host needs the complete outcome.
Preserve structured `Cause`, including combined cleanup reasons, until its owner handles it.
An `Error.cause` field does not automatically preserve the execution `Cause`.

Bound growing work and retention. Retry only repeat-safe work with an explicit stopping policy.
Add queues, streams, caches, or synchronization primitives only for a named behavioral requirement.

## 5. Select production tools and prove behavior

| Requirement         | Candidate tools                                                        |
| ------------------- | ---------------------------------------------------------------------- |
| Time and retries    | `Clock`, `Duration`, `Schedule`; `TestClock` in tests                  |
| Work coordination   | Bounded `Effect.forEach`, `Deferred`, scoped fibers                    |
| Continuous data     | `Stream`; `Queue` for handoff, `PubSub` for broadcast                  |
| Network and storage | `HttpApi`/`HttpClient`; `SqlClient` transactions via `withTransaction` |
| Observability       | Named `Effect.fn`, spans, structured logs, `Metric`                    |

Choose these tools only when their contracts fit.

### Time and retry prescription

Use `Schedule` to compose timing policy rather than maintaining retry counters and timer handles.
Use `Effect.retry` for transient failures of repeat-safe work; use `Effect.repeat` for successful polling.
Combine exponential backoff and a spaced schedule with `Schedule.min` to select the shorter delay.
`min` continues while either schedule continues; use `Schedule.upTo` on the result to bound retries.
A retry count excludes the initial attempt. Add `Schedule.jittered` when many clients could retry together;
jitter changes the timing contract, so deterministic tests must control randomness or assert valid bounds.
Use `Schedule.spaced` for delay after completion; use `fixed` for aligned cadence.

Place `Effect.timeoutOrElse` around the entire retry operation for an overall deadline.
A Schedule duration limit is checked between attempts; it cannot interrupt a hung attempt.
Read time through `Clock.currentTimeMillis`; use Effect sleeps instead of native timer bookkeeping.
Timeout and interruption require cooperative adapters whose finalizers terminate; neither undoes remote effects.

See [tracking.ts](examples/tracking.ts) for a read-only carrier workflow and
[tracking.test.ts](examples/tracking.test.ts) for deterministic timing and cleanup evidence.
API references: [Schedule](../skills/suites/effect/effect-api-documentation/references/Schedule.md),
[Clock](../skills/suites/effect/effect-api-documentation/references/Clock.md), and
[TestClock](../skills/suites/effect/effect-api-documentation/references/TestClock.md).
Installed Effect 4.0.5 remains the API authority.

### Calendar-time prescription

Use `DateTime` for instants, named time zones, and calendar boundaries; use `Duration` for elapsed amounts
and `Schedule` for recurrence policy. Read current calendar time with `DateTime.now`, backed by Clock.
Decode wire values with `Schema.DateTimeUtcFromString` and `Schema.TimeZoneNamedFromString`.
The timestamp decoder normalizes to UTC and interprets offsetless strings as UTC; choose a stricter
wire schema when your protocol requires explicit offsets. Do not treat it as a strict RFC 3339 validator.

Use `setZone` to select a calendar zone while preserving the instant. Use `startOf("day")` and
`add({ days: 1 })` for calendar windows; adding a 24-hour Duration changes the meaning across DST.
Use half-open `[start, nextStart)` windows to avoid double-counting midnight; `between` is inclusive.
Use `formatIso` for canonical UTC output and `formatIsoZoned` when zone identity must be retained.
Keep unsafe constructors for trusted constants; keep mutable native Date conversion at foreign adapters.
Named zone aliases may normalize (for example, Kolkata/Calcutta); preserve original input separately
only when the protocol requires the user's spelling. Calendar behavior depends on the host's time-zone database; historical and future zone changes matter.

See [reporting.ts](examples/reporting.ts) for Schema → zoned day → usage summary, with DST and
midnight checks in [reporting.test.ts](examples/reporting.test.ts).
[DateTime API reference](../skills/suites/effect/effect-api-documentation/references/DateTime.md).

### Test prescription

Use `@effect/vitest` for Effect tests, pinned to a version compatible with Effect and Vitest.
Group tests in a named `describe` block for each consumer boundary.
Use plain `it` for pure public-boundary checks and `it.effect` for Effect workflows.
Let `it.effect` provide test services and close its Scope; do not add manual runners or redundant scopes.
Use `it.live` only when live Effect services are necessary; state the reason beside the test.
Use `it.layer` only when sharing across tests is intentional. Otherwise build fresh owners per test.
Use `it.effect.prop` for generated public-operation sequences with a fixed seed and bounded inputs.
Retain the seed, shrinking replay, and failing sequence when a property fails.

Start from requirements, derive independent invariants, then select public-boundary checks.
Keep invariants separate from transition postconditions and progress assumptions.
Test the real internal components; substitute only named external dependencies.
Use independent expected values, not private transitions or fixtures that implement the claimed behavior.
Use `TestClock` and readiness gates instead of sleeps. Check preserved state after rejection and retry.
Record test coverage and open obligations in the [example boundary review](examples/README.md).
Passing examples or lint does not establish exhaustive correctness.

Use `Schema.toEquivalence` when schema-defined structural equality matches the domain's laws.
Preserve identity comparisons where identity carries meaning.
Derive valid test inputs from schemas when supported by the installed version.
In Effect 4.0.5, use `Arbitrary.schema` from `effect/Arbitrary`.
The older `Schema.toArbitrary` API is unavailable in this version.
Generated valid inputs supplement targeted invalid, identity, and mutation-isolation cases.

Each lint prescription names the required property and smallest correct repair.
Accept equivalent implementations. Keep ownership judgments as review signals.
Passing lint does not prove behavior.
