import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnsafeDictionaryTypeRule } from "./no-unsafe-dictionary-type.ts";

const tester = createRuleTester("no-unsafe-dictionary-type");

tester.run("no-unsafe-dictionary-type-regression", noUnsafeDictionaryTypeRule, {
	valid: [
		"const value: Record<string, string> = {};",
		"const values: Record<string, number> = {};",
		"function make() { type Unknown = unknown; const value: Record<string, Unknown> = {}; return value; }",
		"type Payload = any; function make<Payload>(payload: Payload) { const values: Record<string, Payload> = {}; return values; }",
		"type Payload = any; function make<Payload extends { value: Payload }, Value = Record<string, Payload>>(value: Value): Value { return value; }",
		"type Payload = any; type Box<A extends Record<string, Payload>, Payload = string> = A;",
		"type Payload = any; type Box<Payload extends Record<string, Payload>> = Payload;",
		"type Payload = any; type Box<Payload = string, Value = Record<string, Payload>> = Value;",
		"export {}; type Record = any; function make<Record>(value: Record) { const values: { [key: string]: Record } = {}; return values; }",
		"type StringValues = Record<string, string>; function make<Record>(value: Record): StringValues { return {}; }",
		"type Entry = { id: string }; type Values = Record<string, Entry>;",
		"interface Value {} interface Value { id: string } type Values = Record<string, Value>;",
		"interface Value { id: string } interface Value {} type Values = Record<string, Value>;",
		"type Values = Partial<Record<string, string>>;",
		"type Values = Record<PropertyKey, never>;",
	],
	invalid: [
		{ code: "interface Value { id: string } function make() { interface Value {} const value: Record<string, Value> = {}; return value; }", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "type Values = Record<string, any>;", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "type Payload = any; type Box<Value = Record<string, Payload>, Payload = string> = Value;", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "type Values = Record<string, object>;", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "type Values = Record<PropertyKey, {}>;", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "interface Value {} interface Value {} type Values = Record<string, Value>;", errors: [{ messageId: "unsafeDictionary" }] },
	],
});
