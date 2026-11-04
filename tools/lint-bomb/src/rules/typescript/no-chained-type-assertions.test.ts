import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noChainedTypeAssertionsRule } from "./no-chained-type-assertions.ts";

const tester = createRuleTester("no-chained-type-assertions");

tester.run("no-chained-type-assertions-regression", noChainedTypeAssertionsRule, {
	valid: [
		"const value = input as string;",
		"const value = <string>input;",
		"const value = (input as string);",
		"const value = input as const as const;",
		"const value = input as unknown;",
		"const value = <string>(input);",
		"const other = value as number;",
	],
	invalid: [
		{ code: "const value = input as const as string;", errors: [{ messageId: "chained" }] },
		// `as unknown as T` is the escape hatch the rule exists to stop: it asserts with no evidence.
		{ code: "const value = input as unknown as string;", errors: [{ messageId: "chained" }] },
		{ code: "const value = (input as unknown) as string;", errors: [{ messageId: "chained" }] },
		{ code: "const value = input as unknown as string as number;", errors: [{ messageId: "chained" }] },
		{ code: "const value = <string>(input as unknown);", errors: [{ messageId: "chained" }] },
		{ code: "const value = input as never as string;", errors: [{ messageId: "chained" }] },
	],
});
