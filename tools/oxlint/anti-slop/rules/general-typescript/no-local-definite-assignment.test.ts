import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noLocalDefiniteAssignmentRule } from "./no-local-definite-assignment.ts";

const tester = createRuleTester("no-local-definite-assignment");

tester.run("no-local-definite-assignment", noLocalDefiniteAssignmentRule, {
	valid: [
		"class Example { value!: string; }",
		"const value = input!;",
		"let app: App = createApp();",
		"let value: string;",
		"let value: string = input;",
	],
	invalid: [
		{
			code: "let app!: App; app = createApp();",
			errors: [{ messageId: "localDefiniteAssignment" }],
		},
		{ code: "let value!: string;", errors: [{ messageId: "localDefiniteAssignment" }] },
		{ code: "let state!: State;", errors: [{ messageId: "localDefiniteAssignment" }] },
		{ code: "let cache!: Map<string, Value>;", errors: [{ messageId: "localDefiniteAssignment" }] },
		{ code: "let result!: string | undefined;", errors: [{ messageId: "localDefiniteAssignment" }] },
	],
});
