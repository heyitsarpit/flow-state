import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noPublicEntrypointExportDriftRule } from "./no-public-entrypoint-export-drift.ts";

const tester = createRuleTester("no-public-entrypoint-export-drift");

tester.run("no-public-entrypoint-export-drift", noPublicEntrypointExportDriftRule, {
	valid: [
		{
			code: 'export { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'export * from "./core/api/types.js";',
			filename: "/project/packages/flow-state/src/core/api/types.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'import { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'import { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/react-entry.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'export { withRequestRuntime } from "./core/runtime/request.js";',
			filename: "/project/packages/flow-state/src/server.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
	],
	invalid: [
		{
			code: 'export * from "./core/api/types.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "starReExport" }],
		},
		{
			code: 'import { test } from "./testing.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'export { withRequestRuntime } from "./server.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'await import("./testing.js");',
			filename: "C:\\project\\packages\\flow-state\\src\\index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "testing.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'await import("./testing.js");',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'import { test } from "./testing.js";',
			filename: "C:\\project\\packages\\flow-state\\src\\index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
	],
});
