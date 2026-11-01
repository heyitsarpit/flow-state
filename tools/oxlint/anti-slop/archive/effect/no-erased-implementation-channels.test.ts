// Archived: superseded by anti-slop/no-unknown. Retained for historical reference; not registered.
import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noErasedImplementationChannelsRule } from "./no-erased-implementation-channels.ts";

const tester = createRuleTester("no-erased-implementation-channels");

tester.run("no-erased-implementation-channels", noErasedImplementationChannelsRule, {
	valid: [
			'import { Effect } from "effect"; type Implementation = { acquire: Effect.Effect<string, Error, never> };',
			'import { Effect } from "effect"; type Implementation = { acquire: Effect.Effect<string, DomainError, unknown> };',
			'import { Effect } from "effect"; type Other = { run: Effect.Effect<string, unknown, unknown> };',
			'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: private heterogeneous provider storage.\ntype ImplementationProviderEntry = { acquire: Effect.Effect<unknown, unknown, unknown> };',
			{ code: 'import { Effect } from "effect"; type ImplementationProviderEntry = { acquire: Effect.Effect<unknown, unknown, unknown> };', filename: "/project/packages/other/src/entry.ts", options: [{ sourceRoots: ["packages/flow-state-rewrite/src/implementation"] }] },
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; type ImplementationProviderEntry = { acquire: Effect.Effect<unknown, unknown, unknown> };',
			errors: [{ messageId: "channel" }],
		},
		{
			code: 'import { Effect } from "effect"; type ImplementationProviderEntry = { acquire: Effect.Effect<unknown, unknown, unknown> };',
			filename: "/project/packages/flow-state-rewrite/src/implementation/entry.ts",
			options: [{ sourceRoots: ["packages/flow-state-rewrite/src/implementation"] }],
			errors: [{ messageId: "channel" }],
		},
		{
			code: 'import * as Fx from "effect"; type ProviderAdapter = { acquire: Fx.Effect<unknown, unknown, unknown> };',
			errors: [{ messageId: "channel" }],
		},
		{
			code: 'import { Effect } from "effect"; type Implementation = { acquire: Effect.Effect<string | unknown, never | unknown, unknown> };',
			errors: [{ messageId: "channel" }],
		},
		{
			code: 'import { Effect } from "effect"; type ProviderCapability = { acquire: Effect.Effect<unknown, unknown, unknown> };',
			filename: "/project/packages/flow-state-rewrite/src/implementation/provider.ts",
			options: [{ sourceRoots: ["packages/flow-state-rewrite/src/implementation"] }],
			errors: [{ messageId: "channel" }],
		},
	],
});
