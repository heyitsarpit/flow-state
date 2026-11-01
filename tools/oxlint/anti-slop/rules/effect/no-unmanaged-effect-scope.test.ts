import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnmanagedEffectScopeRule } from "./no-unmanaged-effect-scope.ts";

const tester = createRuleTester("no-unmanaged-effect-scope");

tester.run("no-unmanaged-effect-scope", noUnmanagedEffectScopeRule, {
	valid: [
		'import { Effect, Exit, Scope } from "effect"; Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void));',
		'import { Effect as E, Scope as S } from "effect"; E.acquireRelease(S.make(), release);',
		'import * as Fx from "effect"; Fx.acquireRelease(Fx.Scope.make(), release);',
		'import * as Fx from "effect"; Fx["acquireRelease"](Fx["Scope"]["make"](), release);',
		'import { Exit, Scope } from "effect"; const value = Scope.close(scope, Exit.void);',
		'const Scope = { make: () => effect }; Scope.make();',
		{
			code: 'import { Scope } from "effect"; const scope = Scope.make();',
			filename: "/project/packages/flow-state/src/server.ts",
		},
	],
	invalid: [
		{
			code: 'import { Scope } from "effect"; function open() { const scope = Scope.make(); return scope; }',
			errors: [{ messageId: "unmanaged" }],
		},
		{
			code: 'import * as Fx from "effect"; function open() { const scope = Fx.Scope.make(); Fx.Scope.close(scope, Fx.Exit.void); }',
			errors: [{ messageId: "unmanaged" }],
		},
		{
			code: 'import * as Fx from "effect"; function open() { const scope = Fx["Scope"]["make"](); return scope; }',
			errors: [{ messageId: "unmanaged" }],
		},
		{
			code: 'import { Effect, Scope } from "effect"; const open = Effect.suspend(() => Scope.make());',
			errors: [{ messageId: "unmanaged" }],
		},
		{
			code: 'import { Effect, Scope } from "effect"; const open = Effect.flatMap(Effect.void, () => Scope["make"]());',
			errors: [{ messageId: "unmanaged" }],
		},
	],
});
