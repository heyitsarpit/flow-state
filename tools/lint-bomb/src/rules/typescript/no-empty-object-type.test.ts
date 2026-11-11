import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEmptyObjectTypeRule } from "./no-empty-object-type.ts";

const tester = createRuleTester("no-empty-object-type");

tester.run("no-empty-object-type", noEmptyObjectTypeRule, {
	valid: [
		'import { Data } from "effect"; type Answer = Data.TaggedEnum<{ Landed: {}; Refused: { reason: string } }>;',
		"type Answer = TaggedEnum<{ Idle: {} }>;",
		"type Value = { value: string };",
		"type None = Record<string, never>;",
		"interface Named extends Base {}",
		"interface Value { value: string }",
	],
	invalid: [
		{
			code: "type Value = {};",
			errors: [{ messageId: "emptyObject" }],
		},
		{
			code: "const f = (value: {}) => value;",
			errors: [{ messageId: "emptyObject" }],
		},
		{
			code: "type Wrapped = Box<{ Idle: {} }>;",
			errors: [{ messageId: "emptyObject" }],
		},
		{
			code: "type Nested = Data.TaggedEnum<{ Busy: { inner: {} } }>;",
			errors: [{ messageId: "emptyObject" }],
		},
		{
			code: "interface Empty {}",
			errors: [{ messageId: "emptyInterface" }],
		},
	],
});
