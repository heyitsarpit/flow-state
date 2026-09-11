import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noContextTagRule } from "./no-context-tag.ts";

const tester = createRuleTester("no-context-tag");

tester.run("no-context-tag", noContextTagRule, {
	valid: [
		'import { Context } from "effect"; Context.Service;',
		'import { Context as C } from "effect"; C.Service("Service");',
		'const Context = { Tag: (name: string) => name }; Context.Tag("local");',
		'import { Effect } from "other"; Effect.Service("local");',
		'import { Context as LocalContext } from "other"; LocalContext.Tag("local");',
	],
	invalid: [
		{
			code: 'import { Context } from "effect"; Context.Tag("Service");',
			errors: [{ messageId: "v3Service" }],
		},
		{
			code: 'import { Context } from "effect"; Context.GenericTag("Service");',
			errors: [{ messageId: "v3Service" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.Service("Service");',
			errors: [{ messageId: "v3Service" }],
		},
		{
			code: 'import { Context as C, Effect as E } from "effect"; C["Tag"]("Service"); E["Service"]("Service");',
			errors: [{ messageId: "v3Service" }, { messageId: "v3Service" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Context.Tag("Service"); Fx.Effect.Service("Service");',
			errors: [{ messageId: "v3Service" }, { messageId: "v3Service" }],
		},
	],
});
