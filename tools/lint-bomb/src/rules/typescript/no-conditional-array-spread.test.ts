import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noConditionalArraySpreadRule } from "./no-conditional-array-spread.ts";

const tester = createRuleTester("no-conditional-array-spread");

tester.run("no-conditional-array-spread", noConditionalArraySpreadRule, {
	valid: [
		"const values = condition ? [enabled] : [];",
		"const values = condition ? [one, two] : [];",
		"const values = condition ? [one] : [fallback];",
		"const values = [prefix];",
		"const values = [...items];",
		"const values = [...items, suffix];",
		"const values = [prefix]; if (!condition) values.push(enabled);",
	],
	invalid: [
		{
			code: "const values = [...(condition ? [] : [enabled])];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
		{
			code: "const values = [...(condition ? [one, two] : [])];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
		{
			code: "const values = [prefix, ...(condition ? [] : [enabled])];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
		{
			code: "const values = [...(condition ? [one] : [fallback])];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
		{
			code: "const values = [\"redirect\", ...(condition ? [0] : [])];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
		{
			code: "const values = [...(first ? [one] : []), ...(second ? [] : [two])];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
		{
			code: "const values = [...((condition ? [one] : [fallback]))];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
		{
			code: "const values = [...((condition ? [one, two] : []) as const)];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
		{
			code: "const values = [...(condition ? ([one, two] as const) : [])];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
		{
			code: "const values = [...((condition ? [one, two] : [])!)];",
			errors: [{ messageId: "conditionalArraySpreads" }],
		},
	],
});
