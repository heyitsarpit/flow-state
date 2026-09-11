import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEmptyContextMakeUnsafeRule } from "./no-empty-context-make-unsafe.ts";

const tester = createRuleTester("no-empty-context-make-unsafe");

tester.run("no-empty-context-make-unsafe", noEmptyContextMakeUnsafeRule, {
	valid: [
		'import { Context } from "effect"; Context.empty();',
		'import { Context } from "effect"; Context.makeUnsafe(new Map([[key, value]]));',
		'import { Context } from "effect"; Context.makeUnsafe(existingMap);',
		'const Map = class { }; import { Context } from "effect"; Context.makeUnsafe(new Map());',
		'import { Context as C } from "other"; C.makeUnsafe(new Map());',
	],
	invalid: [
		{
			code: 'import { Context } from "effect"; Context.makeUnsafe(new Map());',
			errors: [{ messageId: "empty" }],
		},
		{
			code: 'import { Context } from "effect"; Context.makeUnsafe(new Map([]));',
			errors: [{ messageId: "empty" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Context.makeUnsafe(new Map());',
			errors: [{ messageId: "empty" }],
		},
		{
			code: 'import { Context as C } from "effect"; C["makeUnsafe"](new Map());',
			errors: [{ messageId: "empty" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Context.makeUnsafe(new Map([]));',
			errors: [{ messageId: "empty" }],
		},
	],
});
