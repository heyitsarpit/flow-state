import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEffectPromiseRule } from "./no-effect-promise.ts";

const tester = createRuleTester("no-effect-promise");

tester.run("no-effect-promise", noEffectPromiseRule, {
	valid: [
		'import { Effect } from "effect"; Effect.tryPromise(() => Promise.resolve(1));',
		'import { Effect } from "effect"; Effect.tryPromise({ try: makeRequest });',
		'import { Effect as E } from "effect"; E.tryPromise({ try: makeRequest, catch: String });',
		'import * as Fx from "effect"; Fx.Effect.tryPromise({ try: makeRequest, catch: String });',
		'import { Effect } from "effect"; const E = Effect; E.tryPromise({ try: makeRequest, catch: String });',
		'import { Effect } from "effect"; const tryPromise = Effect.tryPromise; tryPromise({ try: makeRequest, catch: String });',
		'import * as Fx from "effect"; const tryPromise = Fx.Effect.tryPromise; tryPromise({ try: makeRequest, catch: String });',
		'import { tryPromise } from "effect/Effect"; tryPromise({ try: makeRequest, catch: String });',
		'import { Effect } from "effect"; const local = { promise: () => Promise.resolve(1) }; local.promise();',
		'import * as Random from "effect/Random"; const promise = Random.promise; promise(() => Promise.resolve(1));',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E["promise"](() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E[`promise`](() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E[`promise`].call(undefined, () => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.promise.apply(undefined, [() => Promise.resolve(1)]);',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const promise = Effect.promise; promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import * as Fx from "effect"; const E = Fx.Effect; E.promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import * as Fx from "effect"; const promise = Fx.Effect.promise; promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { promise } from "effect/Effect"; promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { promise as makePromise } from "effect/Effect"; const promise = makePromise; promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
	],
});

tester.run("no-effect-promise-regression", noEffectPromiseRule, {
	valid: [
		'import { Effect } from "effect"; Effect.tryPromise({ try: work, catch: String });',
		'import { Effect as E } from "effect"; E.tryPromise(() => Promise.resolve(value));',
		'import * as Random from "effect/Random"; Random.promise(() => Promise.resolve(value));',
		'import { Effect } from "effect"; const local = { promise: work }; local.promise();',
		'import { promise as makeRequest } from "./client"; makeRequest(work);',
	],
	invalid: [
		{ code: 'import { Effect } from "effect"; Effect.promise(work);', errors: [{ messageId: "promise" }] },
		{ code: 'import { Effect as E } from "effect"; E["promise"](work);', errors: [{ messageId: "promise" }] },
		{ code: 'import * as Fx from "effect"; Fx.Effect.promise(work);', errors: [{ messageId: "promise" }] },
		{ code: 'import { Effect } from "effect"; const promise = Effect.promise; promise(work);', errors: [{ messageId: "promise" }] },
		{ code: 'import { promise } from "effect/Effect"; promise(work);', errors: [{ messageId: "promise" }] },
	],
});
