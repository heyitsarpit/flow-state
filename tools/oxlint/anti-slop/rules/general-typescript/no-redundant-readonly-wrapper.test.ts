import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noRedundantReadonlyWrapperRule } from "./no-redundant-readonly-wrapper.ts";

const tester = createRuleTester("no-redundant-readonly-wrapper");

tester.run("no-redundant-readonly-wrapper", noRedundantReadonlyWrapperRule, {
	valid: [
		"type Value = { readonly value: string };",
		"type Value = Readonly<{ value: string }> ;",
		"type Value = Readonly<{ readonly value: string; mutable: number }>;",
		"type Value = Readonly<Record<string, string>>;",
		"type Value = Readonly<{}>;",
		"type Value = Readonly<{ method(): void }>;",
	],
	invalid: [
		{
			code: "type Value = Readonly<{ readonly value: string }>;",
			errors: [{ messageId: "redundant" }],
		},
		{
			code: "type Value = Readonly<{ readonly id: string; readonly name: string }>;",
			errors: [{ messageId: "redundant" }],
		},
		{
			code: "type Value = Readonly<{ readonly [key: string]: string }>;",
			errors: [{ messageId: "redundant" }],
		},
		{
			code: "type Value = Readonly<({ readonly value: string })>;",
			errors: [{ messageId: "redundant" }],
		},
		{
			code: "type Value = Readonly<{ readonly nested: { readonly id: string } }>;",
			errors: [{ messageId: "redundant" }],
		},
	],
});
