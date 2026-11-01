import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noAnonymousDefaultExportRule } from "./no-anonymous-default-export.ts";

const tester = createRuleTester("no-anonymous-default-export");

tester.run("no-anonymous-default-export", noAnonymousDefaultExportRule, {
	valid: [
		{ code: "const value = 1; export default value;", filename: "/project/packages/demo/src/value.ts" },
		{ code: "export default function named() {}", filename: "/project/packages/demo/src/value.ts" },
		{ code: "export default (function namedExpression() {})", filename: "/project/packages/demo/src/value.ts" },
		{ code: "export default (class NamedClass {})", filename: "/project/packages/demo/src/value.ts" },
		{ code: "export default () => 1;", filename: "/project/packages/demo/src/value.test.ts" },
	],
	invalid: [
		{
			code: "export default () => 1;",
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "anonymousDefault" }],
		},
		{
			code: "export default function () {};",
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "anonymousDefault" }],
		},
		{
			code: "export default class {};",
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "anonymousDefault" }],
		},
		{
			code: "export default (function () {});",
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "anonymousDefault" }],
		},
		{
			code: "export default (class {});",
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "anonymousDefault" }],
		},
	],
});
