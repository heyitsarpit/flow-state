import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noObjectTypeRule } from "./no-object-type.ts";

const tester = createRuleTester("no-object-type");

tester.run("no-object-type-regression", noObjectTypeRule, {
	valid: [
		{ code: "function read(value: { readonly id: string }): { readonly id: string } { return value; }", filename: "/project/packages/flow-state-rewrite/src/value.ts" },
		{ code: "const kind = typeof value; const text = \"object\";", filename: "/project/packages/flow-state-rewrite/src/value.ts" },
		{ code: "function read(value: object): object { return value; }", filename: "/project/packages/flow-state/src/value.ts" },
		{ code: "type Value = object;", filename: "/project/packages/other/src/value.ts" },
		{ code: "type Value = object;", filename: "/project/packages/flow-state/src/value.ts" },
	],
	invalid: [
		{
			code: "function read(value: object): object { return value; }",
			filename: "/project/packages/flow-state-rewrite/src/value.ts",
			errors: [{ messageId: "objectType" }, { messageId: "objectType" }],
		},
		{
			code: "type Value = object; type Union = string | object; type Alias<T extends object = object> = T;",
			filename: "/project/packages/flow-state-rewrite/src/value.ts",
			errors: [
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
			],
		},
		{
			code: "type Generic = Array<object>; type Tuple = [object, ...object[]]; type Conditional<T> = T extends object ? object : never;",
			filename: "/project/packages/flow-state-rewrite/src/test/value.test.ts",
			errors: [
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
			],
		},
		{
			code: "type Properties = { value: object }; type MapValue = WeakMap<object, object>; type SetValue = WeakSet<object>;",
			filename: "/project/packages/flow-state-rewrite/src/value.ts",
			errors: [
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
			],
		},
		{
			code: "type Nested = { value: object };",
			filename: "/project/packages/flow-state-rewrite/src/value.ts",
			errors: [{ messageId: "objectType" }],
		},
	],
});
