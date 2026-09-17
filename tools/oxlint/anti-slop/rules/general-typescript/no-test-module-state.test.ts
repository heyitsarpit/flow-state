import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noTestModuleStateRule } from "./no-test-module-state.ts";

const tester = createRuleTester("no-test-module-state");
const options = [{ sourceRoots: ["packages/flow-state-rewrite/src"] }];

tester.run("no-test-module-state", noTestModuleStateRule, {
	valid: [
		{
			code: "const fixture = { value: 1 }; const values = [1, 2, 3];",
			filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
			options,
		},
		{
			code: "function makeFixture() { let count = 0; const seen = new Set(); return { count, seen }; }",
			filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
			options,
		},
		{
			code: "beforeEach(() => { let count = 0; const seen = new WeakSet(); void count; void seen; });",
			filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
			options,
		},
		{
			code: "const identity = new WeakMap(); const provenance = new WeakSet();",
			filename: "/project/packages/flow-state-rewrite/src/runtime/identity.test.ts",
			options,
		},
		{
			code: "let count = 0; const seen = new Map();",
			filename: "/project/packages/other/src/example.test.ts",
			options,
		},
		{
			code: "let count = 0; const seen = new Map();",
			filename: "/project/packages/flow-state-rewrite/src/runtime/example.ts",
			options,
		},
		{
			code: "declare let count: number; declare const seen: Map<string, string>;",
			filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
			options,
		},
	],
	invalid: [
		{
			code: "let count = 0;",
			filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
			options,
			errors: [{ messageId: "moduleState" }],
		},
		{
			code: "export var attempts = 0;",
			filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
			options,
			errors: [{ messageId: "moduleState" }],
		},
		{
			code: "const values = new Map();",
			filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
			options,
			errors: [{ messageId: "moduleState" }],
		},
    {
      code: "const values = new Set(), refs = new Map();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = { value: 0 }; state.value = 1;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const values = []; values.push(1);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = {}; function mutate() { state.value = 1; } mutate();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
		{
			code: "const values = new Map();",
			filename: "C:\\project\\packages\\flow-state-rewrite\\src\\runtime\\example.test.ts",
			options,
			errors: [{ messageId: "moduleState" }],
		},
	],
});
