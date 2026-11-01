import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnwrappedPromiseInEffectCoreRule } from "./no-unwrapped-promise-in-effect-core.ts";

const tester = createRuleTester("no-unwrapped-promise-in-effect-core");

tester.run("no-unwrapped-promise-in-effect-core", noUnwrappedPromiseInEffectCoreRule, {
	valid: [
		"const value = Promise.resolve(1);",
		{
			code: 'import { Effect } from "effect"; const value = Effect.tryPromise(() => Promise.resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import * as Fx from "effect"; const value = Fx.Effect.tryPromise(() => Promise.resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import { tryPromise as tp } from "effect"; const value = tp(() => Promise.resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import { async as effectAsync } from "effect/Effect"; const value = effectAsync(() => Promise.resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import { Effect } from "effect"; const effectAsync = Effect.async; const value = effectAsync(() => Promise.resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import { Effect } from "effect"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/core/inspection/trace-artifact.ts",
		},
		{
			code: 'import { Effect } from "effect"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/server.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const value = new Promise((resolve) => resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect/submodule"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const values = Promise.all(tasks);',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const failure = Promise.reject(error);',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const value = Promise["any"](tasks);',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const value = Promise["allSettled"](tasks);',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const promise = Promise; const value = promise.any(tasks);',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/runtime/domain.ts",
			errors: [{ messageId: "promise" }],
		},
	],
});
