# Flow State Type Inference Contract

Status: active type-system contract.

## Purpose

Make the preserved Flow State API pleasant and safe to author without replacing
it with a new DSL. Types should follow the same direction as runtime data,
propagate across definitions and adapters, reject invalid connections locally,
and remain affordable for TypeScript and declaration emit.

This contract does not require zero generics. It requires the smallest honest
amount of annotation for the preserved API.

## Core rule: inputs flow forward

Upstream inputs establish the contract. Downstream callbacks consume that
contract. Returned Effects, Streams, and selectors may infer results, failures,
requirements, and outputs, but they never reshape upstream inputs backwards.

```text
declared input / params / context / event / state
  -> downstream callback parameters
  -> returned Effect / Stream / selection
  -> success / failure / requirements / output
```

Examples:

- Resource Params inform `key`, `lookup`, tags, placeholder, and `ref`.
- Transaction Params inform `commit`, preview, invalidation, concurrency, and
  routes.
- Stream Params inform `subscribe` and routes.
- Machine Input/Context/Event/State inform initialization, guards, updates,
  targets, bindings, and routes.
- Child machine Input informs the parent child-input selector.
- View input and declared sources inform `select`.

An incompatible downstream callback fails at that callback. It cannot cause an
upstream type to widen to `unknown`, `any`, a broader union, or a type inferred
from the downstream implementation.

## Annotation policy

- Preserve existing explicit generic forms such as
  `flow.resource<[Id], Value>(...)` and
  `flow.machine<Context, Event, State>(...)`.
- Infer downstream callback arguments once upstream generics, selectors, or
  declared values establish their types.
- Infer Effect/Stream success, typed error, and requirements from returned
  Effects/Streams when that does not conflict with an explicit upstream type.
- Infer selector/view outputs from their return values.
- Permit a focused callback annotation or helper when TypeScript cannot provide
  stable contextual typing across a recursive or conditional boundary.
- Never add `MachineTypes`, `codecs`, a second constructor family, or a builder
  chain solely to reduce visible generic arguments.
- Zero annotations is not a goal when it makes source order unclear, diagnostics
  worse, declarations enormous, or inference unstable.
- This is not a global assertion-removal program. A localized internal assertion
  is acceptable when a validated invariant cannot be expressed in TypeScript,
  remains behind the semantic boundary, does not leak into declarations, and is
  covered by focused positive/negative tests.

## Constructor inference matrix

### Resources

Upstream:

- Params tuple/type from the existing generic, optional schema/type declaration,
  or another explicitly approved input declaration.

Must contextualize:

- `key` parameters and return key shape;
- `lookup` parameters;
- tag and placeholder callbacks;
- freshness/invalidation callbacks where parameterized;
- `resource.ref(params...)`;
- seed, patch, read, subscribe, hydration, and fixture APIs using the ref.

May infer downstream:

- lookup success `A`;
- lookup typed failure `E`;
- lookup service requirements `R`.

Reject:

- wrong parameter count/order/type;
- `key` or `lookup` accepting an unsafe narrower Params type;
- a ref created with another resource's Params;
- seed/patch/hydration value not matching the resource value;
- failure/value/schema mismatch;
- descriptor-ID fallback that erases the parameterized instance type.

### Transactions

Upstream:

- Params from the `params` selector return type or existing explicit Params
  declaration.

Must contextualize:

- `commit` input;
- preview apply/rollback;
- invalidation selectors;
- concurrency key selectors;
- success/failure routes;
- `submit` and `flow.run` bindings;
- transaction fixtures and expectations.

May infer downstream:

- commit success `A`;
- commit typed failure `E`;
- commit service requirements `R`.

Reject:

- commit input that does not accept the established Params;
- preview/invalidation/concurrency callbacks using a different Params type;
- outcome routes using the wrong success/error type;
- routed event not accepted by the owning machine;
- test expectation for an impossible outcome.

### Streams

Upstream:

- Params from the stream `params` selector or existing explicit Params
  declaration.

Must contextualize:

- subscription acquisition and `subscribe` input;
- pressure/concurrency keys when parameterized;
- value/failure routes;
- controlled stream fixtures and expectations.

May infer downstream:

- emitted value `A`;
- typed failure `E`;
- acquisition and Stream requirements `R` without conflating them.

Reject:

- subscription input that reshapes Params;
- emitted value/error route mismatch;
- route event not accepted by the owning machine;
- controlled fixture with the wrong value/error type;
- erasure to primary `AsyncIterable<unknown>` or Promise-based callbacks.

### Machines

Upstream:

- Input, Context, Event, and State from the preserved generic/object call forms.
- State keys and transition targets may be inferred from literal `states` when
  TypeScript can do so without circular widening.

Must contextualize:

- initial context input;
- guards and updates;
- transition targets;
- state-owned params selectors;
- submit/run/resource/stream/timer/child bindings;
- actor `send`, snapshots, restore, tests, stories, and React hooks.

Reject:

- unknown transition target;
- event payload mismatch;
- guard/update accessing fields outside Context/Event;
- unsafe narrower callback arguments;
- binding params incompatible with the target definition;
- actor or snapshot from another machine/app;
- broad `string` state or `{ type: string }` event widening when literals are
  available.

### Children and timers

- The child machine establishes its Input, Output, Failure, Event, and State
  contracts.
- Parent child-input selectors are checked against the child Input.
- Child success/failure routes receive exact child Output/Failure.
- Timer targets and routed events are checked against the parent machine.
- Supervision and restore types preserve the exact child definition.

Inline child callback inference is allowed to require a focused annotation when
TypeScript cannot contextually infer it without changing the API. The library
must not pretend the type is inferred by widening it to `unknown` or using a
bivariant callback.

### Views

- Declared input and source definitions inform the `select` callback.
- `select` return type becomes the exact view output.
- `selectView` and `useView` preserve that output.
- Equivalence functions receive the exact output type.
- A view cannot select a resource, actor, transaction, stream, child, issue, or
  receipt source it did not declare or receive.

### Modules, apps, and Layers

- Module definition keys remain exact literal keys.
- Each key retains the exact resource, transaction, machine, stream, view, or
  fixture definition type assigned to it.
- App module maps retain exact module IDs and allow typed lookup without casts.
- Module reorder does not change identity or inferred lookup types.
- App-scoped fixture names and values derive from registered module metadata.
- Layer composition preserves output, typed error, and remaining requirements.
- Internal collections must not erase exact public/semantic types through broad
  arrays, reflection casts, or repeated conditional fan-out. A localized broad
  internal collection is acceptable only when exact types are restored at a
  validated seam and the erasure cannot reach consumers.
- Invalid/missing dependencies and unsatisfied Layer requirements fail at the
  app/layer boundary.

## Cross-definition propagation

Once a definition is authored, consumers must reuse its types rather than ask
the client to restate them.

- `resource.ref(...)` carries resource Params and Value through runtime, React,
  hydration, tests, patches, and subscriptions.
- A transaction carries Params/Success/Failure/Requirements through submit/run,
  preview, invalidation, routes, receipts, tests, and inspection.
- A stream carries Params/Value/Failure/Requirements through machine ownership,
  routes, controlled fixtures, snapshots, tests, and inspection.
- A machine carries Input/Context/Event/State through actor creation, send,
  snapshots, restore, children, tests, stories, React, and server boot.
- A child binding carries the exact parent and child contracts without an
  untyped intermediate descriptor.
- A view carries its output through pure selection, testing, SSR, and React.
- A module/app carries exact definition and fixture maps through runtime and test
  acquisition.

Adding an adapter must not require a second generic declaration of types already
present in the owning definition.

## Impossible lanes

Type-level `never`, not mandatory Schema, removes impossible typed lanes.

- `Effect<A, never, R>` has no typed failure route or typed-failure expectation.
- A transaction/child/stream with `never` success/output/value has no success or
  value route requiring a value.
- A machine with `never` output or failure does not expose impossible terminal
  expectations.
- Optional route fields become required only for possible lanes and forbidden
  for impossible lanes when the public form can express that safely.
- Schema `Never` may validate the same fact at a boundary but is not the source
  of the TypeScript rule.

Defects and interruption remain possible runtime outcomes even when typed
failure is `never`. Eliminating a typed failure lane must not erase defect,
interruption, cleanup, or issue evidence.

## Callback exactness and variance

- Each callback family receives only its documented arguments.
- Callback parameter types are checked contravariantly under strict function
  types where soundness requires it.
- An exact or safely wider callback input is accepted.
- An unsafe narrower callback input is rejected.
- Bivariant helper types, `any`, broad `Record<string, unknown>`, and universal
  owner bags cannot be used to make invalid callbacks compile.
- Callback return types must be checked against their owning state update,
  target event, Params, key, route, or selection contract.
- Diagnostics should point at the incompatible callback or field, not at an
  unrelated app/module declaration far downstream.

## Effect and Layer fidelity

- `Effect<A, E, R>` and `Stream<A, E, R>` remain exact through public
  declarations, normalization, runtime owners, snapshots of status facts,
  deterministic controls, and adapters.
- Service requirements accumulate from contained definitions without becoming
  `never`, `unknown`, or `any` accidentally.
- Providing a Layer removes exactly the requirements that Layer satisfies.
- Layer acquisition failures remain typed and separate from domain operation
  failures.
- Promise host adapters preserve the inferred public result/error contract and
  do not become the source of semantic types.
- Scope/finalization does not disappear from the architecture merely because it
  is not a visible generic parameter in a client callback.

## Testing and story inference

Testing surfaces infer from the registered definitions:

- machine input and allowed events;
- possible state values;
- resource refs and fixture values;
- transaction params/success/failure;
- stream values/failures;
- child inputs/outputs/failures;
- view selections;
- app/module/fixture names;
- scenario expectations and result types.

Reject wrong-app definitions, wrong fixture names, incorrect fixture values,
invalid events/states, impossible outcome expectations, and untyped ownerless
fixtures. `flowTest` and `test` may remain compatible entry points, but must not
carry different type systems.

## React inference

- `use(machine, ...)` returns an actor whose snapshot and `send` use the exact
  machine Context/Event/State types.
- `useResource(resource.ref(...))` returns the exact resource snapshot/value and
  typed failure representation selected by the public contract.
- `useView(actor, view)` returns the exact inferred view output.
- Provider/runtime compatibility is checked without requiring generated hooks or
  mandatory `bind(App)`.
- React types must not import or expose private runtime implementation types.

## Schema interaction

- A schema validates an already selected input/output type at a real boundary.
- A schema may help author an explicit upstream type when the client chooses the
  Schema-bearing form.
- A downstream result schema cannot redefine upstream Params.
- Schema-free and Schema-bearing versions of the same valid local declaration
  preserve equivalent callback types.
- Schema mismatch is rejected at the schema field/boundary, not repaired with a
  cast or by widening the definition.
- Local execution does not decode/re-encode merely to make inference work.

## Declaration and compiler contract

Public types must remain usable after package build, not only inside source tests.

Required proof:

- package declaration emit;
- `isolatedDeclarations` where supported by the package contract;
- multi-entry declaration consumption;
- packed Launch Workspace declaration emit;
- a minimal external consumer using root, React, testing, inspection, and server
  entry points;
- absence of leaked private paths and unnameable anonymous implementation types;
- no TS7056-style descriptor expansion in the flagship exported surface.

Measure before and after inference changes:

- TypeScript check time;
- declaration-emit time;
- type instantiations;
- declaration file size;
- core build output size;
- Launch Workspace annotation count only when annotations are semantically
  redundant.

Budgets are established from the Phase 0 reset baseline. A change that exceeds a
budget requires a measured client benefit and explicit review; “fewer generics”
alone is not sufficient.

Prefer library-side simplification of repeated mapped/conditional types over
client wrapper types or forced annotations. Do not optimize an alias when the
declaration and instantiation measurements remain flat.

## Positive fixture matrix

Build this matrix incrementally with the concrete family packets. Phase 0 starts
with compact resource, transaction, machine, stream, Layer, and packed-import
fixtures; it must not block runtime work on an exhaustive omnibus suite.

Maintain small focused compile fixtures for:

- explicit input-first resource, transaction, stream, machine, child, and view
  declarations;
- downstream Effect/Stream output, error, and requirement inference;
- Schema-free and optional Schema-bearing calls;
- `never` lane elimination;
- cross-definition refs, submit/run, routes, child bindings, and views;
- exact module/app maps and Layer provision;
- app-scoped fixtures and scenarios;
- React hooks;
- public package declaration consumption.

## Negative fixture matrix

Maintain focused `@ts-expect-error` or equivalent fixtures for:

- wrong Params or attempts to infer Params backwards;
- unsafe narrower callbacks;
- wrong resource ref/value/failure;
- commit/preview/invalidation/concurrency mismatch;
- wrong stream value/failure/route;
- wrong child input/output/failure/route;
- unknown state target or invalid event;
- impossible `never` lane declaration;
- wrong view source/output/equivalence;
- wrong module/app/fixture owner;
- unsatisfied or incorrectly erased Layer requirement;
- wrong React actor/resource/view pairing;
- private declaration leakage and mixed incompatible overload forms.

Negative fixtures prove only the intended error. Avoid specimens that generate
several unrelated diagnostics and become brittle.

## Known TypeScript limits and fallback policy

- Recursive machine/state object inference may require the existing
  `<Context, Event, State>` generic form.
- Inline child success/failure callback contextual typing may require a focused
  annotation or existing helper.
- Very large inferred exported descriptors may require a named exported type
  until the library-side declaration shape is simplified.
- Variadic Layer tuples may require a deliberate public abstraction; do not hide
  an unsolved type with a cast.

When inference fails:

1. verify the desired direction matches runtime data flow;
2. fix the owning public/library type rather than annotate many clients;
3. measure declaration/compiler impact;
4. prefer one local annotation over a new public DSL;
5. document the limit honestly if TypeScript cannot express it soundly.

## Completion gate

- Input-first inference passes for every preserved constructor.
- Types propagate across runtime, test, React, server, and inspection boundaries
  without restatement or erasure.
- Impossible typed lanes are removed while defect/interruption remain.
- Positive and negative fixture matrices pass from source and packed packages.
- Launch Workspace declarations emit without private leaks or expansion failure.
- Compiler/declaration budgets pass or have an approved measured exception.
- No inference improvement requires an unapproved public API redesign.
