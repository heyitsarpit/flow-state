# Flow State Effect-Native API TODO

Goal: fold the previous example review issues and the latest Effect ergonomics audit into one executable plan. Do not leave these as future ideas. Update the core API, examples, tests, and docs together so the examples show the final API shape, even where runtime execution remains intentionally contract-first.

## Ground Rules

- [ ] Keep examples contract-first where intended. Do not turn Streaming Upload Manager, Cached Dashboard, or Checkout Or Approval Flow into full production apps just to prove the API.
- [ ] Prefer Effect-native input types at public boundaries, then normalize internally to serializable Flow snapshots.
- [ ] Do not add Flow wrappers when importing and using `Duration`, `Option`, `Record`, `Array`, `Stream`, `Schedule`, `Schema`, `Match`, `Clock`, or `RequestResolver` is clearer.
- [ ] Preserve bare `guard`, `update`, and `actions` slots for machine ergonomics.
- [ ] Keep docs, examples, and tests in lockstep. Every final API change must be visible in `apps/docs/src/pages/reference` and `apps/docs/src/pages/examples.md`.
- [ ] Run the strongest available verification gate after each phase, with `pnpm verify` as final closeout.

## Phase 0: Utility-First Pass

### Function / Pipe / Dual

- [ ] Review public Flow helper functions and decide which should be data-last/pipe-friendly.
- [ ] Use `pipe` in examples where it removes one-off helper functions.
- [ ] Use `Function.identity`, `Function.constVoid`, `Function.constNull`, or `Function.constUndefined` for default callbacks and no-op handlers where appropriate.
- [ ] Do not make plain Flow config objects `Pipeable`; keep descriptor/config shapes serializable.

### Predicate / Match / Result

- [ ] Replace local object and `_tag` guards with `Predicate.hasProperty`, `Predicate.isTagged`, or schema decoding.
- [ ] Replace repeated status/kind/type if-chains with `Match.discriminator`, `Match.tag`, `Match.tags`, or `Match.exhaustive` where it improves exhaustiveness.
- [ ] Use `Result` for synchronous validation/normalization that can fail before Effect execution:
  - [ ] key encoding
  - [ ] persisted snapshot migration
  - [ ] descriptor normalization
  - [ ] schema-free guard validation
- [ ] Keep async/service failures in Effect's typed error channel.

### Collections / Records / Structs

- [ ] Replace finite-record helpers with Effect `Record` utilities:
  - [ ] remove `mapPanels`
  - [ ] use `Record.map`, `Record.collect`, `Record.get`, `Record.modify`, `Record.filterMap`, or `Record.reduce`
- [ ] Use `Struct.pick`, `Struct.omit`, or `Struct.evolve` for context/object updates where clearer than object spread helpers.
- [ ] Use `Array.head`, `Array.findFirst`, `Array.filterMap`, `Array.groupBy`, `Array.sortBy`, and `Array.NonEmptyReadonlyArray` where safety or non-empty contracts matter.
- [ ] Avoid broad rewrites of simple `.map`/`.filter` code that is already clearer as plain JavaScript.

### Data / Brand / Types

- [ ] Use `Data.TaggedClass`, `Data.TaggedError`, or `Data.taggedEnum` for internal tagged values that do not need schema codecs.
- [ ] Use `Schema.TaggedClass` / `Schema.TaggedErrorClass` for values crossing API, persistence, or docs boundaries.
- [ ] Use `Schema.brand`, `Brand`, or `Newtype` for domain IDs where it improves type safety without drowning simple examples.
- [ ] Use `Newtype.makeEquivalence` / `Newtype.makeOrder` when branded/newtyped IDs need comparison or sorting.
- [ ] Replace local type-level helpers with Effect `Types` utilities:
  - [ ] `Types.NoInfer`
  - [ ] `Types.Simplify`
  - [ ] `Types.MergeRight` / `Types.MergeLeft`
  - [ ] `Types.Equals` / `Types.EqualsWith`
  - [ ] `Types.Covariant` / `Types.Invariant` only for descriptor internals that need variance control
- [ ] Add type tests before changing public generic inference.

### Ordering / Diagnostics

- [ ] Use `Order`, `Equivalence`, `Number.clamp`, and `Number.between` for sorting, equality, progress, quantities, and bounded config values where they remove ad hoc logic.
- [ ] Avoid exposing comparison typeclasses in the simple API unless richer keys/sorting require them.
- [ ] Replace ad hoc diagnostic `JSON.stringify` with Effect formatting/inspectable/redaction-aware conventions where receipts or traces may contain sensitive values.

## Phase 1: Core API Replacements

### Duration.Input Everywhere

- [ ] Replace custom `FlowDurationInput` in `packages/flow-state/src/index.ts` with `Duration.Input`.
- [ ] Update all duration-bearing API fields to accept `Duration.Input`:
  - [ ] `FlowQueryCachePolicy.staleTime`
  - [ ] `FlowQueryCachePolicy.gcTime`
  - [ ] `FlowStreamPressure.sample.every`
  - [ ] `FlowAfterConfig.delay`
  - [ ] `FlowSettleOptions.maxVirtualTime`
  - [ ] `FlowTestHarness.advance`
  - [ ] `FlowTimerSnapshot.delay`
  - [ ] `FlowSubmitOptions.advance`
- [ ] Replace `addDuration(now, duration: number | undefined)` with a Duration-backed normalizer.
- [ ] Replace `formatDurationInput` object handling with `Duration.format` or normalized millis formatting.
- [ ] Keep snapshot fields like `staleAt`, `gcAt`, `startedAt`, `endedAt`, and `fireAt` as numbers.
- [ ] Update examples from `30_000`, `300_000`, etc. to `"30 seconds"`, `"5 minutes"`, `"250 millis"`, etc.
- [ ] Add tests covering string durations, object durations, numeric millis, and invalid duration behavior.

### Option-Native Optional Inputs

- [ ] Change `FlowMutationConfig.input` to accept `TInput | Option.Option<TInput> | null | undefined`.
- [ ] Normalize mutation input internally with Effect `Option`.
- [ ] Update Project Editor, Cached Dashboard, Checkout, and Agent Workspace examples to use `Option` for optional mutation inputs where it clarifies intent.
- [ ] Keep null only at React/JSON/persistence boundaries.
- [ ] Add tests for `Option.some`, `Option.none`, `null`, and `undefined` mutation inputs.

### Stream.Stream Instead Of AsyncIterable

- [ ] Change `FlowStreamConfig.stream` to return `Stream.Stream<TValue, TFailure, TServices>` or an Effect that yields one if that is cleaner for service lookup.
- [ ] Support `AsyncIterable` only as an adapter path, not as the primary example API.
- [ ] Replace `createControlledStream` internals with an Effect-native stream source using `Queue` or `PubSub`.
- [ ] Preserve the current test-facing handle API: `emit`, `fail`, `die`, `end`, `active`, `cancelled`, `events`, `state`.
- [ ] Ensure stream failure, defect, interrupt, end, cancellation, coalescing, dropping, and sampling stay visible in `snapshot.streams`.
- [ ] Add tests proving stream cleanup and interruption without sleeps.

### Schedule For Polling, Retry, Sampling, And Timers

- [ ] Add Schedule-native options where repeated or delayed behavior exists:
  - [ ] stream pressure sampling can use a `Schedule`
  - [ ] query refetch/polling can use a `Schedule`
  - [ ] retry/backoff can use a `Schedule`
  - [ ] delayed transitions keep `Duration.Input` shorthand
- [ ] Keep simple duration shorthands for common cases.
- [ ] Update Streaming Upload Manager to use `"250 millis"` or `Schedule.spaced("250 millis")` rather than numeric sampling.
- [ ] Update Cached Dashboard to show `Schedule.spaced("30 seconds")` for active refresh or polling if the API includes it.
- [ ] Add tests for schedule-shaped options at the descriptor level.

### Schema, Redaction, And Persistence

- [ ] Extend `flow.schema` to accept Effect `Schema` definitions instead of descriptive string-only metadata.
- [ ] Keep lightweight docs metadata if useful, but make real decoding/encoding the typed path.
- [ ] Update `flow.persist` to support schema-backed select/decode/encode/migrate/redact.
- [ ] Replace manual unknown object checks in Checkout persistence with schema decode and migration transforms.
- [ ] Use `Schema.Class` for example domain models where constructors improve clarity.
- [ ] Use `Schema.TaggedErrorClass` for typed domain failures in examples.
- [ ] Use `Schema.brand` for IDs such as project IDs, upload IDs, panel IDs, checkout IDs, task IDs, and actor IDs where useful.
- [ ] Use `Schema.Redacted` or `Redacted` for sensitive checkout customer fields and agent trace summaries.
- [ ] Add tests for decode failure, migration, redaction, and persisted snapshot shape.

### Clock, DateTime, And TestClock

- [ ] Remove `Date.now()` from Effect service implementations.
- [ ] Use `Clock.currentTimeMillis` or `DateTime` inside Effect programs.
- [ ] Keep `runtime.now()` only for synchronous reducer/update slots that must stay pure and serializable.
- [ ] Wire test time to Effect `TestClock` where stream/timer/query tests require deterministic time.
- [ ] Update demo layers in Cached Dashboard and other examples to use Effect time.

### Managed Runtime And Resource Ownership

- [ ] Review `createRuntime` and Effect execution helpers for `ManagedRuntime`.
- [ ] Decide whether runtime-owned layers should be backed by `ManagedRuntime.make`.
- [ ] Ensure runtime disposal releases scoped resources, stream fibers, cache entries, and layer finalizers.
- [ ] Keep React integration ergonomic: `FlowProvider` owns or receives one runtime.
- [ ] Add disposal tests for services with finalizers.

### Cache API Alignment

- [ ] Decide final cache option names:
  - [ ] Either keep `staleTime` and `gcTime` for UI familiarity but type them as `Duration.Input`
  - [ ] Or replace with `staleAfter` and `gcAfter` for clearer Flow semantics
- [ ] Add `capacity` if the runtime cache needs bounded behavior.
- [ ] Consider Effect `Cache` or `ScopedCache` internally for query result caching.
- [ ] Preserve Flow-specific stale UI semantics separately from Effect TTL semantics.
- [ ] Support dynamic TTL/stale policies from query result or `Exit` if useful for Cached Dashboard.
- [ ] Add tests for stale, GC, invalidation, keep-previous-data, observer count, and failure caching behavior.

### RequestResolver For Batching

- [ ] Add a descriptor path for batched query lookup or document how examples should use Effect `RequestResolver` inside services.
- [ ] Use `RequestResolver.setDelay("10 millis")` and `RequestResolver.withCache({ capacity })` in Cached Dashboard if batching belongs in the example service.
- [ ] Keep Flow query keys/tags as the app-level invalidation surface.
- [ ] Add a test that multiple panel requests can be represented as one batched service lookup.

### Tagged Failure Routing

- [ ] Extend `flow.outcomes` with tag-aware failure routing for `_tag` / `Schema.TaggedErrorClass` failures.
- [ ] Add a `flow.failureTags` helper only if direct Effect `Match` usage is too noisy at route sites.
- [ ] Replace manual failure branching in examples with `Match` or tag-aware routes.
- [ ] Preserve existing `success`, `failure`, `defect`, and `interrupt` routes.
- [ ] Add exhaustive routing tests for known failure tags and fallback behavior.

### Test Layer Ergonomics

- [ ] Add `createPartialTestLayer` or change `createTestLayer` to accept partial service implementations with missing methods failing loudly.
- [ ] Keep the current full-service path valid.
- [ ] Use `Effect.die` for unimplemented fake methods.
- [ ] Support Ref-backed test services for examples that need mutable fake state.
- [ ] Update test docs and examples to use the lighter fake service shape.

### Flow Keys And Hashing

- [ ] Review `createKey(...parts)` using `JSON.stringify(parts)`.
- [ ] Decide whether keys should accept only serializable parts or Effect `Equal` / `Hash` capable key parts.
- [ ] If non-serializable keys are allowed, separate runtime hash identity from docs/devtools serializable key display.
- [ ] Add collision/serialization tests for object, array, primitive, and branded key parts.

### Cause And Diagnostics

- [ ] Preserve Effect `Cause` internally when inspecting exits.
- [ ] Keep snapshots serializable, but store enough defect/failure/interruption details for useful receipts.
- [ ] Ensure `Cause.findErrorOption` does not erase important failure structure.
- [ ] Add tests for typed failure, defect, interrupt, and nested cause diagnostics.

## Phase 2: Example Replacements

### Streaming Upload Manager

- [ ] Replace service API from `AsyncIterable<UploadProgress>` to `Stream.Stream<UploadProgress, UploadFailure>`.
- [ ] Replace controlled upload progress with the new Effect-native `createControlledStream`.
- [ ] Use `Duration.Input` or `Schedule` for sample pressure.
- [ ] Keep lifecycle state in `snapshot.streams`, not duplicated in product context.
- [ ] Prove stream values only change product state through routed events.
- [ ] Prove interruption is receipt-only unless `routes.interrupt` is configured.
- [ ] Add edge cases:
  - [ ] cancel before first emission
  - [ ] cancel after partial progress
  - [ ] fail after partial progress
  - [ ] defect after partial progress
  - [ ] stream end
  - [ ] duplicate or stale progress event
  - [ ] pressure drop/coalesce/sample counters
  - [ ] route interrupt vs receipt-only interrupt
- [ ] Update docs in `apps/docs/src/pages/examples.md`.

### Cached Dashboard

- [ ] Replace panel `staleTime: number` with `Duration.Input`.
- [ ] Replace `dashboardPanels.map` with Effect `Array.map` if it makes the example more consistent.
- [ ] Replace manual panel helpers with Effect `Record`:
  - [ ] remove `mapPanels`
  - [ ] replace `selectPanelList`
  - [ ] replace summary reduce with `Record.reduce` or `Array.reduce` after `Record.collect`
  - [ ] replace keyed panel lookup if-chains with `Record.get`, `Record.modify`, or `Match`
- [ ] Use `Option` for `pendingWidget`, `lastSavedWidget`, and `currentIssue` internally if it reduces null branching.
- [ ] Replace demo `Date.now()` with Effect `Clock`.
- [ ] Use `Effect.map`, `pipe`, and `Effect.fn` for service result shaping.
- [ ] Consider `RequestResolver` for batched panel loading.
- [ ] Consider Effect `Cache` / `ScopedCache` for runtime-backed cache semantics.
- [ ] Add edge cases:
  - [ ] query invalidation by tag
  - [ ] query invalidation by key
  - [ ] query invalidation by predicate
  - [ ] keep previous data while refetching
  - [ ] stale but visible panel
  - [ ] observer count changes
  - [ ] failure cached vs not cached
  - [ ] mutation invalidates one panel and global panel tag
  - [ ] concurrent mutation policy
  - [ ] stale response ignored by request id
- [ ] Update docs and screenshots/text snippets for final API shape.

### Checkout Or Approval Flow

- [ ] Replace `flow.schema` string field descriptors with Effect `Schema`.
- [ ] Use branded IDs and typed domain models for checkout, item, customer, approver, and decision.
- [ ] Use `Option` internally for approver, decision, submittedAt, and lastReviewState where appropriate.
- [ ] Replace manual `isObject`, `isPersistedCheckout`, `redactPersistedCheckout`, and `migrateLegacyCheckoutSnapshot` with schema-backed persistence.
- [ ] Use `Redacted` / `Schema.Redacted` for customer email and any sensitive approval reason.
- [ ] Use `Match` for decision/status branching.
- [ ] Keep permissions and invariants as first-class Flow descriptors.
- [ ] Add edge cases:
  - [ ] submit without required approval reason
  - [ ] approve without permission
  - [ ] reject without permission
  - [ ] restore shallow history
  - [ ] migrate v1 persisted snapshot to v2
  - [ ] redact sensitive fields in persisted snapshot and traces
  - [ ] invalid persisted snapshot decode
  - [ ] permission decision reason display
- [ ] Update docs in `apps/docs/src/pages/examples.md`.

### Agent Workspace

- [ ] Replace service progress APIs from `AsyncIterable` to `Stream.Stream`.
- [ ] Remove `emptyAsyncIterable`.
- [ ] Use Effect `Stream`, `Queue` or `PubSub`, and `Schedule` for progress and child-task streams.
- [ ] Use `Option` for current child, pending approval, current issue, and other nullable domain fields where useful.
- [ ] Use `Redacted` for trace summaries or metadata that should not leak.
- [ ] Replace ad hoc trace redaction with schema/redaction support.
- [ ] Replace repeated `runtime.now()` in Effect-adjacent code with `Clock` where possible.
- [ ] Add edge cases:
  - [ ] child stream failure
  - [ ] parent cancellation interrupts child streams
  - [ ] approval proposed while another approval is pending
  - [ ] redacted trace output
  - [ ] child completion after parent cancellation is ignored

### Project Editor

- [ ] Replace numeric cache times with `Duration.Input`.
- [ ] Replace nullable mutation input with `Option`.
- [ ] Use Schema-backed payloads if current schema is only partial.
- [ ] Update tests and docs to match the final mutation input API.

### Todo List

- [ ] Keep Todo as the simple baseline example.
- [ ] Avoid overloading Todo with advanced Effect features.
- [ ] Replace time literals with `Duration.Input` only where the example touches timers or test advancement.
- [ ] Keep it useful as the comparison point for later examples.

## Phase 3: Docs And Reference Updates

- [ ] Update `apps/docs/src/pages/reference/lib_api.md` for:
  - [ ] `Duration.Input`
  - [ ] Option-capable mutation input
  - [ ] Stream-native stream descriptor
  - [ ] Schedule-capable retry/refetch/sample options
  - [ ] Schema-backed `flow.schema`
  - [ ] Schema-backed `flow.persist`
  - [ ] tag-aware failure routing
  - [ ] runtime disposal and managed resources
  - [ ] cache policy final names
- [ ] Update `apps/docs/src/pages/reference/test_api.md` for:
  - [ ] Effect-native `createControlledStream`
  - [ ] partial test layers
  - [ ] TestClock or virtual time behavior
  - [ ] stream assertions
  - [ ] duration input examples
- [ ] Update `apps/docs/src/pages/examples.md`:
  - [ ] mark final API status for each new example
  - [ ] replace old numeric millisecond snippets
  - [ ] replace async iterable snippets
  - [ ] show `Record.map`, `Option`, `Stream`, `Schedule`, and `Schema` in the relevant examples
  - [ ] keep clear that runtime execution is intentionally scoped where applicable
- [ ] Update any package READMEs that mention old cache or stream API names.

## Phase 4: Tests And Verification

- [ ] Update `packages/flow-state/src/index.test.ts` for core API replacements.
- [ ] Update example tests:
  - [ ] `examples/streaming-upload-manager/src/uploadFlow.test.ts`
  - [ ] `examples/cached-dashboard/src/dashboardFlow.test.ts`
  - [ ] `examples/checkout-approval-flow/src/checkoutFlow.test.ts`
  - [ ] `examples/agent-workspace/src/agentWorkspaceFlow.test.ts`
  - [ ] `examples/project-editor/src/projectFlow.test.ts` or equivalent
- [ ] Add type-focused tests where runtime behavior is intentionally contract-only.
- [ ] Add negative tests for invalid schemas, invalid duration input, and missing fake service methods.
- [ ] Run targeted tests after each example update.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm verify` before final closeout.

## Replacement Map

| Current shape                                | Replacement                                                     |
| -------------------------------------------- | --------------------------------------------------------------- | ---------------------- | ------ | ---- | ---------- |
| `number` duration fields                     | `Duration.Input`                                                |
| `{ millis: number }` custom duration object  | Effect duration strings or `Duration.Duration`                  |
| `TInput                                      | null` mutation input only                                       | `Option.Option<TInput> | TInput | null | undefined` |
| `AsyncIterable` stream APIs                  | `Stream.Stream` primary, async iterable adapter only            |
| manual async iterable test helpers           | Queue/PubSub-backed controlled streams                          |
| manual `mapPanels`                           | `Record.map`                                                    |
| manual panel list object reads               | `Record.collect`                                                |
| manual optional branching                    | `Option.match`, `Option.map`, `Option.getOrElse`                |
| `Date.now()` in Effect services              | `Clock` or `DateTime`                                           |
| string-only `flow.schema` descriptors        | Effect `Schema`                                                 |
| manual redaction over `unknown`              | `Redacted` / schema-backed redaction                            |
| manual `_tag` branching                      | `Match` or tag-aware failure routes                             |
| full fake service required everywhere        | partial test layer with missing methods dying loudly            |
| ad hoc polling/retry intervals               | `Schedule`                                                      |
| `JSON.stringify(parts)` as only key identity | serializable display plus reviewed runtime hash/equality policy |

## Closeout Criteria

- [ ] All examples compile against one final public API.
- [ ] New examples no longer demonstrate old numeric-duration, async-iterable, or null-only patterns unless explicitly documenting boundary compatibility.
- [ ] Cached Dashboard no longer contains `mapPanels`.
- [ ] Streaming Upload Manager and Agent Workspace use Effect streams as the primary API.
- [ ] Checkout persistence uses schema-backed decode/migrate/redact.
- [ ] Reference docs and examples docs match the code.
- [ ] `pnpm verify` passes.
