import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEffectRunnerInDomainRule } from "./no-effect-runner-in-domain.ts";

const tester = createRuleTester("no-effect-runner-in-domain");

tester.run("no-effect-runner-in-domain", noEffectRunnerInDomainRule, {
	valid: [
		"const worker = { runSync() {} }; worker.runSync();",
		{
			code: 'const first = second; const second = first; first.runPromise(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
		},
		{
			code: 'import { Effect } from "effect"; let E = Effect; E.runPromise(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
		},
		{
			code: 'import { Effect } from "effect"; let E = Effect; E = unrelated; E.runPromise(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
		},
		{
			code: 'import { Effect } from "effect"; let run = Effect.runPromise; run = unrelated; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.runSync(Effect.succeed(1));',
			filename: "/project/src/cli/main.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.runPromise(Effect.void);',
			filename: "/project/packages/flow-state/src/server.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.runPromise(Effect.void);',
			filename: "/project/packages/flow-state/src/server.ts",
			options: [{ allowedFiles: ["packages/flow-state/src/core/orchestrator/orchestrator-system.ts"] }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.runPromise(Effect.void);',
			filename: "/project/internal/runner.ts",
			options: [{ allowedPathFragments: ["/internal/"] }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.gen(function* () { yield* Effect.succeed(1); });',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.gen(function* () { yield* Effect.runPromise(Effect.succeed(1)); });',
			filename: "/project/packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
			options: [{ allowedFiles: ["packages/flow-state/src/core/orchestrator/orchestrator-system.ts"] }],
			errors: [{ messageId: "nestedRunner" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.gen(function* () { yield* Effect.runPromise(Effect.succeed(1)); });',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
			errors: [{ messageId: "nestedRunner" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.runSync(Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/core/machines/flow-paths.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.runSync(Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.runSync(Fx.Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/core/machines/flow-paths.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E.runPromise(E.succeed(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect, ManagedRuntime } from "effect"; const runtime = ManagedRuntime.make(layer); runtime["runPromise"](effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import * as Fx from "effect"; const run = Fx.Effect.runPromise; Fx.Effect.gen(function* () { run(effect); });',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "nestedRunner" }],
		},
		{
			code: 'import { Effect } from "effect"; const run = Effect["runSync"]; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const { runPromise: run } = Effect; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; const EE = E; const run = EE.runPromise; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; const cycle = E; const E2 = cycle; const run = E2.runPromise; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { ManagedRuntime } from "effect"; const runtime = ManagedRuntime.make(layer); const runtimeAlias = runtime; runtimeAlias.runPromise(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const run = Effect.runPromiseWith(context); run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.gen((function* () { yield* Effect.runPromise(effect); }) as () => unknown);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "nestedRunner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E[`runPromise`].call(undefined, effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.runPromise.apply(undefined, [effect]);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.runPromise.bind(undefined)(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
	],
});
