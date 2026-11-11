# Rules

Each section gives a practical prescription, a failing target, and the shipped diagnostic text.
Configure path-scoped rules for the boundaries in your repository.

Prescriptions follow the [examples](examples/) and [style reference](STYLE.md).

## no-allocation-in-loop

Opt-in: off in lint-bomb's own config. Scope it with `sourceRoots` to a project's hot paths.

### Prescription

An object, array, `new`, closure or spread inside a loop body, or inside an iteration callback
(`map`, `filter`, `reduce`, `forEach` and the rest), allocates once per element. In a hot path,
hoist it out of the loop, reuse one value, or loop without the per-element callback. When each
element really needs a new value, as when building a result, keep it and disable the line with the
reason. Allocations in a loop's initializer, and spreads into a call's arguments, are not reported.

**Failing target**

```ts
for (const x of xs) out.push({ x });
xs.reduce((all, x) => [...all, ...x], []);
```

**Shipped message**

This allocates once per iteration in a hot path. Hoist it out of the loop, reuse one value, or loop without the per-element callback. If each element needs a new value, as when building a result, keep it and disable this line with the reason.

## no-anonymous-default-export

### Prescription

Give exported behavior a meaningful name. Use a named export or named default declaration so
consumers can identify the boundary.

**Failing target**

```ts
export default () => 1;
```

**Shipped message**

Give this export a meaningful name. Use a named export or named default declaration so consumers can identify the operation or value.

## no-array-from-then-map

### Prescription

Use Array.from(iterable, callback) when mapping can happen during collection without changing
behavior. Materialize first when mapping depends on the completed array or the original iteration
order of effects.

**Failing target**

```ts
const values = Array.from(iterable).map(callback);
```

**Shipped message**

Use Array.from(iterable, callback) to map during collection when behavior is preserved. Retain the separate .map when its callback needs the completed array or when mapping during iteration would change observable effects.

## no-bivariant-callback

### Prescription

Preserve the relationship between the callback input and the values its caller may supply. Declare a
normal function type instead of bypassing parameter checking with an indexed method signature.

**Failing target**

```ts
type Callback<A, B> = { bivarianceHack(args: A): B }["bivarianceHack"];
```

**Shipped message**

This bivarianceHack bypasses safe callback parameter checking. Declare a normal function type so the callback's accepted inputs remain consistent with the values its caller supplies.

## no-chained-type-assertions

### Prescription

Preserve type evidence through the transformation instead of erasing and asserting it back. Keep
inference or generic relationships. For external input, derive the admitted type from its Schema and
decode at admission.

**Failing target**

```ts
const value = input as const as string;
const other = input as unknown as string;
```

`as unknown as T` is not exempt: widening to `unknown` and then asserting asserts with no evidence.
A single widening (`input as unknown`) stays allowed.

**Shipped message**

This assertion chain replaces type evidence with assertions. Preserve the inferred type or generic relationship; for external input, derive the admitted type from its Schema and decode once at admission.

## no-conditional-array-spread

### Prescription

Make collection selection visible through complete branches or explicit insertion into a fresh local
collection. Keep evaluation order and element order unchanged. This is a readability convention, not
proof that conditional spread is incorrect.

**Failing target**

```ts
const values = [...(condition ? [] : [enabled])];
```

**Shipped message**

Make this conditional collection selection explicit. Build the complete branch or insert into a fresh local collection, preserving evaluation order and element order.

## no-conditional-empty-object-spread

### Prescription

Construct a complete value for each alternative. Model meaningful states with their required fields;
use Option for independent domain absence. Preserve omission when an external protocol distinguishes
it from a present field.

**Failing target**

```ts
const value = { ...(condition ? {} : { enabled: true }) };
```

**Shipped message**

Build complete object alternatives in explicit branches. For domain data, use Data.TaggedEnum for trusted state variants, Schema-owned variants at admission, or Option for independent absence. Preserve wire omission when the protocol distinguishes it from a present field.

## no-constant-effect-flatmap

### Prescription

Use Effect.as for a constant success replacement and Effect.asVoid to discard success. Keep
Effect.map for pure value-dependent transformations and Effect.flatMap for choosing subsequent
Effects.

**Failing target**

```ts
import { Effect } from "effect";
Effect.flatMap(() => Effect.succeed(false));
```

**Shipped message**

This flatMap ignores its input and returns a constant success. Use Effect.as(value) to replace success, or Effect.asVoid when deliberately discarding it. Keep Effect.map for pure value-dependent transformations and Effect.flatMap for choosing subsequent Effects.

## no-context-tag

### Prescription

Declare an injectable capability with Context.Service<Self, Contract> and an explicit operation
contract. Supply implementations through Layers. Keep operation payloads as arguments and pure
transformations as plain functions.

**Failing target**

```ts
import { Context } from "effect";
Context.Tag("Service");
```

**Shipped message**

Declare the capability with Effect v4 Context.Service<Self, Contract>()("ServiceId") and provide its implementation through a Layer. Keep operation payloads as arguments and pure transformations as plain functions.

## no-direct-process-env

### Prescription

Read configuration at application composition or Service construction through Config and
ConfigProvider. Reuse Schema constraints with Config.schema. Pass typed settings inward or capture
them in the owning Service Layer.
Alias analysis follows lexical writes and treats conditional process aliases as possible reads.
It does not infer assignments performed by called helper functions.

**Failing target**

```ts
const value = process.env.VALUE;
```

**Shipped message**

Load validated configuration through Config and ConfigProvider at application composition or configured Service construction. Reuse Schema constraints with Config.schema, then pass typed settings inward or capture them in the owning Service Layer instead of reading process.env in domain code.

## no-eager-stateful-effect-succeed

### Prescription

Keep execution-time mutation inside the owner's Effect-native operation or Effect.sync.
This warning detects direct assignments and increments to captured or parameter bindings inside
Effect.succeed arguments. It skips local builders, tests, and recognized execution callbacks.
It does not infer mutation from helper calls, collection methods, or unsafe method names.
Callback exemptions cover inline Effect.gen/fn/fnUntraced bodies and
Effect.sync/suspend/map/flatMap/tap/andThen callbacks. Effect.fnUntracedEager is not exempt:
its synchronous prefix executes when called. Other execution contexts are not resolved.
Consumer configuration controls severity; the example application selects warn.

**Failing target**

```ts
import { Effect } from "effect";
const increment = (state: { count: number }) => Effect.succeed(++state.count);
```

**Shipped message**

This Effect.succeed argument writes to captured or parameter state during argument evaluation. For execution-time mutation, use the owner's Effect-native operation or Effect.sync so each execution performs the change. Pure construction can remain in Effect.succeed.

## no-effect-promise

### Prescription

Prefer an Effect-native dependency. Adapt an unavoidable foreign Promise once with object-form
Effect.tryPromise, translating rejection into the adapter contract. Keep subsequent domain
composition Effect-native.

**Failing target**

```ts
import { Effect } from "effect";
Effect.promise(() => Promise.resolve(1));
```

**Shipped message**

Effect.promise is forbidden. Make the operation Effect-native; use Effect.tryPromise({ try, catch }) only for unavoidable Promise interop.

## no-effect-ref-read-then-write

### Prescription

When a decision depends on current shared state, read, decide, and publish together through
Ref.modify. Use Ref.update for a pure state-only transition. Keep external effects outside the
transition, as the reservation owner does in [booking.ts](examples/booking.ts).
Detection correlates lexical Ref bindings and straight-line aliases. Conditional writes make
alias identity uncertain; assignments inside called helpers are not analyzed.

**Failing target**

```ts
import { Effect, Ref } from "effect";

const increment = (state: Ref.Ref<number>) =>
  Effect.gen(function* () {
    const current = yield* Ref.get(state);
    yield* Ref.set(state, current + 1);
  });
```

**Shipped message**

This Ref.set follows a separate Ref.get on the same Ref. If the decision depends on that read, publish it atomically with Ref.update for a state-only transition or Ref.modify when returning a result. Keep external effects outside the transition; preserve any intentional separate observations or existing synchronization.

## no-effect-runner-in-domain

### Prescription

Return composable Effects from domain boundaries and yield them inside existing workflows. Supply
dependencies through Layers. Execute the assembled program at its host boundary; own and dispose a
ManagedRuntime when the host needs repeated calls.

**Failing target**

```ts
import { Effect } from "effect";
Effect.gen(function* () {
  yield* Effect.runPromise(Effect.succeed(1));
});
```

**Shipped messages**

Return this Effect to the caller and compose dependencies through Layers. Execute the assembled program only at its configured host boundary; when the host needs repeated calls, own and dispose its ManagedRuntime there.

Yield this Effect instead of starting another runtime inside the workflow. Preserve dependencies, interruption, and resource lifetime in the existing execution.

## no-empty-context-make-unsafe

### Prescription

Construct an empty Context with Context.empty. Use capability-aware Context construction for
populated contexts; reserve unsafe construction for an adapter with an established map contract.
Context retains the supplied map, so do not mutate it after construction.

**Failing target**

```ts
import { Context } from "effect";
Context.makeUnsafe(new Map());
```

**Shipped message**

Use Context.empty() for an empty context. Context.makeUnsafe retains the supplied Map as its base; do not mutate the map after construction. For populated contexts, prefer typed Context.make or Context.add; reserve Context.makeUnsafe for a documented adapter whose map contract is already established.

## no-escape-hatch-assertion

### Prescription

Keep precise inferred types, generic relationships, and named protocols. Decode unknown external
data through Schema. Isolate unavoidable erasure in a documented adapter; do not revalidate trusted
values merely to eliminate a cast.

**Failing target**

```ts
const value = input as any;
```

**Shipped message**

This assertion erases type evidence. Preserve the inferred type, generic relationship, or named protocol. Decode unknown external data with Schema at admission, and isolate unavoidable erasure in a documented adapter. Do not revalidate trusted values merely to remove a cast.

## no-excessive-cognitive-complexity

### Prescription

Simplify decisions or extract a boundary that owns a coherent concern, invariant, or reusable
transformation. Keep ordering and workflow policy visible at composition. Preserve related state
transitions together; do not extract helpers solely to reduce the metric. The default threshold is
15 with at least 3 branching constructs; this example uses threshold 2.

**Failing target**

```ts
function configured(value) {
  if (value) return 1;
  if (value) return 2;
  if (value) return 3;
}
```

**Shipped message**

Function `{{name}}` has cognitive complexity {{complexity}} (threshold {{threshold}}). Simplify decisions or extract a boundary with a coherent responsibility. Keep ordering and workflow policy visible, preserve failure behavior and related state transitions, and do not add helpers solely to reduce the score.

## no-expect-in-if

### Prescription

Make required observations unavoidable. Assert the expected outcome before inspecting
case-specific fields. For an intentional conditional assertion, use a literal `expect.assertions(N)`
only when N matches the recognized assertion count and each assertion site is directly in the test
callback and structurally runs at most once. `expect.hasAssertions()` does not prove the branch ran;
this is a syntax check, not a runtime-path proof.

**Failing target**

File: `src/example.test.ts`.

```ts
test("works", () => {
  if (value) expect(value).toBe(true);
});
```

**Shipped message**

This assertion is conditional and may never run. Assert its expected outcome unconditionally before inspecting case-specific fields. For an intentional conditional assertion, expect.assertions(N) is accepted only when N matches the recognized assertion count and every assertion site can run at most once; expect.hasAssertions() does not prove this branch ran.

## no-explicit-any

### Prescription

Preserve the value contract with a generic, inferred type, or named protocol. Keep unknown at
external admission and decode with Schema. Confine necessary type erasure to a documented adapter;
the adapter still needs a scoped rule suppression.

**Failing target**

File: `src/domain.ts`.

```ts
const value: any = 1;
```

**Shipped message**

This explicit any erases the value contract. Preserve a generic, inferred type, or named protocol. Keep unknown at a genuine external admission boundary and decode with Schema before passing values downstream. Confine unavoidable erasure to a documented adapter; use a narrow, reasoned suppression when necessary, because a name or documentation alone does not exempt this check.

## no-for-each

### Prescription

Use for...of for imperative iteration or Effect.forEach with an explicit concurrency policy for
Effectful traversal. Native .forEach discards callback results and does not await asynchronous work.
Returning an Effect from its callback does not execute it. The blanket ban is a preventive style
convention. This syntax matcher also reports custom methods named .forEach, where the native-method
explanation may not apply.

**Failing target**

```ts
items.forEach((item) => consume(item));
```

**Shipped message**

This rule flags member calls named .forEach; inspect the receiver before applying native Array.forEach advice. Native Array.prototype.forEach discards callback results and does not await asynchronous work; returning an Effect does not execute it. Use for...of for imperative iteration or Effect.forEach with an explicit concurrency policy for Effectful traversal.

## no-generic-utility-module

### Prescription

Name a module after its coherent responsibility. Keep domain knowledge with its domain, even when
many consumers reuse it. Put genuinely generic reused functions in focused shared modules, and reuse
library operations first. Keep small private helpers with their consumer. Do not duplicate functions,
create a Service, or create a file per helper merely to avoid a utility filename.

**Failing target**

File: `src/utils.ts`.

```ts
export const parseValue = () => 1;
```

**Shipped message**

Name this module after its coherent responsibility. Keep domain knowledge with its domain; put genuinely generic, reused functions in focused shared modules. Reuse existing library operations first, and do not duplicate functions or create a file per helper merely to avoid a utility filename.

## no-god-service-shape

### Prescription

Review whether operations serve one cohesive capability. Split independent authority or lifetimes
into explicit Service contracts and compose their Layers. Keep operations together when their shared
invariants require one owner. The threshold counts every member, so treat it as a review prompt, not
proof that a contract lacks cohesion.

**Failing target**

File: `src/service.ts`.

```ts
interface LargeService {
  one(): void;
  two(): void;
  three(): void;
  four(): void;
  five(): void;
  six(): void;
  seven(): void;
  eight(): void;
  nine(): void;
  ten(): void;
  eleven(): void;
  twelve(): void;
  thirteen(): void;
  fourteen(): void;
  fifteen(): void;
  sixteen(): void;
  seventeen(): void;
}
```

**Shipped message**

`{{name}}` has {{members}} type members, including properties, methods, and signatures. Review whether this service-like contract groups one cohesive capability. Split independent authority or lifetimes into explicit contracts and compose Service Layers where appropriate; keep operations together when shared invariants require one owner. Member count alone does not justify a split.

## no-implicit-effect-concurrency

### Prescription

Choose traversal concurrency explicitly at the composition site. Use 1 for serial execution, a
finite budget for bounded parallel work, or unbounded only as a deliberate application policy. State
ownership must enforce correctness independently of that choice.

**Failing target**

```ts
import { Effect } from "effect";
Effect.all(items);
```

**Shipped message**

Effect.{{method}} runs sequentially by default. Choose an explicit concurrency policy at this composition site: 1 for serial execution, a finite budget for bounded parallel work, or "unbounded" when deliberate. This rule checks explicitness; state ownership must enforce correctness independently of concurrency.

## no-inline-import-type-query

### Prescription

Declare reusable type dependencies with named import type declarations. Keep the dependency visible
at module scope. Preserve declaration-file and generated-code exceptions.

**Failing target**

```ts
type Snapshot = import("../api/types.js").FlowResourceSnapshot;
```

**Shipped message**

Replace this inline import type query with a named `import type` declaration. Declaration and generated files are exempt.

## no-inward-module-dependency

### Prescription

Keep configured dependency direction explicit. Core consumers depend on the required protocol or
capability contract; application composition selects implementations. Use Layer wiring for Effect
Services without inventing Services for pure values. Configure nonempty source and forbidden roots;
the rule has no implicit architecture boundary. Overlapping profiles apply all matching
forbidden-root constraints; profile order does not change enforcement.

**Failing target**

File: `src/core/value.ts`. Configure `sourceRoot: "src/core"` and `forbiddenRoots: ["src/cli"]`.

```ts
import { run } from "../cli/run.js";
void run;
```

**Shipped messages**

Configure explicit nonempty architecture boundaries for this rule; see its options.

Core code must not import the configured boundary `{{root}}`. Depend on the required protocol or capability contract and select implementations at application composition. Use Layer wiring for Effect Services; keep pure transformations as plain functions.

## no-known-value-widening

### Prescription

Preserve inferred fields, literal relationships, and generic information through use. Use satisfies
to check compatibility without replacing inference. Keep an explicit named contract when that
abstraction is intentional; do not replace valid finite-key dictionaries merely because they use
Record.

**Failing target**

```ts
const labels: Record<string, string> = { save: "Save" };
```

**Shipped message**

The explicit {{target}} type on {{subject}} discards known type evidence. Preserve inference and generic relationships, or check compatibility with satisfies. Keep deliberate named contracts and valid finite-key dictionaries; review whether a broader dictionary is intentionally open before replacing it.

## no-large-production-file

### Prescription

Review cohesion and the number of concerns a reader must trace. Split independent responsibilities
at meaningful boundaries when justified. Keep one invariant owner intact; line count alone does not
justify more files. Lines that hold only a comment do not count, so documentation never pushes a
module over. This example uses `productionThreshold: 3`; the default is 500 lines.

**Failing target**

File: `src/custom.ts`.

```ts
const customValue0 = 0;
const customValue1 = 1;
const customValue2 = 2;
const customValue3 = 3;
```

**Shipped message**

This source module has {{lines}} lines, not counting comments. Review whether its responsibilities remain cohesive and extract independent concerns when justified. Keep related invariants and their owner together; line count alone does not justify arbitrary file splits.

## no-local-definite-assignment

### Prescription

Construct the value at declaration or return it from explicit control flow. Let TypeScript establish
assignment before use rather than suppressing the uninitialized state with a definite-assignment
assertion. This rule flags suppression of TypeScript's definite-assignment proof; it does not prove
that a runtime read is uninitialized.

**Failing target**

```ts
let app!: App;
app = createApp();
```

**Shipped message**

This assertion suppresses TypeScript's definite-assignment proof for the local variable; it does not establish whether runtime initialization is safe. Initialize the variable at its declaration or restructure control flow so TypeScript can prove assignment.

## no-manual-effect-error-tag

### Prescription

Recover selected expected errors with Effect.catchTag or catchTags; use catchReason or catchReasons
for supported nested reasons. Translate error vocabularies with mapError. Preserve the original
fallback, failure channels, and interruption behavior.

**Failing target**

```ts
import { Effect } from "effect";
Effect.catch((error) => (error._tag === "NotFound" ? recover : fail));
```

**Shipped messages**

Use Effect.catchTag or Effect.catchTags for selective tagged-error recovery. Preserve the existing fallback and failure channels; do not drop recovery for other cases. Use Effect.mapError when translating error vocabulary rather than recovering.

Use Effect.catchReason or Effect.catchReasons for selective recovery from supported tagged reasons. Preserve the existing fallback, failure channels, and interruption behavior; replacing selected cases must not discard other handling.

## no-manual-tag-comparison

### Prescription

For case tests, use Option.isSome/isNone, Result.isSuccess/isFailure, or Exit.isSuccess/isFailure.
Use $is from Data.taggedEnum for trusted variants, or .isAnyOf from Schema.TaggedUnion or
Schema.toTaggedUnion for Schema-owned variants. For dispatch, use Option.match, Result.match,
Exit.match, Data.taggedEnum's $match, or the Schema union's .match as appropriate.
Use Predicate.isTagged for other admitted case tests and Match.value with Match.tag or
Match.tagsExhaustive for other admitted tagged unions. These guards do not validate unknown payloads.
Detection covers selected Effect constructors and aliases, not every application-defined variant.

**Failing target**

```ts
import { Option } from "effect";
Option.some(1)._tag === "Some";
```

**Shipped messages**

For a case test, use Option.isSome/isNone, Result.isSuccess/isFailure, or Exit.isSuccess/isFailure for those values. For trusted variants use $is from Data.taggedEnum; for Schema-owned variants use .isAnyOf from Schema.TaggedUnion or Schema.toTaggedUnion. Use Predicate.isTagged for other admitted tagged values. These guards do not validate unknown payloads.

Dispatch with Option.match, Result.match, or Exit.match for those values; use $match from Data.taggedEnum for trusted variants or .match from Schema.TaggedUnion/Schema.toTaggedUnion for Schema-owned variants. For other admitted tagged unions, use Match.value with Match.tag or Match.tagsExhaustive. Preserve every existing case and any intentional fallback.

## no-module-level-mutable-state

### Prescription

Allocate mutable application instances inside their owning Service Layer. Expose domain operations
instead of storage handles, and share instances through Layer composition. Keep Service identities,
lazy Layers, static tables, and private synchronous initialization at module scope when appropriate.
The initialization exception is limited to private classes with static identifier-keyed methods when
every reference is a direct call in an initialization-only call graph. Exported or escaping classes,
instance/computed methods, async/generator methods, and runtime callbacks remain reports. The
diagnostic does not prove every reported helper is an application operation. Configure `sourceRoots`
or `applicationFiles`; without an inclusion scope, this rule is inactive.

**Failing target**

Configured Effect application source; module-level application state, whether private or exported.

```ts
import { Effect } from "effect";

type Member = { id: string };

const members = new Map<string, Member>();

export const register = (member: Member) =>
  Effect.sync(() => {
    members.set(member.id, member);
  });
```

**Shipped message**

This module-level state is mutated by application operations. Allocate it inside its owning Service Layer and expose domain operations.

## no-module-mocking

### Prescription

Test the unchanged consumer and real internal owners. Replace a named external capability through
its existing contract; supply an alternative Layer for an Effect Service. Keep test state fresh
unless shared ownership is intentional.

**Failing target**

File: `src/example.test.ts`.

```ts
import { vi } from "vitest";
vi.mock("./dependency");
```

**Shipped message**

Provide an alternative implementation of a named external dependency through its real contract. For Effect Services, supply an alternative Layer; exercise the unchanged consumer and real internal owners. Keep test state fresh unless sharing is intentional, and do not invent interfaces solely to mock internal functions.

## no-nested-conditional-expression

### Prescription

Use branches or a named intermediate for simple decisions; otherwise use the matcher that owns the
model: Data.taggedEnum, a Schema tagged union, Option/Result/Exit, or Match. Preserve laziness,
evaluation order, complete handling, and intentional fallbacks. Do not invent a model just to remove
a ternary.

**Failing target**

```ts
const value = (enabled ? first : second) ? one : two;
```

**Shipped message**

Replace nested conditional expressions with clear decisions. Use if branches or name an intermediate decision for simple control flow. For trusted tagged variants, use $match from Data.taggedEnum; for Schema-owned variants, use .match from Schema.TaggedUnion or Schema.toTaggedUnion. Use Option.match, Result.match, or Exit.match for those values. Use Match.value/Match.type with Match.when when structural or predicate cases read more clearly. Preserve branch laziness, evaluation order, and intentional fallbacks; require exhaustive handling when the contract covers every case.

## no-nullish-function-contracts

### Prescription

Represent meaningful absence with required Option inputs or outputs. Use Result for pure rejection
and Effect's E channel for execution failure. Intentional default parameters are allowed: a default
can resolve omission before the function body without introducing a domain absence. Explicit
nullish annotations and optional parameters remain checked, including annotations on defaulted
parameters. Do not introduce Option solely to replace a sensible default.

**Failing target**

```ts
function find(value?: string): string {
  return value ?? "fallback";
}
```

**Shipped message**

Function contract `{{name}}` includes an optional parameter or explicitly nullish type. Use Option for meaningful absence, Result for pure rejection, or Effect's E channel for execution failure. Intentional default parameters are allowed; explicit nullish annotations remain subject to this rule.

## no-numeric-duration

### Prescription

Make elapsed units explicit with Duration constructors or unit-tagged duration strings. Keep retry
policy in Schedule and read time through Clock. Use TestClock for deterministic elapsed-time tests;
unit spelling alone does not establish timing correctness.

**Failing target**

```ts
import { Effect } from "effect";
Effect.sleep(100);
```

**Shipped message**

Bare numeric durations hide their unit. Use Duration.seconds/millis or a unit-tagged duration string.

## no-empty-object-type

### Prescription

`{}` accepts any non-nullish value, not an empty object. Declare the fields a value carries, use
`Record<string, never>` for an object with no keys, or `unknown` for any value. The one exception
is an empty variant of a `Data.TaggedEnum`, where `{}` means "this case carries no data". This
replaces Oxlint's `typescript/no-empty-object-type`, which also bans that use; turn that one off.

**Failing target**

```ts
type Value = {};
interface Empty {}
```

**Passing target**

```ts
type Answer = Data.TaggedEnum<{ Landed: {}; Refused: { reason: string } }>;
```

**Shipped message**

`{}` accepts any non-nullish value, not an empty object. Declare the fields this value carries, use `Record<string, never>` for an object with no keys, or `unknown` for any value. An empty variant of a Data.TaggedEnum may keep `{}`.

An empty interface accepts any non-nullish value. Declare its fields, or use a type alias for what it really means.

## no-object-freeze

### Prescription

Keep ordinary internal trusted values plain. At retention and publication boundaries, establish the
required ownership guarantee through controlled access and appropriate copying. Retain runtime
freezing when the contract requires it; shallow freeze alone does not isolate nested mutable values.
The matcher reports references to Object.freeze, including references without a call.

**Failing target**

```ts
Object.freeze(value);
```

**Shipped message**

Review this reference to Object.freeze and any call sites against the owner contract. Remove unnecessary freezing of internal trusted values; retain freezing required by an observable contract. Capture owned representations of retained mutable input and publish detached values when isolation is required. Shallow freezing alone does not protect nested mutable values.

## no-object-iteration-result-cast

### Prescription

Preserve established collection value types with typed Record or Struct operations instead of
recreating them with a cast. Decode external elements only at their actual admission boundary. An
assertion justified by preserved facts requires a specific safety argument; it does not require
repeated validation. The matcher recognizes selected assertion shapes; it does not compare inferred
and asserted element types.

**Failing target**

```ts
const values = Object.values(definition) as EventToken[];
```

**Shipped message**

This rule flags a direct cast on Object.entries/values; it does not compare inferred and asserted element types. If the required relationships are missing from inference, use Record.toEntries or Record.values from effect when their inferred types preserve them, or preserve those relationships in the collection's declared contract. Decode genuinely external elements with Schema at admission; do not revalidate trusted values merely to remove a cast.

## no-object-type

### Prescription

Describe the facts consumers actually need through a named protocol or preserved generic
relationship. Avoid the broad object keyword in configured application contracts. A type name alone
does not make an equally broad contract useful. If the broad contract is intentional and no
semantics-preserving protocol is available, keep it with a narrow suppression and reason.

**Failing target**

```ts
function read(value: object): object {
  return value;
}
```

**Shipped message**

The TypeScript object type does not describe the facts this consumer needs. Declare the required protocol fields or preserve the input/output relationship with a generic. A pure value needs no state owner, and giving an equally broad type a name does not strengthen its contract.

## no-optional-domain-properties

### Prescription

Use a required Option for independent absence. Put state-specific required fields in their tagged
variant. Normalize wire omission, null, and undefined through Schema only when they share one
meaning; preserve distinctions required by the protocol.

**Failing target**

```ts
interface Value {
  value?: string;
}
```

**Shipped message**

Use a required Option for independent absence. Put state-specific required fields in their variant: Data.TaggedEnum for trusted states or Schema.TaggedUnion for admitted states. Normalize wire omission, null, and undefined with Schema.OptionFromOptionalNullOr only when they mean the same thing; preserve distinctions required by the protocol.

## no-package-dist-or-self-import-in-src

### Prescription

Import the owning source module directly from package internals. Keep public entrypoints as consumer
routes and generated output as build output. Configure the package name and source boundary; the
rule has no implicit package identity.

**Failing target**

File: `src/domain.ts`. Configure the package name and `sourceRoot: "src"`.

```ts
import * as packageApi from "@scope/package";
```

**Shipped messages**

Configure explicit nonempty architecture boundaries for this rule; see its options.

Package source must not import its own public package name. Import the owning source module directly.

Package source must not import built dist output. Import the owning source module directly.

## no-promise-microtask-barrier

### Prescription

Wait for a contract-owned readiness or completion signal, such as Deferred.await. Control elapsed
Effect time with TestClock. Advancing time or yielding a microtask does not independently prove that
a lifecycle transition occurred.

**Failing target**

File: `src/example.test.ts`.

```ts
async function flush() {
  await Promise.resolve();
}
```

**Shipped message**

A microtask turn does not prove readiness or completion. Await a contract-owned lifecycle signal, such as Deferred.await. Use TestClock to control elapsed Effect time; advancing time does not independently prove that a lifecycle transition occurred.

## no-public-entrypoint-export-drift

### Prescription

Declare public exports explicitly and import their internal owners directly. Keep separate public
routes independent so internal additions cannot silently expand another route. Configure the actual
entrypoints explicitly; the rule has no implicit package entrypoint list.

**Failing target**

File: `src/index.ts`. Configure `sourceRoot: "src"` and list `index.ts` among `entrypoints`.

```ts
export * from "./core/api/types.js";
```

**Shipped messages**

Configure explicit nonempty architecture boundaries for this rule; see its options.

Public entrypoints must list exports explicitly so internal additions cannot drift into the public API.

Public entrypoints must not compose through another public entrypoint. Import the owning internal module instead.

## no-raw-try-catch

### Prescription

Use Schema parsers for admission and Result for pure expected rejection; Result is not an exception
catcher. Adapt synchronous foreign exceptions with object-form Effect.try and foreign Promise
rejections with object-form Effect.tryPromise. Compose existing Effects directly through gen,
flatMap, or other combinators. Use mapError for error translation and catchTag/catchTags for selective
recovery. Preserve required fallbacks and failure channels.

Effect.try establishes Effect<A, E, never> from a synchronous callback and its error mapper.
It does not execute an Effect returned by the callback or lift that inner Effect's channels.
Existing Effects keep their requirements through composition; mapError deliberately changes E
while preserving A and R. Do not run an Effect inside a constructor merely to catch its failure.

**Failing target**

File: `src/runtime/adapter.ts`.

```ts
try {
  work();
} catch (error) {
  report(error);
}
```

**Shipped message**

Raw try/catch is forbidden here. Use Schema parsers for admission and Result for pure expected rejection. Adapt synchronous foreign exceptions with Effect.try({ try, catch }) and foreign Promise rejections with Effect.tryPromise({ try, catch }). Compose existing Effects directly; use Effect.mapError for error translation and Effect.catchTag/catchTags for selective recovery. Effect.try does not execute a returned Effect or lift its A/E/R channels into the outer Effect.

## no-readonly

### Prescription

Keep internal trusted records plain unless the contract needs immutability. Preserve required public
readonly guarantees. Protect retained facts through ownership and detached publication where
required; readonly syntax alone does not provide runtime isolation.

Option `allowInExportedTypes` (default `false`) skips `readonly` inside an exported type alias or
interface. Use it for a library whose public types carry `readonly` as part of their contract, as
Effect's do. Internal types and function parameters are still checked.

**Failing target**

```ts
type Value = { readonly value: string };
```

**Shipped message**

Review whether this readonly declaration is required by the observable contract. Keep ordinary internal trusted records plain and retain required public readonly guarantees. Protect retained facts through ownership and detached publication where needed; readonly syntax alone does not provide runtime isolation. Do not introduce Data merely to replace readonly spelling.

## no-reduce-accumulator-copy

### Prescription

Avoid repeatedly copying a growing accumulator. Mutate a fresh local builder before publication, or
use a collection operation with the required output and traversal semantics. Never mutate
caller-owned or already-published state merely to remove copies.

**Failing target**

```ts
items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});
```

**Shipped message**

Repeatedly copying a growing reducer accumulator can cause quadratic work. Mutate a fresh, locally owned builder before publication, or use a collection operation with the required output and traversal semantics. Preserve copying when the initial state is shared or prior versions must remain observable; never mutate caller-owned or published state merely to remove copies.

## no-redundant-readonly-wrapper

### Prescription

Use one readonly representation when the public contract requires it. For ordinary internal records,
remove unnecessary qualification under the same ownership policy as no-readonly. Coordinate
diagnostics so the suggested correction does not trigger a conflicting rule.

**Failing target**

```ts
type Value = Readonly<{ readonly value: string }>;

type Event = Data.TaggedEnum<{ Opened: { readonly id: string } }>;
```

**Shipped message**

This Readonly wrapper duplicates readonly members. If the contract requires readonly, keep one spelling; otherwise use a plain internal record. Preserve public guarantees and configure required readonly contracts as exceptions to the broader readonly review policy rather than removing them to silence another diagnostic.

TaggedEnum already makes member fields readonly. Remove this readonly modifier; nested readonly types still need their own spelling.

## no-reflect-apply

### Prescription

Call through a typed function contract so argument and result relationships remain visible. Model
unavoidable dynamic dispatch at an explicit adapter. Preserve receiver binding when replacing
Reflect.apply; a direct unbound call may change behavior.

**Failing target**

```ts
Reflect.apply(callback, undefined, [value]);
```

**Shipped message**

Replace Reflect.apply with a call through a typed function contract, preserving argument and result relationships. Preserve receiver binding: a bare callback call is not equivalent when the original receiver matters. Keep unavoidable dynamic invocation in an explicit adapter with a declared dispatch contract.

## no-reflect-get

### Prescription

Use typed property access on an established protocol. Decode unknown input at admission; preserve
generic key/value relationships for trusted dynamic access. Do not revalidate a trusted object
merely because its key is selected dynamically. If a dynamic read or explicit receiver is essential,
keep it behind a typed adapter that states its key/value and getter contract.

**Failing target**

```ts
Reflect.get(value, key);
```

**Shipped message**

Use typed property access that preserves the key/value relationship. Decode external unknown input with Schema at admission and carry that type downstream. If Reflect.get uses an explicit receiver, preserve its getter semantics when redesigning the access.

## no-runtime-typeof

### Prescription

Inspect the declared/inferred type, control-flow narrowing, and admission provenance before choosing
a replacement. Remove checks for established facts. Establish missing facts with Schema at admission
and use Predicate guards only for genuine local narrowing; use model-specific matchers for declared
variants. This syntax rule does not analyze types or prove that validation is missing.

**Failing target**

```ts
const kind = typeof value;
```

**Shipped message**

Runtime typeof is disallowed. Inspect declared/inferred value, property and return types, control-flow narrowing, and provenance first; remove checks whose facts are already established. If facts are missing, establish them with Schema at admission and strengthen the downstream protocol. Use Predicate.isString/isNumber/hasProperty only for genuine local narrowing, or the declared tagged model, Option or Result guards/matchers for their own variants.

## no-service-shape-parameter-extraction

### Prescription

Declare the capability operation contract explicitly in Context.Service<Self, Contract>. Let the
Layer implementation satisfy that contract and infer its construction dependencies. Do not recover
the public contract indirectly from the Service.of constructor machinery.

**Failing target**

```ts
import { Context } from "effect";
class Service extends Context.Service<Service>()("Service") {}
type Value = Parameters<(typeof Service)["of"]>[0];
```

**Shipped message**

Declare the capability contract directly in Context.Service<Self, Contract> and let its Layer satisfy it. Do not recover the public contract through Parameters<(typeof Service)["of"]>[0]; infer construction dependencies from the implementation.

## no-shallow-json-domain-cast

### Prescription

Declare one Schema.fromJsonString codec for the JSON protocol and derive reusable decoders and
encoders as needed. Use Effect parsers in workflows or Result parsers for synchronous admission.
Reuse schema-aware HTTP or storage adapters when they already own decoding.

**Failing target**

```ts
const value = JSON.parse(source) as DomainValue;
```

**Shipped message**

This JSON.parse path does not establish an admitted domain value. Define a Schema.fromJsonString codec and reuse Schema.decodeEffect or Schema.decodeResult at the JSON boundary. Reuse a schema-aware adapter when it already owns decoding.

## no-shape-in-symbol-names

### Prescription

Name application symbols for their responsibility or protocol meaning. Treat the configured naming
ban as a project convention; a word alone cannot establish duplicated authority or incorrect data
modeling.

**Failing target**

```ts
const shapeValue = 1;
```

**Shipped message**

Rename symbol "{{name}}" for its domain role; "shape" describes structure rather than ownership.

## no-staged-object-assign

### Prescription

Compute derived fields before constructing a complete value. Return one object literal when
construction does not require observable intermediate mutation. Preserve property precedence and any
meaningful source-evaluation behavior.
Detection follows direct construction and reassignment syntax. It does not prove the target's
identity across conditional assignments or infer mutations performed by called helpers.

**Failing target**

```ts
function create() {
  const value = Object.assign({ kind: "module" }, inventory);
  return Object.assign(value, { summary });
}
```

**Shipped message**

Compute derived values first and construct one complete object literal when behavior is equivalent. Preserve property overwrite precedence, source evaluation, getter/setter behavior, and any observable intermediate identity.

## no-stateful-effect-construction

### Prescription

Defer execution-time writes to captured owner state with its Effect-native operation, Effect.sync,
or an executed Effect.gen/Effect.fn generator. Use Effect.suspend for an Effect-producing factory.
Keep fresh local builders plain. Deferred.make and Scope.make already describe lazy allocation;
do not wrap them merely because they are constructors. Allocate mutable initial values inside the
intended execution or Layer lifetime: a fresh Ref does not copy its initial Map.

This is a warning in the example configuration. It recognizes captured assignments/updates and
direct mutations of captured bindings initialized with unshadowed native Map, Set, Array, or array
literals. It excludes fresh same-function builders, reassigned bindings, custom/imported receivers,
and collection aliases. For Effect.sync and Effect.suspend, stable local const/function callbacks are
linked when all external reads are direct arguments at recognized deferred positions. Direct
self-recursion is allowed only with a deferred external root. Other eager calls, escaping or unknown
uses, reassignment, and exported declarations prevent this exemption.
Effect-return inference is syntactic, not TypeScript checking; arbitrary helper side effects and
intentional timing contracts require review.

Recognized deferred callbacks include sync/suspend, selected combinators, Effect.gen (including
its `{ self }` form), Effect.fn, Effect.fnUntraced, the `try` callback of Effect.try, the
Effect.acquireRelease finalizer, and the use/release callbacks of Effect.acquireUseRelease.
Effect.fnUntracedEager receives no lazy exemption: only captured writes in its eager prefix are
reported; that prefix continues across explicit Effect.succeed and Effect.void yields. Branches
are checked separately, so a yield in one branch does not suppress an eager path through another.
Necessarily preceding non-success yields stop the eager path. Assignments and increments inside succeed arguments belong to the paired eager-value
warning; direct native mutator calls stay in this rule.

Resource acquisition also checks direct Effect.acquireRelease/acquireUseRelease calls. A succeed
argument containing a constructor or factory call, including a stable const alias, is eager.
A direct sync callback returning such a captured alias does not defer its creation.
Passed-in handles, lazy acquisition Effects, primitives, test files, and opaque helpers are excluded.
This is a review warning, not proof of a leak; intentional ownership transfers remain valid.

**Failing target: eager resource acquisition**

```ts
import { Effect } from "effect";
const resource = Effect.acquireRelease(Effect.succeed(openResource()), closeResource);
```

**Corrected target**

```ts
const resource = Effect.acquireRelease(Effect.sync(openResource), closeResource);
```

Use Effect.try instead when synchronous acquisition can throw, and Effect.tryPromise for Promise interop.

**Failing target**

Existing detection: captured assignments during Effect construction.

```ts
import { Effect } from "effect";
let revision = 0;
function make(): Effect.Effect<void> {
  revision += 1;
  return Effect.void;
}
```

Detection also covers direct mutations of captured built-in collections. Here the Layer owns the Map,
but calling register mutates it before the returned Effect executes.

```ts
const layer = Layer.effect(
  MemberRegistry,
  Effect.sync(() => {
    const members = new Map<string, Member>();

    const register = (member: Member) => {
      members.set(member.id, member);

      return Effect.void;
    };

    return MemberRegistry.of({ register });
  }),
);
```

**Shipped messages**

Review this captured-state write during Effect construction. For execution-time mutation, use the owner's Effect-native operation, Effect.sync for a synchronous operation, or an executed Effect.gen/Effect.fn generator. Use Effect.suspend for an Effect-producing factory. Keep fresh local builders plain and do not wrap already-lazy constructors such as Deferred.make or Scope.make. Mutable initial values must be allocated in the intended execution or Layer lifetime.

Review this resource-producing expression evaluated before acquisition. Construct the resource inside the acquire Effect: Effect.sync for nonthrowing synchronous creation, Effect.try for throwing creation, or Effect.tryPromise for Promise interop. Keep intentional ownership transfers explicit; moving an existing handle into a thunk does not create it lazily.

## no-swallowed-cleanup-error

### Prescription

Keep cleanup failures observable in tests, including JS/TS files in conventional `test/` and
`tests/` directories. Production `testing/` directories are not included by that convention.
Await successful cleanup directly; assert an expected
rejection explicitly. For Effect cleanup, inspect Effect.exit when defects, interruption, or
combined causes are part of the tested contract.

**Failing target**

File: `src/example.test.ts`.

```ts
await runtime.dispose().catch(() => undefined);
```

**Shipped message**

This cleanup rejection is converted to success, so the test cannot detect failed cleanup. Await the Promise directly or use assert.rejects for an expected rejection; for Effect cleanup, inspect Effect.exit when the complete Cause matters.

## no-ternary-iife

### Prescription

Express branch-local work through ordinary control flow or a meaningful named boundary. Keep branch
evaluation lazy and preserve its result; avoid an immediately invoked wrapper whose only role is
fitting statements into an expression.

**Failing target**

```ts
const value = enabled ? (() => buildValue())() : fallback;
```

**Shipped message**

Remove a trivial immediately invoked wrapper; otherwise use explicit branches or a meaningful named function. Preserve lazy branch evaluation and the branch result.

## no-throw-in-core

Opt-in: off in lint-bomb's own config. Scope it with `sourceRoots` to a project's pure core, and
name its defect constructors with `defects`.

### Prescription

A pure core returns expected failures as values: a `Result`, an `Option`, or a tagged variant its
caller matches. It throws only a defect, an invariant the code itself guarantees and found broken,
through one of the configured constructors or functions, such as `throw new Defect(...)` or
`throw unreachable(x)`.

**Failing target**

```ts
const admit = (input: Input) => {
  throw new Error("quota exceeded");
};
```

**Shipped message**

A pure core returns expected failures as values: a Result, an Option, or a tagged variant the caller matches. Throw only a defect, an invariant this code guarantees and found broken, using one of the configured defect constructors.

## no-throw-in-effect-gen

### Prescription

Represent expected failure with Effect.fail and a declared domain error. Use Effect.die for an
invariant defect. Native throws become defects outside the typed E channel; they do not inherently
bypass Effect finalizers. Detection follows direct workflow execution, local helpers called there,
immediate IIFEs, and execution callbacks such as Effect.sync. Escaping nested functions and the
Effect.try try callback are not attributed to the workflow.

**Failing target**

```ts
import { Effect } from "effect";
Effect.gen(function* () {
  throw new Error("boom");
});
```

**Shipped message**

Yield Effect.fail with a tagged error for expected failure, or Effect.die for an invariant defect. Native throw bypasses the typed E channel, but does not inherently bypass Effect finalizers. Compose the Effect without starting a nested runtime.

## no-unjustified-effect-try-promise

### Prescription

Prefer Effect-native dependencies. At an unavoidable foreign Promise seam, use Effect.tryPromise({
try, catch }) and document the constraint. Translate rejection into a domain Data.TaggedError, or
Schema.TaggedError when the error has an encoded contract. Preserve the underlying cause.

The adjacent waiver uses the legacy `FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE` marker.

**Failing target**

```ts
import { Effect } from "effect";
Effect.tryPromise({ try: work, catch: mapError });
```

**Shipped messages**

Prefer an Effect-native dependency. For unavoidable Promise interop, use Effect.tryPromise({ try, catch }) at the foreign adapter and add an adjacent FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: reason explaining the constraint. Translate rejection into a domain tagged error and preserve its cause.

Use Effect.tryPromise({ try, catch }) at the foreign adapter. Translate rejection into Data.TaggedError internally or Schema.TaggedError for an encoded error contract, preserving the underlying cause.

## no-unknown

### Prescription

Preserve named protocols and generic relationships inside the application. At configured admission
boundaries, derive validation and the admitted type from Schema. Keep unknown only where the
boundary genuinely receives unconstrained data or a documented erasure requires it. The recognized
Schema guard exception is limited to supported `Schema.Schema.Type` / `Schema.Type` forms and
the direct `typeof StableSchema.Type` form, with the target derived from the same stable schema
binding used by `Schema.is` or `Schema.asserts`. The rule does not verify arbitrary schema/type
equivalence. The FLOW_STATE_ALLOW_UNKNOWN waiver convention is Flow State-specific.

**Failing target**

```ts
type Box = { value: unknown };
```

**Shipped message**

This explicit unknown is outside the rule's recognized exceptions. Preserve the named type or generic relationship. External input may remain unknown at its boundary; decode it with Schema before downstream use. Document intentional erasure with FLOW_STATE_ALLOW_UNKNOWN:.

**Failing target — configured admission**

File: `src/admission/profile.ts`. The `admissionRoots` or `admissionFiles` option enables this diagnostic.

```ts
type Profile = { name: string };
const isProfile = (value: unknown): value is Profile => true;
```

**Shipped message**

This configured admission implementation declares a type predicate for unknown or any input that is not tied to a recognized Schema-derived result. Use a Schema decoder or return a guard derived from the same Schema; this rule checks syntax and does not verify arbitrary schema/type equivalence.

## no-unmanaged-effect-scope

### Prescription

Prefer an existing scope or Effect.scoped when no separate scope handle is required. When creating a
child scope explicitly, register Scope.close with Effect.acquireRelease in its owning lifetime.
Acquisition syntax alone does not prove that the finalizer closes the correct scope with the
required Exit.

**Failing target**

```ts
import { Scope } from "effect";
function open() {
  const scope = Scope.make();
  return scope;
}
```

**Shipped message**

Own this Scope.make with Effect.acquireRelease and close it with Scope.close during release. Prefer Effect.scoped when no explicit scope handle is needed.

## no-unsafe-dictionary-type

### Prescription

Give dictionary values a concrete named, generic, or Schema-derived contract. Preserve finite-key
relationships where required. Admit external payloads before insertion, then let consumers rely on
those established facts.

**Failing target**

```ts
type Values = Record<string, any>;
```

**Shipped message**

This dictionary's {{value}} value type gives callers no concrete value contract. Use an owner/schema-derived value type; parse external payloads before insertion.

## no-unsafe-fiber-methods

### Prescription

Use Fiber.join or Fiber.await when the contract requires waiting, and Fiber.interrupt for
cooperative cancellation. Keep necessary immediate nonblocking runtime inspection at its configured
host owner. Waiting is not a behavior-preserving replacement for polling.

**Failing target**

```ts
import { Fiber } from "effect";
declare const fiber: Fiber.Fiber<number, never>;
fiber.pollUnsafe();
```

**Shipped message**

Fiber.{{method}} is a runtime hook. Use Fiber.await or Fiber.join to wait, and Fiber.interrupt to cancel. Keep required nonblocking runtime inspection at the configured host boundary; waiting is not equivalent to polling.

## no-unwrapped-promise-in-effect-core

### Prescription

Keep domain execution Effect-native. At a foreign adapter, use object-form Effect.tryPromise for
Promise APIs or Effect.callback for callback registration. Convert Effects to host Promises only at
the configured host boundary.

**Failing target**

```ts
import { Effect } from "effect";
const value = Promise.resolve(1);
```

**Shipped message**

Keep Promise conversion in the foreign adapter: use Effect.tryPromise({ try, catch }) for Promise APIs or Effect.callback for callback APIs. Return Effects through domain code, or move host conversion to its configured boundary.

## no-widen-then-assert

### Prescription

Carry the original inferred type or generic relationship from construction through consumption. Do
not widen to a broad container and then assert the original facts back. Decode genuinely unknown
boundary input once.

**Failing target**

```ts
const erased: any = { id: "x" };
const value = erased as { id: string };
```

**Shipped message**

Binding "{{name}}" discards type evidence and later recreates it with an assertion. Keep the precise type from initialization through use; parse boundary input once.

## prefer-effect-native-tagged-types

Two-state model checks apply only to trusted-model files explicitly included in the rule options.

### Prescription

Use Data.TaggedEnum and Data.taggedEnum for trusted closed domain cases. Use Result for pure
success/failure and Exit when a complete Effect outcome is required. Let Schema own admitted or
encoded variants and derive matching from that same model; do not add a parallel Data enum.

Value construction checks apply to explicit annotations resolving to local Data.TaggedEnum aliases
or supported Schema.Type / Schema.Schema.Type / typeof LocalSchema.Type forms. They cover bindings,
assignments, direct returns, assertions, and satisfies. Simple local type aliases resolve lexically.
Match.when/not patterns, known constructor inputs, and exact excludedFiles are exempt.
Encoded wire types remain separate. Direct schema bindings cover Struct, TaggedStruct, TaggedUnion,
and Union; arbitrary schema-producing helpers are not resolved.
Imported model definitions, generic wrappers, and inferred value contexts are not resolved.

**Failing target: handwritten owned value**

```ts
import { Data } from "effect";
type Phase = Data.TaggedEnum<{ Ready: { value: number }; Done: {} }>;
const Phase = Data.taggedEnum<Phase>();
const state: Phase = { _tag: "Ready", value: 1 };
```

**Corrected target**

```ts
const state: Phase = Phase.Ready({ value: 1 });
```

**Failing target**

```ts
type Outcome<Value> = { _tag: "observation"; value: Value } | { _tag: "defect"; error: Error };
```

**Shipped messages**

{{name}} hand-writes success and failure alternatives. Use Result.Result<Success, Failure> for a pure outcome, or Exit for a complete Effect outcome. If this is an admitted or encoded contract, let Schema own its variants.

{{name}} hand-writes a closed tagged model. Use Data.TaggedEnum with Data.taggedEnum for trusted domain variants. For admitted or encoded variants, let Schema own the model and derive its matching; do not duplicate it with a parallel Data enum.

Use the constructor that owns {{model}}: a Data.taggedEnum variant constructor or the Schema-owned .make or variant constructor. Do not hand-write _tag or duplicate a Schema model with Data.

## prefer-inferred-return-types

### Prescription

Preserve precise inferred results, including Effect success, error, and requirement channels. Keep
explicit return contracts when they protect a public boundary or resolve an inference limitation,
with a meaningful RETURN_TYPE reason. Do not inline behavior or add casts merely to avoid the
convention.

**Failing target**

```ts
function read(): string {
  return "value";
}
```

**Shipped message**

Prefer an inferred return type: repeated annotations add maintenance and can hide precise inference. Remove it if the contract is preserved, or add an adjacent // RETURN_TYPE: comment explaining the required contract or inference limitation. Keep meaningful function names; do not inline or add casts just to avoid this warning.

## require-readable-spacing

### Prescription

Separate declarations and logical statement groups with readable whitespace. Keep related short
bindings together and attach comments to their declarations. Treat this as formatting policy without
adding conceptual layers or helper functions.

**Failing target**

```ts
const a = 1;
/** B docs. */
const b = 2;
```

**Shipped messages**

Unexpected blank line before this statement.

Expected blank line before this statement.

## require-safety-comment-for-type-assertion

### Prescription

Prefer constructions and generic relationships that preserve type evidence. When an assertion is
unavoidable, state the specific established invariant in an adjacent SAFETY comment. Except for
`as const` and direct assertions to `unknown`, every type assertion needs the comment. The rule checks
for a comment; it does not validate input or establish that the invariant is sound.

**Failing target**

```ts
const value = input as DomainValue;
```

**Shipped message**

Prefer construction or generic relationships that preserve type evidence. If this assertion is unavoidable, add an adjacent SAFETY: comment stating the specific established invariant. A comment does not validate input or make an unsound assertion safe.

## use-consistent-type-definitions

### Prescription

Use type aliases for simple object contracts under the default convention. Preserve interfaces where
declaration merging, inheritance, or an existing external contract requires them. Apply configured
preferences without implying that either syntax validates values. Direct top-level merges in the
same file are recognized; cross-file augmentation is outside that check, so do not mechanically
convert an interface whose public contract depends on augmentation.

**Failing target**

```ts
interface Value {
  value: string;
}
```

**Shipped messages**

Prefer a `type` alias for this simple object contract unless declaration merging or public augmentation is intentional. The project default is `type`.

Prefer an `interface` for this simple object contract. Configure `preference: "type"` if this module intentionally uses type aliases.

## use-export-type

### Prescription

Mark type-only public exports with top-level export type. Keep value exports explicit so the emitted
runtime surface reflects the public contract.

**Failing target**

```ts
type Value = string;
export { Value };
```

**Shipped message**

This export carries only types. Use top-level `export type { ... }` to make the public boundary explicit.

## use-import-type

### Prescription

Mark type-only dependencies with top-level import type. Keep runtime dependencies visible and
preserve any intentionally required module side effects separately.

**Failing target**

```ts
import { Value } from "./types.js";
type Result = Value;
```

**Shipped message**

This import is used only as a type. Use top-level `import type { ... }` so runtime dependencies remain explicit. Preserve any required module side effects with a separate side-effect import.
