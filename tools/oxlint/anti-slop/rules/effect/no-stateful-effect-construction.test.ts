import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noStatefulEffectConstructionRule } from "./no-stateful-effect-construction.ts";

const tester = createRuleTester("no-stateful-effect-construction");

tester.run("no-stateful-effect-construction", noStatefulEffectConstructionRule, {
	valid: [
		'import { Effect, Deferred } from "effect"; function make(): () => Effect.Effect<void> { let completion; return () => Effect.suspend(() => { completion = Deferred.makeUnsafe(); return Effect.void; }); }',
		'import { Effect } from "effect"; function make(): Effect.Effect<void> { const value = 1; return Effect.sync(() => value); }',
		'import { Effect } from "effect"; function make(): Effect.Effect<void> { let closed = false; return Effect.sync(() => closed = true); }',
		'import { Effect } from "effect"; function make(): Effect.Effect<void> { let value = 0; value = 1; return Effect.void; }',
		'declare const task: { await(): string }; function make(): string { let value = 0; value = 1; return task.await(); }',
		'declare const task: { await(): string }; function make(): () => string { let value = 0; return () => { value = 1; return task.await(); }; }',
	],
	invalid: [
		{
			code: 'import { Effect, Deferred } from "effect"; function make(): () => Effect.Effect<void> { let completion; return () => { completion = Deferred.makeUnsafe(); return Effect.void; }; }',
			errors: [{ messageId: "construction" }, { messageId: "construction" }],
		},
		{
			code: 'import { Effect } from "effect"; declare const state: { setUnsafe: (key: string, value: number) => void }; function make(): Effect.Effect<void> { state.setUnsafe("key", 1); return Effect.void; }',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import { Effect } from "effect"; let revision = 0; function make(): Effect.Effect<void> { revision += 1; return Effect.void; }',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import { Effect } from "effect"; declare const queue: { offerUnsafe(value: string): void }; function make(): Effect.Effect<void> { queue.offerUnsafe("value"); return Effect.void; }',
			errors: [{ messageId: "construction" }],
		},
		{
			code: 'import { Effect, Scope } from "effect"; function make(): Effect.Effect<void> { Scope.make(); return Effect.void; }',
			errors: [{ messageId: "construction" }],
		},
	],
});
