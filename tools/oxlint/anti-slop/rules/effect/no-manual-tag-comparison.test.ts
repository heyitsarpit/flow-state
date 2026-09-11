import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noManualTagComparisonRule } from "./no-manual-tag-comparison.ts";

const tester = createRuleTester("no-manual-tag-comparison");
tester.run("no-manual-tag-comparison", noManualTagComparisonRule, {
	valid: [
		"Predicate.isTagged(\"Ready\")(value);",
		"Match.value(value).pipe(Match.tag(\"Ready\", handleReady));",
		'if (value.status === "Ready") handleReady(value);',
		'import { Effect } from "effect"; Effect.catch((error) => error._tag === "NotFound" ? recover : fail);',
		'type Ready = { readonly _tag: "Ready" }; declare const value: Ready; if (value._tag === "Ready") handleReady(value);',
		'type Ready = { readonly _tag: "Ready" }; declare const state: Ready; state._tag === "Ready";',
		'import { Effect } from "effect"; Effect.runPromiseExit(effect)._tag === "Success";',
		'import { Effect } from "effect"; Effect.catchIf((error) => error._tag === "NotFound", (error) => recover);',
		'import * as Random from "effect/Random"; Random.Option.some(1)._tag === "Some";',
		'import * as Other from "effect/Random"; Other.Effect.runSyncExit(effect)._tag === "Success";',
		'import { Effect } from "effect"; Effect[`catchAll`](effect, recover);',
	],
	invalid: [
		{
			code: 'import { Either } from "effect"; Either.right(1)._tag === "Right";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Either } from "effect"; "Right" !== Either.right(1)["_tag"];',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Either } from "effect"; switch (Either.right(1)._tag) { case "Right": handleReady(); }',
			errors: [{ messageId: "manualSwitch" }],
		},
		{
			code: 'import { Option } from "effect"; Option.some(1)._tag === "Some";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import * as Fx from "effect"; switch (Fx.Cause.fail("boom")["_tag"]) { case "Fail": handle(); }',
			errors: [{ messageId: "manualSwitch" }],
		},
		{
			code: 'import { Option as O } from "effect"; const option = O.some(1); option._tag === "Some";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import * as Fx from "effect"; const cause = Fx.Cause.fail("boom"); switch (cause["_tag"]) { case "Fail": handle(); }',
			errors: [{ messageId: "manualSwitch" }],
		},
		{
			code: 'import { right } from "effect/Either"; right(1)._tag === "Right";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import * as Fx from "effect"; const makeRight = Fx.Either.right; makeRight(1)._tag === "Right";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Effect, Option } from "effect"; Effect.catchAll(effect, () => Option.some(1)._tag === "Some" ? recover : fail);',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Effect, Option } from "effect"; Effect.catchIf(effect, predicate, () => Option.some(1)._tag === "Some" ? recover : fail);',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Effect, Either } from "effect"; const handler = () => Either.right(1)._tag === "Right" ? recover : fail; Effect.catchAll(effect, handler);',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.runSyncExit(effect)._tag === "Success";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.option(effect)._tag === "Some";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.exit(effect)._tag === "Success";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { right as makeRight } from "effect/Either"; makeRight(1)[`_tag`] === "Right";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Option } from "effect"; const makeSome = Option[`some`]; makeSome(1)._tag === "Some";',
			errors: [{ messageId: "manualComparison" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect[`runSyncExit`](effect)[`_tag`] === "Success";',
			errors: [{ messageId: "manualComparison" }],
		},
	],
});
