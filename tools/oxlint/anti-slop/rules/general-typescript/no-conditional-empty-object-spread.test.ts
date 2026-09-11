import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noConditionalEmptyObjectSpreadRule } from "./no-conditional-empty-object-spread.ts";

const tester = createRuleTester("no-conditional-empty-object-spread");

tester.run("no-conditional-empty-object-spread-regression", noConditionalEmptyObjectSpreadRule, {
	valid: [
		"const value = condition ? {} : { enabled: true };",
		"const value = { ...base, enabled: condition };",
		"const value = { ...base };",
		"const value = condition ? { enabled: true } : { disabled: true };",
		"function read(undefined: Record<string, unknown>) { return { ...(condition ? {} : undefined) }; }",
		"const undefined = { enabled: true }; const value = { ...(condition ? {} : undefined) };",
	],
	invalid: [
		{ code: "const value = { ...(condition ? {} : { enabled: true }) };", errors: [{ messageId: "avoid" }] },
		{ code: "const value = { ...(condition ? {} : {}) };", errors: [{ messageId: "avoid" }] },
		{ code: "const value = { ...(condition ? { enabled: true } : { disabled: true }) };", errors: [{ messageId: "avoid" }] },
		{ code: "const value = { ...(condition ? { enabled: true } : undefined) };", errors: [{ messageId: "avoid" }] },
		{ code: "const value = { ...(condition ? undefined : { enabled: true }) };", errors: [{ messageId: "avoid" }] },
		{ code: "const value = { ...((condition ? {} : { enabled: true })) };", errors: [{ messageId: "avoid" }] },
		{ code: "const values = [{ ...(condition ? {} : { enabled: true }) }];", errors: [{ messageId: "avoid" }] },
		{ code: "const value = { ...(condition ? { enabled: true } : {}) };", errors: [{ messageId: "avoid" }] },
		{ code: "const value = { ...((condition ? { enabled: true } : { disabled: true }) as const) };", errors: [{ messageId: "avoid" }] },
		{ code: "const value = { ...((condition ? { enabled: true } : { disabled: true })!) };", errors: [{ messageId: "avoid" }] },
	],
});
