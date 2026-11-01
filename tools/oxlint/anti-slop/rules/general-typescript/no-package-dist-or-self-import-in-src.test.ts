import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noPackageDistOrSelfImportInSrcRule } from "./no-package-dist-or-self-import-in-src.ts";

const tester = createRuleTester("no-package-dist-or-self-import-in-src");

tester.run("no-package-dist-or-self-import-in-src", noPackageDistOrSelfImportInSrcRule, {
	valid: [
		{
			code: 'import { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
		{
			code: 'import * as flow from "flow-state";',
			filename: "/project/packages/flow-state/scripts/check-packed-consumers.mjs",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
		{
			code: 'export { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
		{
			code: 'await import("flow-state");',
			filename: "/project/packages/flow-state/scripts/check-packed-consumers.mjs",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
		{
			code: 'import { value } from "../src2/value.js"; void value;',
			filename: "C:\\project\\packages\\flow-state\\src\\cli\\trace-input.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
	],
	invalid: [
		{
			code: 'import * as flow from "flow-state";',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "selfImport" }],
		},
		{
			code: 'import { captureTrace } from "../dist/inspect.mjs";',
			filename: "/project/packages/flow-state/src/cli/trace-input.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "distImport" }],
		},
		{
			code: 'export * from "flow-state/testing";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "selfImport" }],
		},
		{
			code: 'await import("flow-state/inspect");',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "selfImport" }],
		},
		{
			code: 'import { captureTrace } from "../DIST/inspect.mjs"; void captureTrace;',
			filename: "C:\\project\\packages\\flow-state\\src\\cli\\trace-input.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "distImport" }],
		},
	],
});
