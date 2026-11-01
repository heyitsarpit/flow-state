import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noNestedConditionalExpressionRule } from "./no-nested-conditional-expression.ts";

const tester = createRuleTester("no-nested-conditional-expression");

tester.run("no-nested-conditional-expression", noNestedConditionalExpressionRule, {
	valid: [
		"const value = enabled ? first : second;",
		"const value = enabled && (first ? one : two);",
		"const value = (enabled ? first : second) && fallback;",
		"const value = getMode() === \"ready\" ? first : fallback;",
		"const value = enabled ? first : getFallback();",
		"const value = condition ? (() => other ? one : two) : fallback;",
	],
	invalid: [
		{
			code: "const value = (enabled ? first : second) ? one : two;",
			errors: [{ messageId: "nestedConditional" }],
		},
		{
			code: "const value = enabled ? first ? one : two : fallback;",
			errors: [{ messageId: "nestedConditional" }],
		},
		{
			code: "const value = enabled ? first : fallback ? one : two;",
			errors: [{ messageId: "nestedConditional" }],
		},
		{
			code: "const value = enabled ? choose(first ? one : two) : fallback;",
			errors: [{ messageId: "nestedConditional" }],
		},
		{
			code: "const value = enabled ? (first ? one : two) : fallback;",
			errors: [{ messageId: "nestedConditional" }],
		},
		{
			code: "const value = enabled ? first : (fallback ? one : two);",
			errors: [{ messageId: "nestedConditional" }],
		},
	],
});
