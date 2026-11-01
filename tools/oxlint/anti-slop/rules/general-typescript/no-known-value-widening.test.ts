import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noKnownValueWideningRule } from "./no-known-value-widening.ts";

const tester = createRuleTester("no-known-value-widening");

tester.run("no-known-value-widening-regression", noKnownValueWideningRule, {
	valid: [
		"const value = { id: 1 };",
		"const value: unknown = input;",
		"const value: unknown = {};",
		"const value: unknown = {} as unknown;",
		"const value: object = input;",
		"const value: Record<string, unknown> = {};",
		"const value: Record<string, unknown> = { id: 1 };",
		"const value: string = \"known\";",
	],
	invalid: [
		{ code: "const value: object = { id: 1 };", errors: [{ messageId: "widening" }] },
		{
			code: "function make() { type Bag = Record<string, string>; const value: Bag = { key: \"value\" }; return value; }",
			errors: [{ messageId: "widening" }],
		},
	],
});
