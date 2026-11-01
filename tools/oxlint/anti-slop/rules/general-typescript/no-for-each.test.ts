import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noForEachRule } from "./no-for-each.ts";

const tester = createRuleTester("no-for-each");

tester.run("no-for-each", noForEachRule, {
	valid: [
		"const values = items.map((item) => item.id);",
		"for (const item of items) consume(item);",
		'import { Effect } from "effect"; Effect.forEach(items, run, { concurrency: 1 });',
		'import { Effect as E } from "effect"; E["forEach"](items, run, { concurrency: 1 });',
		'import * as Fx from "effect"; Fx.Effect.forEach(items, run, { concurrency: 1 });',
	],
	invalid: [
		{
			code: "items.forEach((item) => consume(item));",
			errors: [{ messageId: "forEach" }],
		},
		{
			code: "items.forEach((item) => item);",
			errors: [{ messageId: "forEach" }],
		},
		{
			code: 'items["forEach"]((item) => item);',
			errors: [{ messageId: "forEach" }],
		},
		{
			code: "const Effect = { forEach: (items, run) => run(items) }; Effect.forEach(items, run);",
			errors: [{ messageId: "forEach" }],
		},
		{
			code: "const collection = items; collection.forEach((item) => consume(item));",
			errors: [{ messageId: "forEach" }],
		},
	],
});
