import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { preferEffectNativeTaggedTypesRule } from "./prefer-effect-native-tagged-types.ts";

const tester = createRuleTester("prefer-effect-native-tagged-types");

tester.run("prefer-effect-native-tagged-types", preferEffectNativeTaggedTypesRule, {
	valid: [
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
		'type Fields = { value: string }; type State = (Fields & Readonly<{ _tag: "cold" }>) | (Fields & Readonly<{ _tag: "ready" | "failed" }>) | (Fields & Readonly<{ _tag: "closed" }>);',
		'type Outer = { value: string }; function shadow() { type Outer = { _tag: "one" } | { _tag: "two" } | { _tag: "three" }; return undefined; }',
		"type First = Second; type Second = First;",
	],
	invalid: [
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
	],
});
