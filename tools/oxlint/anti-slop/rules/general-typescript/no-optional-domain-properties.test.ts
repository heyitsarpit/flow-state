import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noOptionalDomainPropertiesRule } from "./no-optional-domain-properties.ts";

const tester = createRuleTester("no-optional-domain-properties");

tester.run("no-optional-domain-properties", noOptionalDomainPropertiesRule, {
	valid: [
		{ code: "interface Value { value?: string; }", filename: "/project/packages/other/src/value.ts" },
		{ code: "interface Value { value: Option<string>; }", filename: "/project/packages/flow-state/src/core/api/value.ts" },
		{ code: "class Value { value: Option<string>; }", filename: "/project/packages/flow-state/src/vnext/value.ts" },
		{ code: "const value = { optional: undefined };", filename: "/project/packages/flow-state/src/core/api/value.ts" },
		{
			code: "interface Value { value?: string; }",
			filename: "/project/packages/custom/src/value.ts",
			options: [{ sourceRoots: ["packages/other/src"] }],
		},
	],
	invalid: [
		{
			code: "interface Value { value?: string; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "interface Value { value: string | undefined; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "class Value { value: string | null; }",
			filename: "/project/packages/flow-state-rewrite/src/public/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "type Maybe<T> = T | undefined; interface Value { value: Maybe<string>; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "interface Value { pair: [string, undefined]; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
	],
});
