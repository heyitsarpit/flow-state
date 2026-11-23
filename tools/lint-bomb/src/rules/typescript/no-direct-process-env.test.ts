import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noDirectProcessEnvRule } from "./no-direct-process-env.ts";

const tester = createRuleTester("no-direct-process-env");

tester.run("no-direct-process-env", noDirectProcessEnvRule, {
	valid: [
{ code: 'const process = { env: {} }; let VALUE; ({env:{VALUE}}=process);', filename: '/app/src/domain.ts' },
{ code: "const key = process.env.KEY;", filename: "/application/src/service.ts", options: [{ sourceRoots: [] }] },
		{
			options: [{ allowedPathFragments: ["/src/cli/","/src/runtime/","/src/host/"] }], code: "const value = process.env.VALUE;", filename: "/project/packages/flow-state/src/cli/main.ts" },
		{ code: "const value = process.env.VALUE;", filename: "/project/packages/flow-state/src/value.test.ts" },
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state-rewrite/src/host/root.ts",
			options: [{ sourceRoots: ["/project/packages/flow-state-rewrite/src"], allowedDirectories: ["/project/packages/flow-state-rewrite/src/host"] }],
		},
		{
			options: [{ allowedPathFragments: ["/src/cli/","/src/runtime/","/src/host/"] }],
			code: 'const process = { env: { VALUE: "local" } }; const value = process.env.VALUE;',
			filename: "/project/packages/flow-state/src/domain.ts",
		},
		{
			options: [{ allowedPathFragments: ["/src/cli/","/src/runtime/","/src/host/"] }],
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state/src/runtime/config.ts",
		},
		{
			code: 'let p = process; p = { env: { VALUE: "local" } }; const value = p.env.VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
		},
		{
			code: 'let p = { env: { VALUE: "local" } }; const snapshot = p; p = process; const value = snapshot.env.VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
		},
		{
			code: 'const value = process[`en${"v"}`].VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
		},
	],
	invalid: [
{ code: 'let VALUE; ({env:{VALUE}}=process);', filename: '/app/src/domain.ts', errors: [{messageId: "processEnv"}] },
{ code: 'let env; ({["env"]:env}=globalThis.process);', filename: '/app/src/domain.ts', errors: [{messageId: "processEnv"}] },
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state-rewrite/src/internal/scaffold.ts",
			options: [{ sourceRoots: ["/project/packages/flow-state-rewrite/src"] }],
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
		{
			code: 'let p = process; const snapshot = p; p = { env: { VALUE: "local" } }; const value = snapshot.env.VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'let p = process; const value = p.env.VALUE; p = { env: { VALUE: "local" } };',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'let p = process; function later() { p = { env: { VALUE: "local" } }; } const value = p.env.VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'let p = { env: { VALUE: "local" } }; if (condition) p = process; const value = p.env.VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'let p = process; if (condition) p = { env: { VALUE: "local" } }; const value = p.env.VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const value = process["env"].VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const value = process[`env`].VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const value = process?.env?.VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const value = process?.["env"].VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const value = process?.[`env`].VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const { env: { VALUE } } = process;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
	],
});

tester.run("no-direct-process-env-portable-default", noDirectProcessEnvRule, {
 valid: [],
 invalid: [{ code: "const value = process.env.API_KEY;", filename: "/application/src/runtime/service.ts", errors: [{ messageId: "processEnv" }] }],
});
