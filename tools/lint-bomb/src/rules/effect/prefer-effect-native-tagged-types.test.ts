import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { preferEffectNativeTaggedTypesRule } from "./prefer-effect-native-tagged-types.ts";

const tester = createRuleTester("prefer-effect-native-tagged-types");

tester.run("prefer-effect-native-tagged-types", preferEffectNativeTaggedTypesRule, {
	valid: [
		'declare const _tag: unique symbol; type State = { [_tag]: "pending" } | { [_tag]: "active" } | { [_tag]: "closed" };',

		"type Outcome<Value, Failure> = Result.Result<Value, Failure>;",
		"type State = Data.TaggedEnum<{ Pending: {}; Active: {}; Tombstoned: {} }>;",
		'type DomainChoice = { _tag: "left"; value: string } | { _tag: "right"; value: string };',
		'type DuplicateTag = { _tag: "same"; value: string } | { _tag: "same"; retry: true } | { _tag: "other" };',
		'type Singleton = { _tag: "only"; value: string };',
		'type Boundary = typeof BoundarySchema.Type; const BoundarySchema = Schema.Union(Schema.TaggedStruct("A", {}), Schema.TaggedStruct("B", {}));',
		'type KindUnion = { kind: "one" } | { kind: "two" } | { kind: "three" };',
		'type ProjectionEnvelope = { _tag: "one" } | { _tag: "two" } | { _tag: "three" };',
		'type LifecycleCause = { _tag: "one" } | { _tag: "two" } | { _tag: "three" };',
		'type EffectOutcome = { _tag: "success"; value: string } | { _tag: "failure"; error: Error } | { _tag: "defect"; cause: unknown } | { _tag: "interrupt"; cause: unknown };',
		'type SinkFailureReason = { _tag: "Fail"; error: Diagnostic } | { _tag: "Die"; defect: Diagnostic } | { _tag: "Interrupt"; fiberId: Option.Option<number> };',
		'type Fields = { value: string }; type State = (Fields & Readonly<{ _tag: "cold" }>) | (Fields & Readonly<{ _tag: "ready" | "failed" }>) | (Fields & Readonly<{ _tag: "closed" }>);',
		'type Outer = { value: string }; function shadow() { type Outer = { _tag: "one" } | { _tag: "two" } | { _tag: "three" }; return undefined; }',
		"type First = Second; type Second = First;",
		{
			code: 'type State = { _tag: "pending" } | { _tag: "active" };',
			filename: "/project/packages/models-extra/state.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'type State = { _tag: "pending" } | { _tag: "active" };',
			filename: "/project/packages/untrusted/state.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'type WireState = { _tag: "pending" } | { _tag: "active" };',
			filename: "/project/packages/models/transport.ts",
			options: [{ modelRoots: ["/project/packages/models"], excludedFiles: ["/project/packages/models/transport.ts"] }],
		},
		{
			code: 'type Duplicate = { _tag: "same"; a: string } | { _tag: "same"; b: string };',
			filename: "/project/packages/models/state.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'type ProjectionEffectOutcome = { _tag: "success"; value: string } | { _tag: "failure"; error: Error } | { _tag: "defect"; cause: unknown } | { _tag: "interrupt"; cause: unknown };',
			filename: "/project/packages/models/effect.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'type LifecycleFailureReason = { _tag: "Fail"; error: Diagnostic } | { _tag: "Die"; defect: Diagnostic } | { _tag: "Interrupt"; fiberId: Option.Option<number> };',
			filename: "/project/packages/models/effect.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'type Outer = { value: string }; function shadow() { type Outer = { _tag: "one" } | { _tag: "two" }; return undefined; }',
			filename: "/project/packages/models/shadow.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'type Imported = ExternalState; type Generic<T> = T; type NonTag = { kind: "one" } | { kind: "two" };',
			filename: "/project/packages/models/unsupported.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'type GenericState<Value> = { _tag: "one"; value: Value } | { _tag: "two"; value: Value };',
			filename: "/project/packages/models/generic.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'type Readonly<Value> = { value: Value }; type State = Readonly<{ _tag: "one" }> | Readonly<{ _tag: "two" }>; ',
			filename: "/project/packages/models/custom-readonly.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'interface Readonly<Value> { value: Value } type State = Readonly<{ _tag: "one" }> | Readonly<{ _tag: "two" }>;',
			filename: "/project/packages/models/interface-readonly.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'class Readonly<Value> { value!: Value } type State = Readonly<{ _tag: "one" }> | Readonly<{ _tag: "two" }>;',
			filename: "/project/packages/models/class-readonly.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
		{
			code: 'import type { Readonly } from "./custom-readonly.js"; type State = Readonly<{ _tag: "one" }> | Readonly<{ _tag: "two" }>;',
			filename: "/project/packages/models/imported-readonly.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
		},
	],
	invalid: [
		{
			code: 'type State = { ["_tag"]: "pending" } | { ["_tag"]: "active" } | { ["_tag"]: "closed" };',
			errors: [{ messageId: "taggedEnum" }],
		},

		{
			code: 'type Outcome<Value> = { _tag: "observation"; value: Value } | { _tag: "defect"; error: Error };',
			errors: [{ messageId: "result" }],
		},
		{
			code: 'type State = { _tag: "pending" } | { _tag: "active" } | { _tag: "tombstoned" };',
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'export type State = Readonly<{ _tag: "pending" }> | Readonly<{ _tag: "active" }> | Readonly<{ _tag: "tombstoned" }>;',
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type Base = { value: string }; type One = Base & { _tag: "one" }; type Two = Base & { _tag: "two" }; type Three = Base & { _tag: "three" }; type StateUnion = One | Two | Three; type State = StateUnion;',
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type Outer = { _tag: "one" } | { _tag: "two" } | { _tag: "three" }; function shadow() { type Outer = { value: string }; return undefined; }',
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'export type State = { _tag: "pending" } | { _tag: "active" };',
			filename: "/project/packages/models/state.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type StateVariants = { _tag: "pending" } | { _tag: "active" }; export type State = StateVariants;',
			filename: "/project/packages/models/aliases.ts",
			options: [{ modelFiles: ["/project/packages/models/aliases.ts"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type WireConnection = { _tag: "connected"; socket: string } | { _tag: "disconnected"; reason: string };',
			filename: "/project/packages/models/wire-shaped.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type ProjectionValue = { _tag: "stored"; value: string } | { _tag: "missing" };',
			filename: "/project/packages/models/projection.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type CausePayload = { _tag: "stored"; value: string } | { _tag: "missing" };',
			filename: "/project/packages/models/cause.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type Outcome = { _tag: "success"; value: string } | { _tag: "failure"; error: Error };',
			filename: "/project/packages/models/outcome.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "result" }],
		},
		{
			code: 'type Outcome<Value> = { _tag: "observation"; value: Value } | { _tag: "defect"; error: Error };',
			filename: "/project/packages/models/generic-outcome.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "result" }],
		},
		{
			code: 'type State = { _tag: "pending" } | { _tag: "active" } | { _tag: "tombstoned" };',
			filename: "/project/packages/models/three-state.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'export type State = Readonly<{ _tag: "pending" }> | Readonly<{ _tag: "active" }> | Readonly<{ _tag: "tombstoned" }>;',
			filename: "/project/packages/models/readonly-three-state.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type Base = { value: string }; type One = Base & { _tag: "one" }; type Two = Base & { _tag: "two" }; type Three = Base & { _tag: "three" }; type StateUnion = One | Two | Three; type State = StateUnion;',
			filename: "/project/packages/models/aliased-three-state.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type Outer = { _tag: "one" } | { _tag: "two" } | { _tag: "three" }; function shadow() { type Outer = { value: string }; return undefined; }',
			filename: "/project/packages/models/shadowed-three-state.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type ReadonlyState = Readonly<{ _tag: "one" }> | Readonly<{ _tag: "two" }> | Readonly<{ _tag: "three" }>;',
			filename: "/project/packages/models/readonly-state.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type ReadonlyPair = Readonly<{ _tag: "one" }> | Readonly<{ _tag: "two" }>;',
			filename: "/project/packages/models/readonly-pair.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'type T = { _tag: "one" } | { _tag: "two" }; type Wrapper<T> = T; type State = Wrapper<number>;',
			filename: "/project/packages/models/generic-wrapper.ts",
			options: [{ modelRoots: ["/project/packages/models"] }],
			errors: [{
				message: "T hand-writes a closed tagged model. Use Data.TaggedEnum with Data.taggedEnum for trusted domain variants. For admitted or encoded variants, let Schema own the model and derive its matching; do not duplicate it with a parallel Data enum.",
			}],
		},
	],
});

tester.run("effect-owned-tagged-construction", preferEffectNativeTaggedTypesRule, {
	valid: [
		'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: { value: number }; Done: {} }>; const Phase = Data.taggedEnum<Phase>(); const state: Phase = Phase.Ready({ value: 1 });',
		'type Wire = { _tag: "Ready"; value: number }; const value: Wire = { _tag: "Ready", value: 1 };',
		'import { Schema } from "effect"; const Phase = Schema.TaggedStruct("Ready", {}); const wire: typeof Phase.Encoded = { _tag: "Ready" };',
		'namespace Data { export type TaggedEnum<T> = T; } type Phase = Data.TaggedEnum<{ _tag: "Ready" }>; const value: Phase = { _tag: "Ready" };',
		'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; function make<Phase>() { const value = { _tag: "Ready" } as Phase; }',
		'import { Data, Match } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; const matcher = Match.when(({ _tag: "Ready" } satisfies Phase), () => true);',
		{
			filename: "/project/src/wire.ts",
			options: [{ excludedFiles: ["/project/src/wire.ts"] }],
			code: 'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; const wire: Phase = { _tag: "Ready" };',
		},
	],
	invalid: [
		{
			code: 'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: { value: number }; Done: {} }>; const Phase = Data.taggedEnum<Phase>(); const state: Phase = { _tag: "Ready", value: 1 };',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import type * as D from "effect/Data"; type Phase = D.TaggedEnum<{ Ready: {} }>; const state = { ["_tag"]: "Ready" } satisfies Phase;',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; function state(): Phase { return { _tag: "Ready" }; }',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; let state: Phase; state = { _tag: "Ready" };',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import { Schema } from "effect"; const Phase = Schema.TaggedStruct("Ready", {}); type State = typeof Phase.Type; const value: State = { _tag: "Ready" };',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import { Schema } from "effect"; const Phase = Schema.TaggedStruct("Ready", {}); type State = Schema.Schema.Type<typeof Phase>; const value: State = { _tag: "Ready" };',
			errors: [{ messageId: "construction" }],
		},
	],
});

tester.run("tagged-construction-boundaries", preferEffectNativeTaggedTypesRule, {
	valid: [
		'import { Data, Match } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; const matcher = Match.when({ nested: ({ _tag: "Ready" } satisfies Phase) }, () => true);',
		'import { Schema } from "effect"; let Phase = Schema.TaggedStruct("Ready", {}); Phase = alternate; const value: typeof Phase.Type = { _tag: "Ready" };',
		'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; function build() { type Phase = { _tag: "Ready" }; const value: Phase = { _tag: "Ready" }; }',
		'import { Schema } from "effect"; const Phase = { Type: { _tag: "Ready" } }; const value: typeof Phase.Type = { _tag: "Ready" };',
		'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; const _tag = Symbol(); const value: Phase = { [_tag]: "Ready" };',
	],
	invalid: [
		{
			code: 'import * as E from "effect"; type Phase = E.Data.TaggedEnum<{ Ready: {} }>; const value: Phase = { _tag: "Ready" };',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import type { TaggedEnum } from "effect/Data"; type Phase = TaggedEnum<{ Ready: {} }>; const value: Phase = { _tag: "Ready" };',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import { Data, Match } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; const matcher = Match.when("Ready", (): Phase => ({ _tag: "Ready" }));',
			errors: [{ messageId: "construction" }],
		},
	],
});

tester.run("tagged-constructor-inputs", preferEffectNativeTaggedTypesRule, {
	valid: [
		'import { Schema } from "effect"; const Phase = Schema.TaggedStruct("Ready", {}); const state = Phase.make(({ _tag: "Ready" } satisfies typeof Phase.Type));',
		'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: { value: number } }>; const Phase = Data.taggedEnum<Phase>(); const state = Phase.Ready(({ _tag: "Ready", value: 1 } as Phase));',
	],
	invalid: [
		{
			code: 'import { Data } from "effect"; type Phase = Data.TaggedEnum<{ Ready: {} }>; const unrelated = { make: (value: Phase) => value }; const state = unrelated.make(({ _tag: "Ready" } satisfies Phase));',
			errors: [{ messageId: "construction" }],
		},
	],
});
