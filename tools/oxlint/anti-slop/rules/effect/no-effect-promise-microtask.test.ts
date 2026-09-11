import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEffectPromiseMicrotaskRule } from "./no-effect-promise-microtask.ts";

const tester = createRuleTester("no-effect-promise-microtask");

tester.run("no-effect-promise-microtask", noEffectPromiseMicrotaskRule, {
	valid: [
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise(() => Promise.resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => Promise.resolve());',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => Promise.resolve());',
			filename: "/project/packages/flow-state/src/server.ts",
		},
		{
			code: 'import { Effect } from "effect"; Promise.resolve();',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import { Effect } from "effect"; function read(Promise: { resolve: () => unknown }) { return Effect.promise(() => Promise.resolve()); }',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => Promise.resolve());',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promiseMicrotask" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => { return Promise.resolve(); });',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promiseMicrotask" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.promise(() => Promise.resolve());',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promiseMicrotask" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E.promise(() => (Promise.resolve(value)));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promiseMicrotask" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.promise(() => { return (Promise.resolve(value)); });',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promiseMicrotask" }],
		},
	],
});
