import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { useExportTypeRule } from "./use-export-type.ts";

const tester = createRuleTester("use-export-type");

tester.run("use-export-type", useExportTypeRule, {
	valid: [
		"type Value = string; export type { Value };",
		"const value = 1; export { value };",
		"interface Value {}; export type { Value };",
		"const runtime = 1; export { runtime as Value };",
		"type Value = string; const runtime = 1; export type { Value }; export { runtime };",
	],
	invalid: [
		{
			code: "type Value = string; export { Value };",
			errors: [{ messageId: "exportType" }],
		},
		{ code: "interface Value {}; export { Value };", errors: [{ messageId: "exportType" }] },
		{ code: 'import type { Value } from "./types.js"; export { Value };', errors: [{ messageId: "exportType" }] },
		{ code: "type A = string; type B = number; export { A, B };", errors: [{ messageId: "exportType" }] },
		{ code: "type A = string; export { A as Alias };", errors: [{ messageId: "exportType" }] },
	],
});
