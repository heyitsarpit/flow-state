import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnjustifiedEffectTryPromiseRule } from "./no-unjustified-effect-try-promise.ts";

const tester = createRuleTester("no-unjustified-effect-try-promise");

tester.run("no-unjustified-effect-try-promise", noUnjustifiedEffectTryPromiseRule, {
	valid: [
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: vendor SDK exposes only Promise and accepts AbortSignal.\nconst load = Effect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
		{
			code: 'import { Effect } from "effect";\nconst load = Effect.gen(function* () {\n  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: legacy client cannot return Effect.\n  yield* Effect.tryPromise({ try: work, catch: mapError });\n});',
			filename: "/project/packages/flow-state-rewrite/src/workflow.ts",
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: foreign Promise-only client.\nconst load = Effect.tryPromise.call(undefined, { try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
		{
			code: 'import * as Fx from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: foreign Promise-only client.\nconst load = Fx.Effect["tryPromise"].apply(undefined, [{ try: work, catch: mapError }]);',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
		{
			code: 'import { Effect as E } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: foreign Promise-only client.\nconst load = E.tryPromise.bind(undefined)({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state/src/adapter.ts",
		},
		{
			code: 'const Effect = { tryPromise: (value) => value }; Effect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/local.ts",
		},
		{
			code: 'const first = second; const second = first; first.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/local.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise(work);',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: this is still malformed.\nEffect.tryPromise({ try: work });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: this is still malformed.\nEffect.tryPromise({ catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: this is still malformed.\nEffect.tryPromise({ try: 1, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: this is still malformed.\nEffect.tryPromise({ try: work, catch: undefined });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: unrelated comment\nconst value = 1;\nEffect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect"; const value = 1; /* FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: trailing */\nEffect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: non-adjacent\n\nEffect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect[`tryPromise`]({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.tryPromise.call(undefined, { try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.tryPromise.bind(undefined)({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import * as Fx from "effect"; const tryPromise = Fx.Effect.tryPromise; tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
	],
});

tester.run("no-unjustified-effect-try-promise-regression", noUnjustifiedEffectTryPromiseRule, {
	valid: [
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: external Promise-only API.\nEffect.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
		{
			code: 'import { Effect as E } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: SDK boundary.\nE.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/client.ts",
		},
		{
			code: 'import * as Fx from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: Promise-only dependency.\nFx.Effect.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/client.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state/src/client.ts",
		},
		{
			code: 'const Effect = { tryPromise: (value: unknown) => value }; Effect.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/local.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: too far away.\n\nEffect.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: malformed call.\nEffect.tryPromise({ try: work });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
	],
});
