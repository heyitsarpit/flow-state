import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noRuntimeTypeofRule } from "./no-runtime-typeof.ts";

const tester = createRuleTester("no-runtime-typeof");

tester.run("no-runtime-typeof-regression", noRuntimeTypeofRule, {
	valid: [
		{ code: "function isText(value: unknown): value is string { return typeof value === \"string\"; }", options: [{ allowInTypeGuards: true }] },
		{ code: "const isString = (value: unknown): value is string => typeof value === \"string\";", options: [{ allowInTypeGuards: true }] },
		{ code: "function isNumber(value: unknown): value is number { if (typeof value === \"number\") return true; return false; }", options: [{ allowInTypeGuards: true }] },
		{ code: "function isObject(value: unknown): value is object { return typeof value === \"object\"; }", options: [{ allowInTypeGuards: true }] },
		{ code: "function isTextOrNumber(value: unknown): value is string | number { return typeof value === \"string\" || typeof value === \"number\"; }", options: [{ allowInTypeGuards: true }] },
	],
	invalid: [
		{ code: "const kind = typeof value;", errors: [{ messageId: "runtimeTypeof" }] },
		{ code: "function classify(value: unknown) { return typeof value; }", errors: [{ messageId: "runtimeTypeof" }] },
		{ code: "const classify = (value: unknown) => typeof value;", errors: [{ messageId: "runtimeTypeof" }] },
		{ code: "function classify(value: unknown) { if (typeof value === \"string\") return value; return \"\"; }", errors: [{ messageId: "runtimeTypeof" }] },
		{ code: "const kind = typeof value === \"string\" ? \"text\" : \"other\";", errors: [{ messageId: "runtimeTypeof" }] },
	],
});
