import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEscapeHatchAssertionRule } from "./no-escape-hatch-assertion.ts";

const tester = createRuleTester("no-escape-hatch-assertion");

tester.run("no-escape-hatch-assertion", noEscapeHatchAssertionRule, {
	valid: [
		"const value = input as const;",
		"const value = input as string;",
		"const value = input as unknown;",
		"const value = input as unknown as string;",
		"const value = input as DomainValue;",
		"const value = input as { id: string };",
		"const value = input as Record<string, unknown>;",
	],
	invalid: [
		{ code: "const value = input as any;", errors: [{ messageId: "escapeHatch" }] },
		{ code: "const value = <any>input;", errors: [{ messageId: "escapeHatch" }] },
	],
});
