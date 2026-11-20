import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noConstantEffectFlatMapRule } from "./no-constant-effect-flatmap.ts";

const tester = createRuleTester("no-constant-effect-flatmap");

tester.run("no-constant-effect-flatmap", noConstantEffectFlatMapRule, {
	valid: [
		'import { Effect } from "effect"; function build(undefined: number) { const effect = Effect.flatMap(Effect.void, () => Effect.succeed(undefined)); undefined++; return effect; }',
		'import { Effect } from "effect"; function build() { let undefined = 1; const effect = Effect.flatMap(Effect.void, () => { if (condition) return Effect.succeed(undefined); return Effect.succeed(undefined); }); undefined++; return effect; }',

		'import { Effect } from "effect"; Effect.flatMap(() => Effect.succeed(/x/g));',
		'import { Effect } from "effect"; Effect.flatMap(() => { if (condition) return Effect.succeed(/x/g); return Effect.succeed(/x/g); });',
		'import { Effect } from "effect"; Effect.flatMap((value) => Effect.succeed(value));',
		'import { Effect } from "effect"; Effect.flatMap(() => Effect.succeed(value));',
		'import { Effect } from "effect"; Effect.flatMap(() => Effect.sync(() => false));',
		'import { Effect } from "effect"; Effect.flatMap(() => { if (condition) return Effect.succeed(false); return Effect.succeed(true); });',
		'import { Effect } from "effect"; declare function doSideEffect(): void; Effect.flatMap(() => { doSideEffect(); return Effect.succeed(false); });',
		'import { Effect } from "effect"; Effect.flatMap(effect, () => Effect.succeed({ value }));',
	],
	invalid: [
		{
			code: 'import { flatMap, succeed } from "effect/Effect"; flatMap(() => succeed(false));',
			errors: [{ messageId: "constant" }],
		},
		{
			code: 'import { Effect } from "effect"; const flatMap = Effect.flatMap; const succeed = Effect.succeed; flatMap(() => succeed(false));',
			errors: [{ messageId: "constant" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.flatMap(() => Effect.succeed(false));',
			errors: [{ messageId: "constant" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.flatMap(() => { return Effect.succeed(undefined); });',
			errors: [{ messageId: "constant" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E.flatMap(effect, () => E.succeed("done"));',
			errors: [{ messageId: "constant" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.flatMap(effect, function () { return Fx.Effect.succeed(0); });',
			errors: [{ messageId: "constant" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.flatMap(effect, () => { return Effect.succeed(null); });',
			errors: [{ messageId: "constant" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.flatMap(() => { if (condition) return Effect.succeed(false); return Effect.succeed(false); });',
			errors: [{ messageId: "constant" }],
		},
	],
});
