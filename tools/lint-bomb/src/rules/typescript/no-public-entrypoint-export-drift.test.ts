import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noPublicEntrypointExportDriftRule } from "./no-public-entrypoint-export-drift.ts";

const tester = createRuleTester("no-public-entrypoint-export-drift");

tester.run("no-public-entrypoint-export-drift", noPublicEntrypointExportDriftRule, {
	valid: [
		{
			code: 'export { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'export * from "./core/api/types.js";',
			filename: "/project/packages/flow-state/src/core/api/types.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'import { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'import { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/react-entry.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'export { withRequestRuntime } from "./core/runtime/request.js";',
			filename: "/project/packages/flow-state/src/server.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'import { internal } from "./index/internal.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts"] }],
		},
	],
	invalid: [
		{
			code: 'export * from "./core/api/types.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "starReExport" }],
		},
		{
			code: 'import { test } from "./testing.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'export { withRequestRuntime } from "./server.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'await import("./testing.js");',
			filename: "/C:\\project\\packages\\flow-state\\src\\index.ts",
			options: [{ sourceRoot: "C:/project/packages/flow-state/src", entrypoints: ["index.ts", "testing.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'await import("./testing.js");',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'import { test } from "./testing.js";',
			filename: "/C:\\project\\packages\\flow-state\\src\\index.ts",
			options: [{ sourceRoot: "C:/project/packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'import { testing } from "./testing.js";',
			filename: "/project/packages/flow-state/src/api/index.ts",
			options: [{ sourceRoot: "/project/packages/flow-state/src", entrypoints: ["api"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
	],
});

tester.run("no-public-entrypoint-export-drift-missing-configuration", noPublicEntrypointExportDriftRule, {
 valid: [],
 invalid: [
  { code: "export const value = 1;", filename: "/application/src/value.ts", errors: [{ messageId: "configuration" }] },
  { code: "export const value = 1;", filename: "/application/src/value.ts", options: [{}], errors: [{ messageId: "configuration" }] },
 ],
});


tester.run("no-public-entrypoint-export-drift-import-types", noPublicEntrypointExportDriftRule, {
  valid: [
    { code: 'export type Api = import("./core.js").Api;', filename: "/project/src/index.ts", options: [{ sourceRoot: "/project/src", entrypoints: ["index.ts", "testing.ts"] }] },
    { code: 'export type Api = import("./testing.js").Api;', filename: "/project/src/internal.ts", options: [{ sourceRoot: "/project/src", entrypoints: ["index.ts", "testing.ts"] }] },
  ],
  invalid: [
    { code: 'export type Api = import("./testing.js").Api;', filename: "/project/src/index.ts", options: [{ sourceRoot: "/project/src", entrypoints: ["index.ts", "testing.ts"] }], errors: [{ messageId: "crossEntrypoint" }] },
    { code: 'export type Api = typeof import("./testing.js");', filename: "/project/src/index.ts", options: [{ sourceRoot: "/project/src", entrypoints: ["index.ts", "testing.ts"] }], errors: [{ messageId: "crossEntrypoint" }] },
  ],
});
