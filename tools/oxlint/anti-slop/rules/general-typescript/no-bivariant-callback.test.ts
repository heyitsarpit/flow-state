import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noBivariantCallbackRule } from "./no-bivariant-callback.ts";

const tester = createRuleTester("no-bivariant-callback");

tester.run("no-bivariant-callback", noBivariantCallbackRule, {
	valid: [
		"type Callback = (value: string) => number;",
		{ code: 'type Callback<A, B> = { bivarianceHack(args: A): B }["bivarianceHack"];', filename: "/project/types.d.ts" },
		'type Callback = { bivarianceHack: (args: string) => number }["bivarianceHack"];',
		'type Callback = { bivarianceHack(args: string): number; other: boolean }["bivarianceHack"];',
		'type Callback = { bivarianceHack(args: string): number }[SomeKey];',
	],
	invalid: [
		{
			code: 'type Callback<A, B> = { bivarianceHack(args: A): B }["bivarianceHack"];',
			errors: [{ messageId: "bivariantCallback" }],
		},
		{
			code: 'type Callback = { bivarianceHack<T>(args: T): T }["bivarianceHack"];',
			errors: [{ messageId: "bivariantCallback" }],
		},
		{
			code: 'type Callback = ({ bivarianceHack(args: string): number })["bivarianceHack"];',
			errors: [{ messageId: "bivariantCallback" }],
		},
		{
			code: "type Callback = { bivarianceHack(args: string): number }['bivarianceHack'];",
			errors: [{ messageId: "bivariantCallback" }],
		},
		{
			code: 'type Callback = { bivarianceHack(args: string): number }[("bivarianceHack")];',
			errors: [{ messageId: "bivariantCallback" }],
		},
	],
});
