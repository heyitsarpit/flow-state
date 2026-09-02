/**
 * Intentionally invalid anti-slop fixture.
 *
 * This file is excluded from normal workspace lint by vite.config.ts. It is a
 * single visual catalog of the patterns the registered rules reject. Some
 * rules are path-aware: test-only rules report only in *.test.*, *.spec.*, or
 * __tests__ files, while Effect core rules require a non-test domain path.
 *
 * For the accepted alternatives, see ../PREFERENCES.md and
 * ./all-preferred-patterns.ts. The comments below are intentionally short;
 * the reference file records cases where a rule has more than one good form.
 */

import { Context, Data, Effect, Fiber, Ref, Schedule, Schema, Scope } from "effect";

// no-package-dist-or-self-import-in-src
import * as selfPackage from "flow-state";
import { captureTrace } from "../dist/inspect.mjs";
// Prefer: package source imports its owning relative source module; package-name
// imports belong in consumers and build/proof scripts outside src.

// no-public-entrypoint-export-drift
export * from "./internal-types.js";
// Prefer: export { publicValue } or export type { PublicType } explicitly from
// the owning internal module.

// use-import-type
import { DomainValue } from "./domain-types.js";
type ImportedDomainValue = DomainValue;
// Prefer: import type { DomainValue } from "./domain-types.js".

// use-export-type
export { ImportedDomainValue };
// Prefer: export type { ImportedDomainValue }.

// use-consistent-type-definitions
interface MixedStyleShape {
	readonly id: string;
}
// Prefer: use a type alias for this simple object contract.

// no-for-each
items.forEach((item) => callback(item));
items.forEach((item) => item);
// Prefer: use a for...of loop so control flow stays visible.

// no-excessive-cognitive-complexity
function cognitivelyDense(value: boolean, firstValue: boolean, secondValue: boolean): string {
	if (value) {
		if (firstValue) {
			if (secondValue) {
				if (value) {
					if (firstValue) {
						if (secondValue) return "a";
						return "b";
					}
					return "c";
				}
				return "d";
			}
			return "e";
		}
		if (secondValue) return "c";
	}
	if (firstValue && secondValue) return "d";
	if (firstValue || secondValue) return "e";
	return "f";
}
// Prefer: split deeply branching control flow into named helpers.

declare const input: unknown;
declare const knownInput: { readonly id: string };
declare const enabled: boolean;
declare const first: boolean;
declare const second: boolean;
declare const iterable: Iterable<unknown>;
declare const inventory: { readonly id: string };
declare const summary: string;
declare const source: string;
declare const runtime: { dispose(): Promise<void> };
declare const fiber: Fiber.Fiber<unknown, never>;
declare const items: readonly unknown[];
declare const run: (item: unknown) => Effect.Effect<void>;
declare const makeRequest: () => Promise<unknown>;
declare const foreignCall: () => string;
declare const bad: boolean;
declare function callback(value: unknown): void;
declare function register(handler: () => void): void;
declare function buildValue(): unknown;

// no-top-level-mutable-production-state
let moduleState = 0;
// Prefer: keep mutable state behind a service, resource, or factory owner.

// no-direct-process-env
const directEnvironmentValue = process.env.FLOW_STATE_MODE;
// Prefer: read and validate environment configuration at the host boundary.

// no-anonymous-default-export
export default () => knownInput;
// Prefer: a named export or a named default declaration.

// no-god-service-shape
interface BroadDependencies {
	readonly one: unknown;
	readonly two: unknown;
	readonly three: unknown;
	readonly four: unknown;
	readonly five: unknown;
	readonly six: unknown;
	readonly seven: unknown;
	readonly eight: unknown;
	readonly nine: unknown;
	readonly ten: unknown;
	readonly eleven: unknown;
	readonly twelve: unknown;
	readonly thirteen: unknown;
	readonly fourteen: unknown;
	readonly fifteen: unknown;
	readonly sixteen: unknown;
	readonly seventeen: unknown;
}
// Prefer: split this bag into cohesive ports with separate owners.

// no-parallel-diagnostic-errors
class FeatureFailure extends Data.TaggedError("FeatureFailure") {}
class AnotherFeatureFailure extends Schema.TaggedError<AnotherFeatureFailure>()("AnotherFeatureFailure", {}) {}
class LegacyFeatureError extends Error {}
// Prefer: use the canonical Diagnostic with an owned code and projector.

// no-unknown-effect-channel
type ErasedFeatureEffect = Effect.Effect<string, unknown, unknown>;
// Prefer: name the Diagnostic failure and required service contract.

// no-inward-module-dependency, no-generic-utility-module, and
// no-large-production-file are represented by the path-aware RuleTester cases;
// this shared fixture cannot model source-root/basename matching or a
// 500-line production / 1000-line test package source module.

// Native Oxlint/TypeScript rules
const unnecessaryAssertion = knownInput as { readonly id: string };
const unsafeNarrowing = input as { readonly id: string };
const explicitDefaultTypeArgument = identity<string>("value");
function identity<T = string>(value: T): T {
	return value;
}
type UnnecessaryConstraint<T extends unknown> = T;
type EmptyObjectType = {};
interface EmptyInterface {}
declare const unsafeFunction: Function;
const unsafeFunctionResult = unsafeFunction();
const misusedPromiseCondition = makeRequest();
if (misusedPromiseCondition) callback(input);
if (knownInput) callback(input);
register(async () => {
	await makeRequest();
});

type ExhaustiveStatus = "ready" | "blocked";
function incompleteStatusLabel(status: ExhaustiveStatus): string {
	switch (status) {
		case "ready":
			return "ready";
	}
}

function returnsThenBranches(value: boolean): string {
	if (value) return "yes";
	else return "no";
}

const booleanTernary = enabled ? true : false;

namespace LegacyNamespace {
	export const value = "legacy";
}

class StaticOnly {
	static value = "static";
	static create(): StaticOnly {
		return new StaticOnly();
	}
}

// Prefer: remove the unnecessary assertion, use a runtime decoder for a
// narrowing assertion, infer default generic arguments, use a named domain
// type instead of {}, and handle every union case explicitly.

// no-inline-import-type-query
type InlineSnapshot = import("../api/types.js").FlowResourceSnapshot;
// Prefer: import type { FlowResourceSnapshot } from "../api/types.js";

// no-conditional-singleton-array-spread
const conditionalItems = [
	...(first ? ["first"] : []),
	...(second ? [] : ["second"]),
];
// Prefer: build the list with local statements and push each optional value.

// no-ternary-iife
const ternaryIife = enabled ? (() => buildValue())() : input;
// Prefer: use an if statement or a named helper for the multi-step branch.

// no-array-from-then-map
const mappedArrayCopy = Array.from(iterable).map(callback);
// Prefer: Array.from(iterable, callback), or a visible for...of loop.

// no-nested-conditional-expression
const nestedConditional = enabled ? (first ? "first" : "second") : "disabled";
// Prefer: name the intermediate decision or use explicit if/else control flow.

// no-staged-object-assign
const stagedModule = Object.assign({ kind: "module" }, inventory);
const stagedModuleWithSummary = Object.assign(stagedModule, { summary });
// Prefer: compute summary first, then return one object literal.

// no-chained-type-assertions
const chainedAssertion = input as unknown as string;
// Prefer: preserve the original type or decode the unknown value at the boundary.

// no-escape-hatch-assertion
const broadAssertion = input as Record<string, unknown>;
// Prefer: validate into a named domain type instead of asserting into a broad carrier.

// no-explicit-any
const explicitAny: any = input;
// Prefer: preserve a generic, use unknown at an input boundary, or isolate a named adapter.

// no-known-value-widening
const knownObjectWidened: Record<string, unknown> = { id: "known" };
const knownInputWidened: unknown = knownInput;
// Prefer: keep inference, use satisfies, or annotate with the real owner contract.

// no-widen-then-assert
const erasedInput: unknown = { id: "erased" };
const recoveredInput = erasedInput as { readonly id: string };
// Prefer: decode erasedInput before narrowing it.

// no-shallow-json-domain-cast
const shallowJsonDomainValue: { readonly id: string } = JSON.parse(source);
// Prefer: parse as unknown, then complete Schema decoding at the boundary.

// require-safety-comment-for-type-assertion
const unjustifiedAssertion = input as string;
// Prefer: remove the assertion; otherwise state the invariant with a SAFETY comment.

// no-unknown-parameters
function acceptsUnknown(value: unknown): unknown {
	return value;
}
// Prefer: accept and return a named domain type, or keep unknown inside the decoder boundary.

// no-unknown-returns
function returnsUnknown(): unknown {
	return input;
}
// Prefer: return a named result type with a complete decoder behind it.

// no-unknown-type-aliases
type UnknownAlias = unknown;
type CollapsedUnknownAlias = string | unknown;
// Prefer: name the actual domain contract; use unknown only as an input carrier.

// no-unsafe-dictionary-type
const unsafeDictionary: Record<string, unknown> = {};
// Prefer: a named record with a concrete value type, Map, or an explicit opaque extension bag.

// no-object-type
function acceptsObject(value: object): object {
	return value;
}
type ObjectAlias = object;
type ObjectUnion = string | object;
type ObjectGeneric<T extends object = object> = T;
type ObjectArray = Array<object>;
type ObjectTuple = [object, ...object[]];
type ObjectConditional<T> = T extends object ? object : never;
type ObjectProperty = { readonly value: object };
type ObjectWeakMap = WeakMap<object, object>;
type ObjectWeakSet = WeakSet<object>;
// Prefer: a named options or domain type describing the accepted fields.

// no-nullish-function-contracts
type MaybeDomainValue = DomainValue | undefined;
type NullableDomainValue = DomainValue | null;
function acceptsOptionalValue(value?: DomainValue): DomainValue {
	return value ?? knownInput;
}
function acceptsDefaultedValue(value = knownInput): DomainValue {
	return value;
}
function acceptsUndefinedValue(value: DomainValue | undefined): DomainValue {
	return value ?? knownInput;
}
function acceptsNullableValue(value: DomainValue | null): DomainValue {
	return value ?? knownInput;
}
function acceptsAliasedValue(value: MaybeDomainValue): MaybeDomainValue {
	return value;
}
function returnsUndefinedValue(): DomainValue | undefined {
	return knownInput;
}
function returnsNullableValue(): NullableDomainValue {
	return knownInput;
}
function returnsNestedUndefinedValue(): Promise<DomainValue | undefined> {
	return Promise.resolve(knownInput);
}
type OptionalHandler = (value?: DomainValue) => void;
// Prefer: use Option<T> for expected absence, a tagged union for distinct modes,
// or separate functions when the operation is genuinely different.

// no-object-freeze
const frozenInventory = Object.freeze(inventory);
const computedFreeze = Object["freeze"](inventory);
const freeze = Object.freeze;
freeze(inventory);
// Prefer: keep mutation private, return a readonly type, or copy once at the
// ownership boundary without runtime freezing.

// no-optional-domain-properties (configured domain source roots)
interface OptionalDomainProperties {
	missing?: string;
	nullable: string | null;
	absent: string | undefined;
}
class OptionalDomainClass {
	missing?: string;
}
// Prefer: required properties with Option<T> for expected absence.

// no-runtime-typeof
function narrowsRuntimeValue(value: unknown): string {
	if (typeof value === "string") return value;
	return "";
}
// Prefer: decode value at the boundary; a local type guard is valid when it owns that boundary.

// no-conditional-empty-object-spread
const conditionalObject = {
	...(enabled ? {} : { enabled }),
};
// Prefer: create the base object, then add enabled in an explicit if statement.

// no-reflect-apply and no-reflect-get
Reflect.apply(callback, undefined, [input]);
Reflect.get(conditionalObject, "enabled");
// Prefer: callback(input) and conditionalObject.enabled; use a named dynamic-dispatch interface when necessary.

// no-module-mocking
vi.mock("./dependency");
jest.mock("./dependency");
// Prefer: inject a real fake through an interface, Layer, or fixture factory.

// no-shape-in-symbol-names
const shapeSymbol = Symbol("shape");
function shapeProjection(shapeValue: string): string {
	return shapeValue;
}
// Prefer: name the domain concept, such as resourceDescriptor or projectionInput.

// no-redundant-readonly-wrapper
type RedundantReadonly = Readonly<{ readonly id: string }>;
// Prefer: { readonly id: string } or Readonly<{ id: string }>, not both.

// no-bivariant-callback
type BivariantCallback = {
	bivarianceHack(value: string): void;
}["bivarianceHack"];
// Prefer: type Callback = (value: string) => void; add a named compatibility adapter only when required.

// no-local-definite-assignment
let localValue!: string;
// Prefer: initialize the value, restructure the closure, or represent construction as explicit state.

// no-service-shape-parameter-extraction
declare const HostSignals: { of(service: unknown): unknown };
type ExtractedServiceShape = Parameters<(typeof HostSignals)["of"]>[0];
// Prefer: export the service shape from its owner and import that named contract.

// no-effect-runner-in-domain
Effect.runSync(Effect.succeed(1));
// Prefer: yield the Effect; run it only in the runtime, CLI, test, or host boundary.

// no-effect-ref-read-then-write
function staleRefTransition(state: Ref.Ref<number>) {
	const current = Ref.get(state);
	return Ref.set(state, current + 1);
}
// Prefer: Ref.modify(state, transition) or Ref.update(state, transition).

// no-unmanaged-effect-scope
const unmanagedScope = Scope.make();
// Prefer: Effect.acquireRelease(Scope.make(), release).

// no-unwrapped-promise-in-effect-core
const unwrappedPromise = Promise.resolve(input);
const manuallyConstructedPromise = new Promise((resolve) => resolve(input));
// Prefer: Effect.tryPromise/Effect.async in Effect code, or keep Promise conversion in the host adapter.

// no-context-tag
const legacyContextTag = Context.Tag("Legacy");
const legacyContextGenericTag = Context.GenericTag("Legacy");
const legacyEffectService = Effect.Service("Legacy");
// Prefer: class Service extends Context.Service<Service>()("Service") {}.

// no-effect-promise
const forbiddenEffectPromise = Effect.promise(() => Promise.resolve());
// Prefer: make the operation Effect-native; use justified Effect.tryPromise({ try, catch }) only for unavoidable Promise interop.

// no-unjustified-effect-try-promise
const unjustifiedTryPromise = Effect.tryPromise({ try: makeRequest, catch: toDomainError });
// Prefer: change the dependency to return Effect, or add an adjacent standalone FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: justification for unavoidable foreign interop.

// no-implicit-effect-concurrency
const implicitEffectAll = Effect.all(items);
const implicitEffectFilterMap = Effect.filterMapEffect(items, () => Effect.succeed(undefined));
const implicitEffectForEach = Effect.forEach(items, run);
const implicitEffectPartition = Effect.partition(items, run);
const implicitEffectReplicate = Effect.replicateEffect(Effect.void, 2);
const implicitEffectValidate = Effect.validate(items, run);
// Prefer: pass { concurrency: 1 }, a bounded number, or "unbounded" explicitly.

// no-numeric-duration
const numericSleep = Effect.sleep(100);
const numericTimeout = Effect.timeout(100);
const numericTimeoutOption = Effect.timeoutOption(100);
const numericTimeoutFallback = Effect.timeoutOrElse({ duration: 100, orElse: () => Effect.void });
const numericDelay = Effect.delay(100);
const numericCache = Effect.cachedWithTTL(100);
const numericInvalidatingCache = Effect.cachedInvalidateWithTTL(100);
const numericScheduleDuration = Schedule.duration(100);
const numericScheduleDuring = Schedule.during(100);
const numericSchedule = Schedule.exponential(100);
const numericFibonacciSchedule = Schedule.fibonacci(100);
const numericFixedSchedule = Schedule.fixed(100);
const numericSpacedSchedule = Schedule.spaced(100);
const numericWindowedSchedule = Schedule.windowed(100);
const numericBoundedSchedule = Schedule.upTo({ duration: 100 });
// Prefer: Duration.millis(100), Duration.seconds(1), or a unit-tagged duration string.

// no-throw-in-effect-gen
const thrownEffect = Effect.gen(function* () {
	if (bad) throw new Error("defect");
});
const thrownUntracedEffect = Effect.fnUntraced(function* () {
	if (bad) throw new Error("defect");
});
// Prefer: yield* Effect.fail(error) for recovery or Effect.die(cause) for an explicit defect.

// no-raw-try-catch
const rawTryCatch = (() => {
	try {
		return foreignCall();
	} catch (error) {
		return error;
	}
})();
// Prefer: return Result for pure validation or map foreign failure through Effect.tryPromise.

// no-expect-in-if (reported when this source is linted as *.test.ts)
test("conditional assertion", () => {
	if (bad) expect(bad).toBe(true);
});
// Prefer: assert unconditionally, or call expect.assertions/expect.hasAssertions.

// no-unsafe-fiber-methods
fiber.pollUnsafe();
fiber.interruptUnsafe();
// Prefer: the safe Fiber operation, or a named runtime adapter for the unsafe bridge.

// no-swallowed-cleanup-error
await runtime.dispose().catch(() => undefined);
await runtime.dispose().catch(() => void 0);
// Prefer: let cleanup fail the test, assert the expected failure, or report it explicitly.

// no-promise-microtask-barrier (reported when this source is linted as *.test.ts)
await Promise.resolve();
// Prefer: Deferred, Latch, TestClock, or joining the fiber whose progress you need.

void source;
void conditionalItems;
void ternaryIife;
void mappedArrayCopy;
void nestedConditional;
void stagedModuleWithSummary;
void chainedAssertion;
void broadAssertion;
void explicitAny;
void knownObjectWidened;
void knownInputWidened;
void recoveredInput;
void shallowJsonDomainValue;
void unnecessaryAssertion;
void unsafeNarrowing;
void explicitDefaultTypeArgument;
void unsafeFunctionResult;
void misusedPromiseCondition;
void incompleteStatusLabel;
void returnsThenBranches;
void booleanTernary;
void LegacyNamespace;
void MixedStyleShape;
void cognitivelyDense;
void acceptsUnknown;
void returnsUnknown;
void acceptsObject;
void narrowsRuntimeValue;
void shapeSymbol;
void shapeProjection;
void RedundantReadonly;
void BivariantCallback;
void localValue;
void ExtractedServiceShape;
void unwrappedPromise;
void manuallyConstructedPromise;
void forbiddenEffectPromise;
void legacyContextTag;
void legacyContextGenericTag;
void legacyEffectService;
void untypedTryPromise;
void implicitEffectAll;
void implicitEffectFilterMap;
void implicitEffectForEach;
void implicitEffectPartition;
void implicitEffectReplicate;
void implicitEffectValidate;
void numericSleep;
void numericTimeout;
void numericTimeoutOption;
void numericTimeoutFallback;
void numericDelay;
void numericCache;
void numericInvalidatingCache;
void numericScheduleDuration;
void numericScheduleDuring;
void numericSchedule;
void numericFibonacciSchedule;
void numericFixedSchedule;
void numericSpacedSchedule;
void numericWindowedSchedule;
void numericBoundedSchedule;
void thrownEffect;
void thrownUntracedEffect;
void moduleState;
void directEnvironmentValue;
void BroadDependencies;
void FeatureFailure;
void AnotherFeatureFailure;
void LegacyFeatureError;
void ErasedFeatureEffect;
void inlineTryPromise;
void rawTryCatch;
