import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noExplicitAnyRule } from "./no-explicit-any.ts";

const tester = createRuleTester("no-explicit-any");

tester.run("no-explicit-any", noExplicitAnyRule, {
	valid: [
		{ code: "const value: unknown = 1;", filename: "/project/src/domain.ts" },
		{ code: "const value: any = 1;", filename: "/project/src/testing/harness.ts" },
		{ code: "const value: any = 1;", filename: "/project/src/domain.test.ts" },
		{ code: "function bridge(value: any) { return value; }", filename: "/project/src/testing/adapter.ts" },
		{ code: "type Value = any;", filename: "/project/typecheck/public.ts" },
	],
	invalid: [
		{
			code: "const value: any = 1;",
			filename: "/project/src/domain.ts",
			errors: [{ messageId: "explicitAny" }],
		},
		{ code: "type Value = any;", filename: "/project/src/domain.ts", errors: [{ messageId: "explicitAny" }] },
		{ code: "function accept(value: any): unknown { return value; }", filename: "/project/src/domain.ts", errors: [{ messageId: "explicitAny" }] },
		{ code: "const values: Array<any> = [];", filename: "/project/src/domain.ts", errors: [{ messageId: "explicitAny" }] },
		{ code: "type Payload = { value: any };", filename: "/project/src/domain.ts", errors: [{ messageId: "explicitAny" }] },
	],
});
