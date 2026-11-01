import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noArrayFromThenMapRule } from "./no-array-from-then-map.ts";

const tester = createRuleTester("no-array-from-then-map");

tester.run("no-array-from-then-map", noArrayFromThenMapRule, {
	valid: [
		"const values = Array.from(iterable, callback);",
		"const values = Array.from(iterable, callback).map(otherCallback);",
		"const values = iterable.map(callback);",
		"const copied = Array.from(iterable); const values = copied.map(callback);",
		"function convert(Array) { return Array.from(iterable).map(callback); }",
	],
	invalid: [
		{
			code: "const values = Array.from(iterable).map(callback);",
			errors: [{ messageId: "arrayFromThenMap" }],
		},
		{
			code: "const values = (Array.from(iterable)).map(callback);",
			errors: [{ messageId: "arrayFromThenMap" }],
		},
		{
			code: "const values = ((Array.from(iterable))).map(callback);",
			errors: [{ messageId: "arrayFromThenMap" }],
		},
		{
			code: "const values = Array.from(iterable as Iterable<Value>).map(callback);",
			errors: [{ messageId: "arrayFromThenMap" }],
		},
		{
			code: "const values = Array.from(iterable).map(callback).filter(Boolean);",
			errors: [{ messageId: "arrayFromThenMap" }],
		},
	],
});
