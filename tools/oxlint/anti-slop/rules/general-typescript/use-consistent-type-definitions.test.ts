import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { useConsistentTypeDefinitionsRule } from "./use-consistent-type-definitions.ts";

const tester = createRuleTester("use-consistent-type-definitions");

tester.run("use-consistent-type-definitions", useConsistentTypeDefinitionsRule, {
	valid: [
		"type Value = { value: string };",
		"interface Value extends Base { value: string; }",
		"declare interface Value { value: string; }",
		"type Value = string;",
		{ code: "interface Other extends Base { value: string; }", options: [{ preference: "interface" }] },
	],
	invalid: [
		{
			code: "interface Value { value: string }",
			errors: [{ messageId: "preferType" }],
		},
		{ code: "interface Value { method(): void; }", errors: [{ messageId: "preferType" }] },
		{ code: "interface Value { readonly label: string; }", options: [{ preference: "type" }], errors: [{ messageId: "preferType" }] },
		{ code: "interface Values { [key: string]: string; }", options: [{ preference: "type" }], errors: [{ messageId: "preferType" }] },
		{ code: "interface Value { value: string; }", options: [{ preference: "type" }], errors: [{ messageId: "preferType" }] },
		{
			code: "type Value = { value: string };",
			options: [{ preference: "interface" }],
			errors: [{ messageId: "preferInterface" }],
		},
		{
			code: "type Values = { [key: string]: string };",
			options: [{ preference: "interface" }],
			errors: [{ messageId: "preferInterface" }],
		},
	],
});
