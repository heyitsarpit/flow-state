import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noTernaryIifeRule } from "./no-ternary-iife.ts";

const tester = createRuleTester("no-ternary-iife");

tester.run("no-ternary-iife", noTernaryIifeRule, {
	valid: [
		"const value = enabled ? buildValue() : fallback();",
		"const value = enabled ? namedFunction() : otherValue;",
		"const value = enabled ? (() => buildValue) : fallback;",
		"const value = enabled ? (buildValue as Value) : fallback;",
		"const value = enabled ? new Value() : fallback;",
	],
	invalid: [
		{
			code: "const value = enabled ? (() => buildValue())() : fallback;",
			errors: [{ messageId: "ternaryIife" }],
		},
		{
			code: "const value = enabled ? fallback : (function () { return buildValue(); })();",
			errors: [{ messageId: "ternaryIife" }],
		},
		{
			code: "const value = enabled ? (function named() { return buildValue(); })() : fallback;",
			errors: [{ messageId: "ternaryIife" }],
		},
		{
			code: "const value = enabled ? fallback : (() => { return buildValue(); })();",
			errors: [{ messageId: "ternaryIife" }],
		},
		{
			code: "const value = enabled ? ((function () { return 1; }))() : fallback;",
			errors: [{ messageId: "ternaryIife" }],
		},
	],
});
