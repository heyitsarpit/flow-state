import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noChainedTypeAssertionsRule } from "./no-chained-type-assertions.ts";

const tester = createRuleTester("no-chained-type-assertions");

tester.run("no-chained-type-assertions-regression", noChainedTypeAssertionsRule, {
	valid: [
		"const value = input as string;",
		"const value = <string>input;",
		"const value = (input as string);",
		"const value = input as const as const;",
		"const value = input as unknown as string;",
		"const value = (input as unknown) as string;",
		"const value = input as unknown as string as number;",
		"const value = <string>(input as unknown);",
		"const other = value as number;",
	],
	invalid: [
		{ code: "const value = input as const as string;", errors: [{ messageId: "chained" }] },
	],
});
