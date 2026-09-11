import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noInwardModuleDependencyRule } from "./no-inward-module-dependency.ts";

const tester = createRuleTester("no-inward-module-dependency");

tester.run("no-inward-module-dependency", noInwardModuleDependencyRule, {
	valid: [
		{
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
							sourceRoot: "packages/flow-state-rewrite/src/internal",
							forbiddenRoots: ["packages/flow-state-rewrite/src/public"],
						},
					],
				},
			],
		},
		{ code: 'import { value } from "./value.js"; void value;', filename: "/project/packages/flow-state/src/core/domain.ts" },
		{ code: 'export { value } from "../api/value.js";', filename: "/project/packages/flow-state/src/core/value.ts" },
		{ code: 'import "flow-state";', filename: "/project/packages/flow-state/src/core/value.ts" },
	],
	invalid: [
		{
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "/project/packages/flow-state/src/core/value.ts",
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "C:\\project\\packages\\flow-state\\src\\core\\value.ts",
			options: [{ sourceRoot: "packages/flow-state/src/core", forbiddenRoots: ["packages/flow-state/src/cli"] }],
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { root } from "../index.js"; void root;',
			filename: "/project/packages/flow-state/src/core/value.ts",
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "C:\\project\\packages\\flow-state\\src\\core\\value.ts",
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { root } from "../public/root.js"; void root;',
			filename: "/project/packages/flow-state-rewrite/src/internal/scaffold.ts",
			options: [
				{
					profiles: [
						{
							sourceRoot: "packages/flow-state-rewrite/src/internal",
							forbiddenRoots: ["packages/flow-state-rewrite/src/public"],
						},
					],
				},
			],
			errors: [{ messageId: "inwardDependency" }],
		},
	],
});
