import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noImplicitEffectConcurrencyRule } from "./no-implicit-effect-concurrency.ts";

const tester = createRuleTester("no-implicit-effect-concurrency");

tester.run("no-implicit-effect-concurrency", noImplicitEffectConcurrencyRule, {
	valid: [
		'import { Effect } from "effect"; Effect.all(items, { concurrency: 1 });',
		'import { Effect } from "effect"; Effect.filterMapEffect(items, run, { concurrency: 1 });',
		'import { Effect } from "effect"; Effect.forEach(items, run, { concurrency: "unbounded" });',
		'import { Effect } from "effect"; Effect.partition(items, run, { concurrency: 2 });',
		'import { Effect } from "effect"; Effect.replicateEffect(work, 2, { concurrency: 2 });',
		'import { Effect } from "effect"; Effect.validate(items, run, { concurrency: 4 });',
		'import { Effect } from "effect"; Effect.all(items, { ["concurrency"]: 1 });',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.all(items);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx["Effect"]["all"](items);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.filterMapEffect(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.forEach(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.partition(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.replicateEffect(work, 2);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.validate(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.forEach(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; const concurrency = 1; Effect.all(items, concurrency);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.all(items, { metadata: { concurrency: 1 } });',
			errors: [{ messageId: "concurrency" }],
		},
	],
});
