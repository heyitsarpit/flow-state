import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noObjectIterationResultCastRule } from "./no-object-iteration-result-cast.ts";

const tester = createRuleTester("no-object-iteration-result-cast");

tester.run("no-object-iteration-result-cast", noObjectIterationResultCastRule, {
	valid: [
		"const values = Object.values(definition);",
		"const values = Object.keys(definition) as string[];",
		"// SAFETY: the owner admitted each value before this identity-preserving view.\nconst values = Object.values(definition) as readonly EventToken[];",
		"// SAFETY: the owner admitted each value before this identity-preserving view.\n// oxlint-disable-next-line typescript/no-unsafe-type-assertion\nconst values = Object.values(definition) as readonly EventToken[];",
		"function read(Object: { values(): unknown[] }) { return Object.values(definition) as EventToken[]; }",
	],
	invalid: [
		{
			code: "const values = Object.values(definition) as EventToken[];",
			errors: [{ messageId: "iterationCast" }],
		},
		{
			code: "const entries = <Array<[string, EventToken]>>Object.entries(definition);",
			languageOptions: { sourceType: "module", parserOptions: { lang: "ts" } },
			errors: [{ messageId: "iterationCast" }],
		},
		{
			code: "// SAFETY: unrelated earlier note.\n\nconst values = Object.values(definition) as EventToken[];",
			errors: [{ messageId: "iterationCast" }],
		},
		{
			code: "function read() { return Object.entries(definition) as Array<[string, EventToken]>; }",
			errors: [{ messageId: "iterationCast" }],
		},
		{
			code: 'const values = Object["values"](definition) as readonly EventToken[];',
			errors: [{ messageId: "iterationCast" }],
		},
	],
});
