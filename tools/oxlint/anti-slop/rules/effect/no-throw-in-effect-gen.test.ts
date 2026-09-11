import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noThrowInEffectGenRule } from "./no-throw-in-effect-gen.ts";

const tester = createRuleTester("no-throw-in-effect-gen");

tester.run("no-throw-in-effect-gen", noThrowInEffectGenRule, {
	valid: [
		'import { Effect } from "effect"; Effect.gen(function* () { yield* Effect.succeed(1); });',
		'import { Effect } from "effect"; Effect.gen(function* () { const helper = () => 1; return helper; });',
		'function parse(input: unknown) { if (!input) throw new Error("missing"); return input; }',
		'const Effect = { gen: (callback: () => unknown) => callback() }; Effect.gen(function* () { throw new Error("local implementation"); });',
		'import { Effect } from "effect"; Effect.try({ try: () => { throw new Error("adapter failure"); }, catch: (error) => error });',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.gen(function* () { throw new Error("boom"); });',
			errors: [{ messageId: "throw" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.fn("work")(function* () { if (bad) throw cause; });',
			errors: [{ messageId: "throw" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.fnUntraced(function* () { throw cause; }); Effect.fnUntracedEager(function* () { throw cause; });',
			errors: [{ messageId: "throw" }, { messageId: "throw" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.fn("work")(function* () { throw cause; });',
			errors: [{ messageId: "throw" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.gen(((function* () { throw cause; }) as () => unknown));',
			errors: [{ messageId: "throw" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.gen(function* () { const callback = () => { throw cause; }; return callback; });',
			errors: [{ messageId: "throw" }],
		},
	],
});
