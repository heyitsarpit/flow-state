// Archived: superseded by anti-slop/no-unknown. Retained for historical reference; not registered.
import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnknownEffectChannelRule } from "./no-unknown-effect-channel.ts";

const tester = createRuleTester("no-unknown-effect-channel");

tester.run("no-unknown-effect-channel", noUnknownEffectChannelRule, {
	valid: [
		{ code: 'import { Effect } from "effect"; type Good = Effect.Effect<string, Error, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
		{ code: 'import { Effect as FxEffect } from "effect"; type Good = FxEffect<string, Error, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
		{ code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: internal erasure\ntype Internal = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/internal.ts" },
		{ code: 'import { Effect } from "effect"; type Narrowed = Effect.Effect<string, unknown & Error, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
		{ code: 'import { Effect } from "effect"; type PromiseBox<T> = Promise<T>; type Good = Effect.Effect<string, PromiseBox<unknown>, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
	],
	invalid: [
		{ code: 'import { Effect } from "effect"; type Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import * as Fx from "effect"; type Bad = Fx.Effect.Effect<string, Error, unknown>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Hidden = unknown; type Bad = Effect.Effect<string, Hidden, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Bad = Effect.Effect<string, string | unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Wrapped<T> = Effect.Effect<string, T, never>; type Bad = Wrapped<unknown>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Identity<T> = T; type Bad = Effect.Effect<string, Identity<unknown>, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: '// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: header\nimport { Effect } from "effect";\ntype Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: unrelated\nconst value = 1;\ntype Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; const value = 1; /* FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: trailing */\ntype Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; /** @internal erasure */\ntype Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
	],
});

const deepUnknownUnion = Array.from({ length: 26 }, (_, index) =>
	index === 0 ? "type Channel0 = unknown;" : `type Channel${index} = string | Channel${index - 1} | Channel${index - 1};`,
).join(" ");
tester.run("no-unknown-effect-channel-performance", noUnknownEffectChannelRule, {
	valid: [
		{ code: 'import { Effect } from "effect"; type Good = Effect.Effect<string, Error, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
		{ code: 'import { Effect } from "effect"; type Good = Effect.Effect<string, Error, Console>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
		{ code: 'import { Effect } from "effect"; type Good = Effect.Effect<string, unknown & Error, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
		{ code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: internal decode boundary\ntype Internal = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/internal.ts" },
		{ code: 'import { Effect } from "effect"; type Good = Effect.Effect<string, Error, never>;', filename: "/project/packages/flow-state/src/public.ts" },
	],
	invalid: [
		{ code: 'import { Effect } from "effect"; type Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Bad = Effect.Effect<string, Error, unknown>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Bad = Effect.Effect<string, string | unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Hidden = unknown; type Bad = Effect.Effect<string, Hidden, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: not attached\n\ntype Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{
			code: `import { Effect } from "effect"; ${deepUnknownUnion} type Bad = Effect.Effect<string, Channel25, never>;`,
			filename: "/project/packages/flow-state-rewrite/src/public.ts",
			errors: [{ messageId: "unknownChannel" }],
		},
	],
});
