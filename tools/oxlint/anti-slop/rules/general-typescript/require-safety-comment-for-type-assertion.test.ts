import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { requireSafetyCommentForTypeAssertionRule } from "./require-safety-comment-for-type-assertion.ts";

const tester = createRuleTester("require-safety-comment-for-type-assertion");

tester.run("require-safety-comment-for-type-assertion-regression", requireSafetyCommentForTypeAssertionRule, {
	valid: [
		"const value = input as const;",
		"// SAFETY: schema validation above proves the invariant.\nconst value = input as DomainValue;",
		"const value = input satisfies DomainValue;",
		"const value = <const>input;",
		"function read(input: unknown) { /* SAFETY: decoder checked input. */ return input as DomainValue; }",
	],
	invalid: [
		{ code: "const value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "const value = <DomainValue>input;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "// NOTE: this cast is convenient.\nconst value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "function read(input: unknown) { return input as DomainValue; }", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "const value = (input as DomainValue) as Published;", errors: [{ messageId: "missingSafetyComment" }, { messageId: "missingSafetyComment" }] },
	],
});
