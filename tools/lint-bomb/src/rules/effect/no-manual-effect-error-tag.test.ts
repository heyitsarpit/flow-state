import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noManualEffectErrorTagRule } from "./no-manual-effect-error-tag.ts";

const tester = createRuleTester("no-manual-effect-error-tag");
tester.run(
	"no-manual-effect-error-tag",
	noManualEffectErrorTagRule,
	{
		valid: [
			'error._tag === "NotFound";',
			'import { Effect } from "effect"; Effect.catchTag("NotFound", recover);',
			'import { Effect } from "effect"; Effect.catchTag("Wrapper", (error) => error.reason._tag === "Timeout" ? retry : fail);',
			'import { Effect } from "effect"; Effect.catchTag("NotFound", (error) => error._tag === "NotFound" ? recover : fail);',
			'import { Effect } from "effect"; Effect.catchAll(effect, (error) => { const tag = error._tag; return fail; });',
			'import { Effect } from "effect"; Effect.catchIf((error) => error._tag === "NotFound", (error) => recover);',
			'import { Effect } from "effect"; Effect.catchAll(effect, (error) => state._tag === "Ready" ? recover : fail);',
			'import { Effect } from "effect"; const predicate = (error) => error._tag === "NotFound"; const recover = (error) => fail; Effect.catchIf(predicate, recover);',
			'import { Effect } from "effect"; const recover = (error) => fail; Effect.catchIf(effect, predicate, recover);',
			'import * as Random from "effect/Random"; Random.Either.right(1)._tag === "Right";',
			'import * as Other from "effect/Random"; Other.Effect.catchAll(effect, (error) => error._tag === "NotFound" ? recover : fail);',
			'import { Effect } from "effect"; Effect["catchAll"](effect, recover);',
		],
		invalid: [
			{
				code: 'import { Effect } from "effect"; Effect.catch((error) => error._tag === "NotFound" ? recover : fail);',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; Effect.catchAll(function (error) { return error.reason._tag === "Timeout" ? retry : fail; });',
				errors: [{ messageId: "reason" }],
			},
			{
				code: 'import { Effect } from "effect"; Effect.catchAll(effect, (error) => "NotFound" !== error["_tag"] ? recover : fail);',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; Effect.catchIf(predicate, (error) => error._tag === "NotFound" ? recover : fail);',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; Effect.catchIf(predicate, function (error) { switch (error["reason"]["_tag"]) { case "Timeout": return retry; default: return fail; } });',
				errors: [{ messageId: "reason" }],
			},
			{
				code: 'import { Effect } from "effect"; Effect.catchAll(effect, (error) => { const caught = error; return caught._tag === "NotFound" ? recover : fail; });',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; Effect.catchAll(effect, (error) => { const caught = error; return caught.reason._tag === "Timeout" ? retry : fail; });',
				errors: [{ messageId: "reason" }],
			},
			{
				code: 'import { Effect } from "effect"; const recover = (error) => error._tag === "NotFound" ? retry : fail; Effect.catchAll(effect, recover);',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; const recover = (error) => error._tag === "NotFound" ? retry : fail; Effect.catchAll(effect, (recover as (error: unknown) => unknown));',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; const predicate = (error) => true; const recover = (error) => error._tag === "NotFound" ? retry : fail; Effect.catchIf(predicate, recover);',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; Effect.catchIf(effect, predicate, (error) => error._tag === "NotFound" ? retry : fail);',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; function recover(error) { return error._tag === "NotFound" ? retry : fail; } Effect.catchAll(effect, recover);',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { catchAll } from "effect/Effect"; const recover = (error) => error._tag === "NotFound" ? retry : fail; catchAll(effect, recover);',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; const catchAll = Effect.catchAll; catchAll(effect, (error) => error.reason._tag === "Timeout" ? retry : fail);',
				errors: [{ messageId: "reason" }],
			},
			{
				code: 'import { catchIf as when } from "effect/Effect"; when((error) => true, (error) => error._tag === "NotFound" ? retry : fail, orElse);',
				errors: [{ messageId: "tag" }],
			},
			{
				code: 'import { Effect } from "effect"; function predicate(error) { return true; } function recover(error) { return error._tag === "NotFound" ? retry : fail; } function orElse(error) { return fail; } Effect.catchIf(predicate, recover, orElse);',
				errors: [{ messageId: "tag" }],
			},
		],
	},
);
