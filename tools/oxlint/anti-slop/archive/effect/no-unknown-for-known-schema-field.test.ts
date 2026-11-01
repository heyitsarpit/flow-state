// Archived: superseded by anti-slop/no-unknown. Retained for historical reference; not registered.
import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnknownForKnownSchemaFieldRule } from "./no-unknown-for-known-schema-field.ts";

const tester = createRuleTester("no-unknown-for-known-schema-field");

tester.run("no-unknown-for-known-schema-field", noUnknownForKnownSchemaFieldRule, {
	valid: [
		{ code: 'import { Schema } from "effect"; const config = { staleTime: Schema.DurationFromMillis };', filename: "/project/packages/flow-state-rewrite/src/resource.ts" },
		{ code: 'import { Schema } from "effect"; const config = Schema.Struct({ staleTime: Schema.optional(Schema.Unknown) });', filename: "/project/packages/flow-state-rewrite/src/resource.ts", options: [{ fields: ["staleTime"], openFields: ["staleTime"], sourceRoots: ["packages/flow-state-rewrite/src"] }] },
		{ code: 'import { Schema } from "effect"; const config = Schema.Struct({ staleTime: Schema.optional(Schema.Unknown) });', filename: "/project/packages/flow-state-rewrite/src/operation/resource.ts", options: [{ fields: ["staleTime"], allowedFiles: ["packages/flow-state-rewrite/src/operation/resource.ts"], sourceRoots: ["packages/flow-state-rewrite/src"] }] },
		{ code: 'import { Schema } from "effect"; const config = Schema.Struct({ metadata: Schema.optional(Schema.Unknown) });', filename: "/project/packages/flow-state-rewrite/src/operation/resource.ts", options: [{ fields: ["metadata"], allowedFiles: ["packages/flow-state-rewrite/src/operation/resource.ts"], sourceRoots: ["packages/flow-state-rewrite/src"] }] },
		{ code: 'import { Schema } from "effect"; const config = { staleTime: Schema.optional(Schema.Unknown) };', filename: "/project/packages/flow-state-rewrite/src/operation/resource.ts", options: [{ fields: ["staleTime"], sourceRoots: ["packages/flow-state-rewrite/src"] }] },
		{ code: 'import { Schema } from "effect"; const config = Schema.transform({ staleTime: Schema.optional(Schema.Unknown) });', filename: "/project/packages/flow-state-rewrite/src/operation/resource.ts", options: [{ fields: ["staleTime"], sourceRoots: ["packages/flow-state-rewrite/src"] }] },
	],
	invalid: [
		{
			code: 'import { Schema } from "effect"; const config = Schema.Struct({ gcTime: Schema.Unknown, metadata: Schema.optional(Schema.Unknown) });',
			filename: "/project/packages/flow-state-rewrite/src/resource.ts",
			options: [{ fields: ["gcTime", "metadata"] }],
			errors: [{ messageId: "knownField" }, { messageId: "knownField" }],
		},
		{
			code: 'import { Schema as S } from "effect"; const config = S.Struct({ timeout: S.Unknown });',
			filename: "/project/packages/flow-state-rewrite/src/resource.ts",
			options: [{ fields: ["timeout"] }],
			errors: [{ messageId: "knownField" }],
		},
		{
			code: 'import * as Fx from "effect"; const config = Fx.Schema.Struct({ gcTime: Fx.Schema.optionalKey(Fx.Schema.Unknown) });',
			filename: "/project/packages/flow-state-rewrite/src/resource.ts",
			options: [{ fields: ["gcTime"] }],
			errors: [{ messageId: "knownField" }],
		},
		{
			code: 'import { Schema } from "effect"; const config = Schema.Struct({ ["staleTime"]: Schema.Unknown });',
			filename: "/project/packages/flow-state-rewrite/src/resource.ts",
			options: [{ fields: ["staleTime"] }],
			errors: [{ messageId: "knownField" }],
		},
		{
			code: 'import { Schema } from "effect"; const config = Schema.Struct({ metadata: Schema.optional(Schema.optionalKey(Schema.Unknown)) });',
			filename: "/project/packages/flow-state-rewrite/src/resource.ts",
			options: [{ fields: ["metadata"] }],
			errors: [{ messageId: "knownField" }],
		},
	],
});
