import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noInwardModuleDependencyRule } from "./no-inward-module-dependency.ts";

const tester = createRuleTester("no-inward-module-dependency");

const architectureOptions = [
	{
		sourceRoot: "/project/packages/flow-state/src/core",
		forbiddenRoots: [
			"/project/packages/flow-state/src/cli",
			"/project/packages/flow-state/src/react",
			"/project/packages/flow-state/src/testing",
			"/project/packages/flow-state/src/runtime",
			"/project/packages/flow-state/src/index.ts",
			"/project/packages/flow-state/src/server.ts"
		]
	}
];

const windowsArchitectureOptions = [
	{
		sourceRoot: "C:/project/packages/flow-state/src/core",
		forbiddenRoots: [
			"C:/project/packages/flow-state/src/cli",
			"C:/project/packages/flow-state/src/react",
			"C:/project/packages/flow-state/src/testing",
			"C:/project/packages/flow-state/src/runtime",
			"C:/project/packages/flow-state/src/index.ts",
			"C:/project/packages/flow-state/src/server.ts"
		]
	}
];

tester.run("no-inward-module-dependency", noInwardModuleDependencyRule, {
	valid: [
		{
			options: architectureOptions,
			code: 'import { value } from "../api/value.js"; void value;',
			filename: "/project/packages/flow-state/src/core/value.ts",
		},
		{
			code: 'import { value } from "../internal/value.js"; void value;',
			filename: "/project/packages/flow-state-rewrite/src/internal/scaffold.ts",
			options: [
				{
					profiles: [
						{
							sourceRoot: "/project/packages/flow-state-rewrite/src/internal",
							forbiddenRoots: ["/project/packages/flow-state-rewrite/src/public"],
						},
					],
				},
			],
		},
		{
			options: architectureOptions,
			code: 'import { value } from "./value.js"; void value;', filename: "/project/packages/flow-state/src/core/domain.ts" },
		{
			options: architectureOptions,
			code: 'export { value } from "../api/value.js";', filename: "/project/packages/flow-state/src/core/value.ts" },
		{
			options: architectureOptions,
			code: 'import "flow-state";', filename: "/project/packages/flow-state/src/core/value.ts" },
	],
	invalid: [
		{
			options: architectureOptions,
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "/project/packages/flow-state/src/core/value.ts",
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "/C:\\project\\packages\\flow-state\\src\\core\\value.ts",
			options: [{ sourceRoot: "C:/project/packages/flow-state/src/core", forbiddenRoots: ["C:/project/packages/flow-state/src/cli"] }],
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			options: architectureOptions,
			code: 'import { root } from "../index.js"; void root;',
			filename: "/project/packages/flow-state/src/core/value.ts",
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			options: windowsArchitectureOptions,
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "/C:\\project\\packages\\flow-state\\src\\core\\value.ts",
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { root } from "../public/root.js"; void root;',
			filename: "/project/packages/flow-state-rewrite/src/internal/scaffold.ts",
			options: [
				{
					profiles: [
						{
							sourceRoot: "/project/packages/flow-state-rewrite/src/internal",
							forbiddenRoots: ["/project/packages/flow-state-rewrite/src/public"],
						},
					],
				},
			],
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { run } from "../cli/run.js"; import { test } from "../testing/test.js"; void run; void test;',
			filename: "/project/src/core/value.ts",
			options: [{ profiles: [
				{ sourceRoot: "/project/src", forbiddenRoots: ["/project/src/testing"] },
				{ sourceRoot: "/project/src/core", forbiddenRoots: ["/project/src/cli"] },
			] }],
			errors: [{ messageId: "inwardDependency" }, { messageId: "inwardDependency" }],
		},
		{
			code: 'import { run } from "../cli/run.js"; import { test } from "../testing/test.js"; void run; void test;',
			filename: "/project/src/core/value.ts",
			options: [{ profiles: [
				{ sourceRoot: "/project/src/core", forbiddenRoots: ["/project/src/cli"] },
				{ sourceRoot: "/project/src", forbiddenRoots: ["/project/src/testing"] },
			] }],
			errors: [{ messageId: "inwardDependency" }, { messageId: "inwardDependency" }],
		},
		{
			code: 'import { run } from "../testing/run.js"; void run;',
			filename: "/project/src/core/value.ts",
			options: [{ profiles: [
				{ sourceRoot: "/project/src", forbiddenRoots: ["/project/src/testing"] },
				{ sourceRoot: "/project/src/core", forbiddenRoots: ["/project/src/testing"] },
			] }],
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "/project/src/testing/helper.ts",
			options: [{ profiles: [
				{ sourceRoot: "/project/src/core", forbiddenRoots: ["/project/src/public"] },
				{ sourceRoot: "/project/src/testing", forbiddenRoots: ["/project/src/cli"] },
			] }],
			errors: [{ messageId: "inwardDependency" }],
		},
	],
});

tester.run("no-inward-module-dependency-missing-configuration", noInwardModuleDependencyRule, {
 valid: [],
 invalid: [
  { code: "export const value = 1;", filename: "/application/src/value.ts", errors: [{ messageId: "configuration" }] },
  { code: "export const value = 1;", filename: "/application/src/value.ts", options: [{}], errors: [{ messageId: "configuration" }] },
 ],
});
