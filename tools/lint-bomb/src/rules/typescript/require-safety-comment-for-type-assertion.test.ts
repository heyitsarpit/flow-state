import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { requireSafetyCommentForTypeAssertionRule } from "./require-safety-comment-for-type-assertion.ts";

const tester = createRuleTester("require-safety-comment-for-type-assertion");

tester.run("require-safety-comment-for-type-assertion-regression", requireSafetyCommentForTypeAssertionRule, {
	valid: [
		"/**\n * SAFETY:\n * Decoder validates this shape.\n */\nexport const value = input as DomainValue;",
		"// SAFETY: decoder validated this.\nexport const value = input as DomainValue;",
		"/* SAFETY: decoder validated this. */\nexport let value = <DomainValue>input;",
		"const value = input as unknown;",

		"const value = input as const;",
		"// SAFETY: schema validation above proves the invariant.\nconst value = input as DomainValue;",
		"const value = input satisfies DomainValue;",
		"const value = <const>input;",
		"function read(input: unknown) { /* SAFETY: decoder checked input. */ return input as DomainValue; }",
	],
	invalid: [
		{ code: "/**\n * SAFETY:\n *\n */\nconst value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "// SAFETY:\nconst value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "/* SAFETY:   */\nconst value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "// UNSAFETY: pretend proof\nconst value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "// SAFETY:\nexport const value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "// SAFETY: applies only to the first statement.\nconst first = input as DomainValue;\nconst second = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },

		{ code: "const value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "const value = input as Record<string, unknown>;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "const value = input as { id: string; metadata: unknown };", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "const value = <DomainValue>input;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "// NOTE: this cast is convenient.\nconst value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "function read(input: unknown) { return input as DomainValue; }", errors: [{ messageId: "missingSafetyComment" }] },
		{ code: "const value = (input as DomainValue) as Published;", errors: [{ messageId: "missingSafetyComment" }, { messageId: "missingSafetyComment" }] },
	],
});
