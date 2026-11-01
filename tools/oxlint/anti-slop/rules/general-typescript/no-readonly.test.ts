import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noReadonlyRule } from "./no-readonly.ts";

const tester = createRuleTester("no-readonly");

tester.run("no-readonly", noReadonlyRule, {
	valid: [
		'import { Data } from "effect"; class Value extends Data.Class<{ value: string }> {}',
		"type Value = { value: string };",
		"type Value = string[];",
		"interface MutableValue { value: string; }",
		"class Value { value: string; }",
	],
	invalid: [
		{
			code: "type Value = { readonly value: string };",
			errors: [{ messageId: "readonly" }],
		},
		{
			code: "type Value = Readonly<{ value: string }>;",
			errors: [{ messageId: "readonly" }],
		},
		{
			code: "type Value = ReadonlyMap<string, number>; type Other = ReadonlySet<string>; type More = ReadonlyArray<string>;",
			errors: [{ messageId: "readonly" }, { messageId: "readonly" }, { messageId: "readonly" }],
		},
		{
			code: "type Value = readonly string[]; type Pair = readonly [string, number];",
			errors: [{ messageId: "readonly" }, { messageId: "readonly" }],
		},
		{
			code: "interface Value { readonly value: string; readonly [key: string]: string }",
			errors: [{ messageId: "readonly" }, { messageId: "readonly" }],
		},
		{
			code: "type Value<T> = { readonly [Key in keyof T]: T[Key] };",
			errors: [{ messageId: "readonly" }],
		},
		{
			code: "class Value { readonly value = 1; constructor(readonly label: string) {} }",
			errors: [{ messageId: "readonly" }, { messageId: "readonly" }],
		},
	],
});
