# Anti-Slop Preferences

This is the human-facing companion to
[all-failing-patterns.ts](/Users/arpit/Developer/flow-state/tools/oxlint/anti-slop/fixtures/all-failing-patterns.ts).

The failing fixture answers “what must fail?” This file answers “what should I
write instead?” Accepted examples live in
[all-preferred-patterns.ts](/Users/arpit/Developer/flow-state/tools/oxlint/anti-slop/fixtures/all-preferred-patterns.ts).

Not every rule has one replacement. Prefer the smallest form that keeps
ownership, type evidence, and failure behavior visible.

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
| no-explicit-any | Preserve a generic; use unknown only at an input boundary; isolate a genuine existential value behind a named adapter. |
| no-known-value-widening | Keep inference; use satisfies Contract; annotate only when publishing the real owner contract. |
| no-unknown-parameters, no-unknown-returns, no-unknown-type-aliases | Use a named domain type or generic. Keep unknown inside the decoder boundary. |
| no-unsafe-dictionary-type | Use a named Record<Key, Value>, Map<Key, Value>, or an explicitly named opaque extension bag. |
| no-object-type | Use a named owner or domain type instead of the built-in TypeScript object type. |
| no-nullish-function-contracts | Use `Option<T>` for expected absence, `Result`/`Either` for pure recoverable failure, and `Effect<A, E, R>` for effectful failure. Keep parameters required; use a tagged union or separate function when the operation has distinct modes. |
| no-object-freeze | Do not call `Object.freeze`; keep mutation private, expose a readonly type, and copy once at the ownership boundary when a snapshot is needed. |
| no-redundant-readonly-wrapper | Choose { readonly value: T } or Readonly<{ value: T }>; never both mechanically. |
| no-runtime-typeof | Decode external data with Schema at its boundary; use a local type guard only when it owns that boundary. |
| no-shallow-json-domain-cast | Parse JSON as unknown, then complete `Schema.decodeUnknownSync` or call a named complete decoder. |

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
| no-conditional-singleton-array-spread | A local array plus push; or flatMap when the operation is genuinely a projection. |
| no-array-from-then-map | Array.from(iterable, callback); or a visible for...of loop. |
| no-nested-conditional-expression, no-ternary-iife | An intermediate name, an if/else, or a named helper. |
| no-staged-object-assign | Compute derived values first, then return one object literal. One Object.assign is reserved for deliberate API/library interop assembly. |
| no-top-level-mutable-production-state | Keep module-level production bindings `const`; put mutable state behind its owner or inside a factory. Test fixtures may use local mutable state. |
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
| no-unjustified-effect-try-promise | Change the dependency/API to return Effect. If that is impossible, use object-form `Effect.tryPromise` with callable `try`/`catch` and an adjacent standalone `FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE:` justification. Naming and extraction are optional; inline and extracted calls follow the same policy. |
| no-effect-promise-microtask, no-promise-microtask-barrier | Effect.yieldNow, Deferred, Latch, TestClock, or joining the specific fiber whose progress is required. The microtask-specific Effect.promise rule is subsumed by no-effect-promise. |
| no-effect-runner-in-domain | Return or yield the Effect; run it exactly once at Runtime, ManagedRuntime, CLI, test harness, or final host/shutdown boundaries. A host file does not permit a nested runner inside a workflow. |
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
| no-large-production-file | Treat the warning as a decomposition prompt at 500 production lines; actual test files have a separate 1,000-line allowance for executable matrices and proofs. Split by owner, lifecycle, or boundary, not by arbitrary helper extraction. |
| no-parallel-diagnostic-errors | Use the canonical Diagnostic union, adding a code and owned projector for a new expected failure. |
| no-unknown-effect-channel | Name the Diagnostic failure and required service channels; keep unknown only at a documented internal erasure boundary. |

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
