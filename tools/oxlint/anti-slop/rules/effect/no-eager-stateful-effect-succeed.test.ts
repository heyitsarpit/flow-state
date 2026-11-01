import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEagerStatefulEffectSucceedRule } from "./no-eager-stateful-effect-succeed.ts";

const tester = createRuleTester("no-eager-stateful-effect-succeed");

tester.run("no-eager-stateful-effect-succeed", noEagerStatefulEffectSucceedRule, {
	valid: [
		'import { Effect } from "effect"; Effect.succeed(false);',
		'import { Effect } from "effect"; Effect.sync(() => queue.offerUnsafe(value));',
		'import { Effect } from "effect"; Effect.succeed({ value: 1 });',
		'import { Effect } from "effect"; Effect.succeed(update(value));',
		'import { Effect } from "effect"; Effect.sync(() => state.set(value));',
		'import { Effect } from "effect"; function compute(value: unknown) { return value; } Effect.succeed(compute(value));',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.succeed(queue.offerUnsafe(value));',
			errors: [{ messageId: "eager" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.succeed((state.value = next));',
			errors: [{ messageId: "eager" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.succeed(state.revision++);',
			errors: [{ messageId: "eager" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.succeed(queue["offerUnsafe"](item));',
			errors: [{ messageId: "eager" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.succeed(buildValue({ value: queue.offerUnsafe(item) }));',
			errors: [{ messageId: "eager" }],
		},
		{
			code: 'import { Effect } from "effect"; const offer = queue.offerUnsafe; Effect.succeed(offer(item));',
			errors: [{ messageId: "eager" }],
		},
		{
			code: 'import { Effect } from "effect"; function offerUnsafe(item: unknown) { return queue.offerUnsafe(item); } Effect.succeed(offerUnsafe(item));',
			errors: [{ messageId: "eager" }],
		},
		{
			code: 'import { Effect } from "effect"; function mutate(item: unknown) { state.value = item; return item; } Effect.succeed(mutate(item));',
			errors: [{ messageId: "eager" }],
		},
		{
			code: 'import { Effect } from "effect"; const mutate = (item: unknown) => { state.value = item; return item; }; Effect.succeed(mutate(item));',
			errors: [{ messageId: "eager" }],
		},
	],
});
