import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noDirectProcessEnvRule } from "./no-direct-process-env.ts";

const tester = createRuleTester("no-direct-process-env");

tester.run("no-direct-process-env", noDirectProcessEnvRule, {
	valid: [
		{ code: "const value = process.env.VALUE;", filename: "/project/packages/flow-state/src/cli/main.ts" },
		{ code: "const value = process.env.VALUE;", filename: "/project/packages/flow-state/src/value.test.ts" },
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state-rewrite/src/host/root.ts",
			options: [{ sourceRoots: ["packages/flow-state-rewrite/src"] }],
		},
		{
			code: 'const process = { env: { VALUE: "local" } }; const value = process.env.VALUE;',
			filename: "/project/packages/flow-state/src/domain.ts",
		},
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state/src/runtime/config.ts",
		},
	],
	invalid: [
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state-rewrite/src/internal/scaffold.ts",
			options: [{ sourceRoots: ["packages/flow-state-rewrite/src"] }],
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const value = globalThis["process"]["env"].VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const p = process; const value = p.env.VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const p = global.process; const value = p["env"].VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
	],
});
