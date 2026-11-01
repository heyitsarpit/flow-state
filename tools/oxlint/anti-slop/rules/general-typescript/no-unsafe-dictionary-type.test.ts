import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnsafeDictionaryTypeRule } from "./no-unsafe-dictionary-type.ts";

const tester = createRuleTester("no-unsafe-dictionary-type");

tester.run("no-unsafe-dictionary-type-regression", noUnsafeDictionaryTypeRule, {
	valid: [
		"const value: Record<string, string> = {};",
		"const values: Record<string, number> = {};",
		"function make() { type Unknown = unknown; const value: Record<string, Unknown> = {}; return value; }",
		"type Entry = { id: string }; type Values = Record<string, Entry>;",
		"type Values = Partial<Record<string, string>>;",
		"type Values = Record<PropertyKey, never>;",
	],
	invalid: [
		{ code: "interface Value { id: string } function make() { interface Value {} const value: Record<string, Value> = {}; return value; }", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "type Values = Record<string, any>;", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "type Values = Record<string, object>;", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "type Values = Record<PropertyKey, {}>;", errors: [{ messageId: "unsafeDictionary" }] },
	],
});
