# Anti-Slop Preferences

This is the human-facing companion to the executable rule tests. It answers
“what should I write instead?” Accepted examples live in
[all-preferred-patterns.ts](/Users/arpit/Developer/flow-state/tools/oxlint/anti-slop/fixtures/all-preferred-patterns.ts).

Not every rule has one replacement. Prefer the smallest form that keeps
ownership, type evidence, and failure behavior visible.

## Fixture policy

`all-preferred-patterns.ts` is intentionally a raw-source teaching corpus. Its
first line is the machine-readable marker `// anti-slop-fixture: text-only`.
`tests/fixture-sweep.test.ts` loads the file as text, checks that marker, and
runs the preferred corpus through the live rules. Individual RuleTester suites
remain the executable behavior proof; run the changed rule's focused test
directly rather than using an aggregate rule command. The corpus contains
representative snippets, declarations, and illustrative imports that are not
intended to resolve as one standalone module.

The former unknown-specific rules are archived under `archive/` and each file
is marked `Superseded by: anti-slop/no-unknown`. The active policy has one
owner for explicit `unknown` diagnostics.

## External rule decisions

The migrated rules below remain in the single `anti-slop` plugin. The enabled
rules are warnings because they identify review-worthy syntax, while the owner
contract still determines whether the code is actually wrong.

| Rule | Decision and rationale |
| --- | --- |
| no-array-filter-map | Enabled as a warning. Adjacent eager `filter`/`map` passes can add avoidable work, but a single rewrite must preserve callback order, indexes, and filtering semantics. |
| no-reduce-accumulator-copy | Enabled as a warning. Copying a growing reducer accumulator can become quadratic; the rule is a prompt to inspect ownership and workload rather than proof that every copy is defective. |
| no-manual-effect-error-tag | Enabled as a warning. In broad Effect error handlers, prefer `Effect.catchTag`/`catchTags` or the corresponding reason helpers. Narrow inspection, logging, or an owner-specific contract still needs review. |
| no-manual-tag-comparison | Enabled as a warning. For Effect tagged values, prefer `Match` or a reusable predicate. This is intentionally scoped to recognized Effect tagged values and is not a blanket ban on domain union narrowing. |
| prefer-effect-native-tagged-types | Enabled as a whole-codebase warning. Use `Result.Result<Success, Failure>` for a synchronous two-way `_tag` outcome and `Data.TaggedEnum` plus `Data.taggedEnum` constructors for a three-or-more-variant `_tag` protocol. Schema-derived types, semantic cause/evidence/projection/wire shapes, complete success/failure/defect/interruption outcomes, `kind`/`status` projections, multi-tag or duplicate-tag protocols, ordinary two-variant domain unions, and singleton tags are not reported. |
| require-readable-spacing | Available in the plugin but disabled in `vite.config.ts`. It is a syntactic blank-line policy adapted from ESLint Stylistic; enable its commented registration manually when the repository is ready. |
| no-object-parameters | Not added. Local `no-object-type` is intentionally broader and already covers the configured Flow State source roots; adding a parameter-only duplicate would add little signal. |
| prefer-effect-match | Not added. It overlaps with `no-nested-conditional-expression` only when Effect branching is expressed as nested or repeated ternaries; otherwise it is distinct and deferred as an API/style preference. |
| no-manual-tagged-construction, no-service-constructor-imports | Deferred. The former conflicts with valid `Data.TaggedEnum` construction, and the latter encodes an architecture policy that needs a narrower repository-specific boundary. |

## Type evidence and shapes

| Rule | Prefer |
| --- | --- |
| typescript/no-unnecessary-type-assertion | Remove assertions that do not change the inferred type. |
| typescript/no-unsafe-type-assertion | Decode or narrow with a runtime guard before asserting to a narrower domain type. |
| typescript/no-empty-object-type | Use a named domain shape, `object`, or `unknown` according to the actual contract; never use `{}` to mean “object”. |
| typescript/no-unsafe-function-type | Use an explicit call signature such as `(input: Input) => Output`. |
| typescript/no-unnecessary-type-arguments | Let TypeScript infer default generic arguments; provide an argument only when selecting a non-default type. |
| typescript/no-unnecessary-type-constraint | Write `<T>` instead of `<T extends any>` or `<T extends unknown>`. |
| use-import-type | Use a top-level `import type` declaration when every imported binding is type-only. |
| use-export-type | Use a top-level `export type` declaration when every exported binding is type-only. |
| use-consistent-type-definitions | Opt in per package only when a module deliberately chooses one object spelling. Flow State's default is contextual: interfaces for stable ports/records, aliases for unions/functions/tuples/Schema-derived types. |
| no-chained-type-assertions, no-escape-hatch-assertion, no-widen-then-assert | Decode with Schema.decodeUnknownSync; construct a domain value; or keep one narrow assertion next to a SAFETY invariant. |
| no-explicit-any | Preserve a generic; pass external data directly to a complete decoder; isolate a genuine existential value behind a named adapter. |
| prefer-inferred-return-types | Infer implementation returns. When annotation is necessary, put `// RETURN_TYPE: <specific contract or inference limitation>` immediately above the function or its single declaration/property. No automatic removal. |
| no-known-value-widening | Keep inference; use satisfies Contract; annotate only when publishing the real owner contract. |
| no-unknown | Use a named domain type or generic. Explicit `unknown` is allowed only in generic constraints/defaults, conditional check/extends machinery, erased variadic function machinery, `catch` bindings, direct Schema decoder/type-guard boundaries, configured open Schema fields/parameters, or an adjacent standalone `FLOW_STATE_ALLOW_UNKNOWN:` waiver. |
| no-unsafe-dictionary-type | Use a named `Record<Key, Value>`, `Map<Key, Value>`, or an explicitly named opaque extension bag. `no-unknown` owns explicit unknown diagnostics. |
| no-object-type | Use a named owner or domain type instead of the built-in TypeScript object type. |
| no-nullish-function-contracts | Use `Option<T>` for expected absence, `Result`/`Either` for pure recoverable failure, and `Effect<A, E, R>` for effectful failure. Keep parameters required; use a tagged union or separate function when the operation has distinct modes. |
| no-object-freeze | Review private `Object.freeze` calls against the owner contract. Frozen observable snapshots are allowed when required; keep private mutation behind its owner. |
| no-readonly | Review private `readonly`, `Readonly`, `ReadonlyMap`, `ReadonlySet`, `ReadonlyArray`, and custom `Readonly*` types against the owner contract. Contract-required public shapes are allowed; use `Data` for immutable values where appropriate. |
| no-runtime-typeof | Decode external data with Schema at its boundary; use a local type guard only when it owns that boundary. |
| no-shallow-json-domain-cast | Pass `JSON.parse` directly to a complete `Schema.decodeUnknownSync` call or a named complete decoder; do not leave an explicit unknown variable between parsing and validation. |

## Construction and control flow

| Rule | Prefer |
| --- | --- |
| typescript/switch-exhaustiveness-check | Handle every discriminated-union case explicitly and let the compiler prove exhaustiveness. |
| no-else-return | Return or throw, then continue without an unnecessary `else`. |
| no-unneeded-ternary | Use the condition directly or name a meaningful projection instead of `condition ? true : false`. |
| typescript/no-namespace | Use modules and named exports instead of TypeScript namespaces. |
| typescript/no-extraneous-class | Use a module or plain object for a static namespace; reserve classes for instances and lifecycle. |
| no-excessive-cognitive-complexity | Split deeply nested or heavily branching functions into named helpers with one clear decision each. |
| no-inline-import-type-query | A named import type declaration. |
| no-local-definite-assignment | Direct initialization; explicit T or undefined state; or a factory that constructs dependencies before returning. |
| no-conditional-empty-object-spread | Build the base object, then add an optional field in an if; or use a named projection helper. |
| no-for-each | A `for...of` loop, which keeps control flow, awaiting, and early exits visible. |
| no-conditional-array-spread | A direct conditional array, or a local array plus push; use flatMap only when the operation is genuinely a projection. |
| no-array-from-then-map | Array.from(iterable, callback); or a visible for...of loop. |
| no-nested-conditional-expression, no-ternary-iife | An intermediate name, an if/else, or a named helper. |
| no-staged-object-assign | Compute derived values first, then return one object literal. One Object.assign is reserved for deliberate API/library interop assembly. |
| no-anonymous-default-export | Prefer a named export or a named default declaration so stack traces and imports have a stable concept name. |
| no-generic-utility-module | Name a helper module after the domain concept it owns instead of `utils.ts`, `helpers.ts`, `common.ts`, or `manager.ts`. |
| no-shape-in-symbol-names | Name the domain concept: resourceIdentity, accountKey, or traceProjection. |
| no-package-dist-or-self-import-in-src | In package src, import the owning relative source module. Package-name and dist imports belong in consumers or build/proof scripts outside src. |
| no-public-entrypoint-export-drift | Public entrypoints use explicit export/export type lists and import internal owners directly; internal type barrels may still use export *. |

## Effect and runtime boundaries

| Rule | Prefer |
| --- | --- |
| no-context-tag | Effect-v4 class Service extends Context.Service<Service>()("Service") {}. |
| no-effect-promise | Make the operation Effect-native. Use `Effect.tryPromise({ try, catch })` only for unavoidable Promise interop; its separate rule requires an adjacent justification. |
| no-stateful-effect-construction | Review captured assignments and explicitly unsafe calls made while constructing an Effect. This is a syntax-only review signal; prove inert construction at the owner boundary. |
| no-eager-stateful-effect-succeed | Review explicitly unsafe calls and assignments passed to `Effect.succeed`; use `Effect.sync` or the native Effect operation when the value is effectful. This is not semantic proof. |
| no-expected-failure-as-defect | Review non-Error values passed to `Effect.die` or thrown from `Effect.sync`; keep expected failures in `Effect.fail`/`Effect.failCause`, but classify by the owner contract. |
| no-constant-effect-flatmap | Use `Effect.as(value)` when a `flatMap` callback ignores its input and returns a constant. |
| no-empty-context-make-unsafe | Review an empty `Context.makeUnsafe` call; use `Context.empty()` when the owner does not require a typed empty context map. |
| no-unjustified-effect-try-promise | Change the dependency/API to return Effect. If that is impossible, use object-form `Effect.tryPromise` with callable `try`/`catch` and an adjacent standalone `FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE:` justification. Naming and extraction are optional; inline and extracted calls follow the same policy. |
| no-effect-promise-microtask, no-promise-microtask-barrier | Effect.yieldNow, Deferred, Latch, TestClock, or joining the specific fiber whose progress is required. The microtask-specific Effect.promise rule is subsumed by no-effect-promise. |
| no-effect-runner-in-domain | Return or yield the Effect; run it exactly once at Runtime, ManagedRuntime, CLI, test harness, or an explicitly configured host/shutdown boundary. A normal host-named file does not permit a nested runner inside a workflow. |
| no-effect-ref-read-then-write | Use Ref.modify or Ref.update so the read-transform-write transition is atomic. |
| no-unmanaged-effect-scope | Pass Scope.make() directly as Effect.acquireRelease's acquisition argument in domain code; an explicit host/runtime owner may manage and close a Scope itself. |
| no-unwrapped-promise-in-effect-core | Effect.tryPromise({ try, catch }) or Effect.async at the justified foreign boundary; Promise conversion belongs at that edge. |
| no-throw-in-effect-gen | yield* Effect.fail(diagnostic) for expected failure; yield* Effect.die(defect) for an explicit invariant defect. |
| no-implicit-effect-concurrency | { concurrency: 1 }, a bounded number, or { concurrency: "unbounded" }. |
| no-numeric-duration | Duration.millis/seconds or a unit-tagged duration string. |
| no-unsafe-fiber-methods | Safe Fiber operations; otherwise isolate the unsafe bridge in one named runtime adapter. |
| no-direct-process-env | Read environment/configuration at a host boundary and pass a typed value inward. CLI/server/runtime adapters are the normal exceptions. |
| no-inward-module-dependency | Core imports ports/domain code inward; adapters and host entrypoints depend on core, never the reverse. |
| no-god-service-shape | Split a broad service into cohesive capability ports; do not use one dependency record as a substitute for ownership. |
| no-public-runtime-infrastructure | In configured package-public routes, expose commands, observations, drain, or shutdown rather than mutable mailboxes, scopes, queues, or cold consumer Effects. Internal owners and explicit adapter/host routes are outside this check. |
| no-object-iteration-result-cast | Admit each `Object.entries`/`Object.values` element with a schema or predicate before asserting a domain collection type. A narrow owner cast needs an adjacent `SAFETY:` invariant; `as const` is not a valid escape. |
| no-large-production-file | Treat the warning as a decomposition prompt at 500 production lines; actual test files have a separate 1,000-line allowance for executable matrices and proofs. Split by owner, lifecycle, or boundary, not by arbitrary helper extraction. |
| no-parallel-diagnostic-errors | Use the canonical Diagnostic union, adding a code and owned projector for a new expected failure. |

Flow State has one canonical `Schema.TaggedError` owner: `Diagnostic` in the
rewrite diagnostic module. Feature-specific error classes and `Data.TaggedError`
are forbidden there; add a diagnostic code and projector instead. `Effect.succeed`
and `Effect.fail` remain valid when the caller's contract is already Effectful.
Native `try/catch` is forbidden in rewrite library source, including host-named
folders. Use `Result` for pure recoverable work, `Effect.try` for synchronous
throwing foreign APIs, and justified `Effect.tryPromise` for Promise-only APIs.
Final host or unavoidable interop catches require an explicit local Oxlint
suppression; path names do not create exemptions.

## Tests and dynamic boundaries

| Rule | Prefer |
| --- | --- |
| no-module-mocking | A real fake through an interface, a controlled Layer, or a fixture factory. |
| no-expect-in-if | An unconditional assertion; or expect.assertions(n)/expect.hasAssertions() before branch-only assertions. |
| no-swallowed-cleanup-error | Let cleanup fail the test; assert the expected rejection; or report the intentionally ignored failure. |
| no-optional-domain-properties | Keep configured domain properties required; use Option<T> for expected absence instead of ? or nullish unions. |
| no-reflect-get, no-reflect-apply | Direct typed property/call syntax; use a named interface for deliberate dynamic dispatch. |
| require-safety-comment-for-type-assertion | Remove the assertion or document the checked invariant immediately before it. |
| typescript/no-misused-promises | Await the Promise, return it, or adapt it to a synchronous callback explicitly. |
| no-restricted-imports | In the configured package source roots, currently `packages/flow-state/src/**` and `packages/flow-state-rewrite/src/**`, import the owning relative source module; do not import the package name or built `dist` output. |

## Service contracts and parameters

| Rule | Prefer |
| --- | --- |
| no-service-shape-parameter-extraction | Export the service shape from its owner and import that named contract. |
| no-bivariant-callback | A normal contravariant callback. Isolate external bivariance in one adapter if unavoidable. |

Rules with no universal replacement should be handled by the local owner
contract and these examples, not by inventing a generic helper.
