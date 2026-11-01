import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnknownRule } from "./no-unknown.ts";

const tester = createRuleTester("no-unknown");

tester.run("no-unknown", noUnknownRule, {
	valid: [
		"type Constraint<T extends unknown> = T;",
		"type Default<T = unknown> = T;",
		"type IsUnknown<T> = unknown extends T ? true : false;",
		"type IsUnknown<T> = T extends unknown ? true : false;",
		"type Callback = (...args: unknown[]) => unknown;",
		'import { Schema } from "effect"; function parse(value: unknown) { return Schema.decodeUnknownSync(Schema.String)(value); }',
		'import { Schema as S } from "effect"; const parse = (value: unknown) => S.decodeUnknownSync(S.String)(value);',
		'import { Schema } from "effect"; type Domain = { id: string }; const DomainSchema = Schema.declareConstructor<Domain, unknown>()([], (value) => value);',
		"const isDomain = (value: unknown): value is { id: string } => typeof value === \"object\" && value !== null;",
		"try { throw new Error(); } catch (error: unknown) { return error; }",
		{
			code: 'import { Schema } from "effect"; const Config = Schema.Struct({ staleTime: Schema.Unknown });',
			filename: "/project/packages/flow-state-rewrite/src/operation/resource.ts",
			options: [
				{
					allowedSchemaFields: [
						{
							file: "packages/flow-state-rewrite/src/operation/resource.ts",
							fields: ["staleTime"],
						},
					],
				},
			],
		},
		{
				code: "interface Failure { cause: unknown; }",
				filename: "/project/packages/flow-state-rewrite/src/diagnostic/failure.ts",
				options: [
					{
						allowedProperties: [
							{
								file: "packages/flow-state-rewrite/src/diagnostic/failure.ts",
								fields: ["cause"],
							},
						],
					},
				],
			},
		`// FLOW_STATE_ALLOW_UNKNOWN: heterogeneous registry storage.
type Entry = { value: unknown };`,
	],
	invalid: [
		{ code: "type Box = { value: unknown };", errors: [{ messageId: "unknown" }] },
		{ code: "function parse(value: unknown) { return value; }", errors: [{ messageId: "unknown" }] },
		{ code: "function parse(cause: unknown) { return cause; }", errors: [{ messageId: "unknown" }] },
		{ code: "function parse(): unknown { return 1; }", errors: [{ messageId: "unknown" }] },
		{ code: "type Values = Record<string, unknown>;", errors: [{ messageId: "unknown" }] },
		{
			code: 'import { Effect } from "effect"; type Bad = Effect.Effect<string, unknown, unknown>;',
			errors: [{ messageId: "unknown" }, { messageId: "unknown" }],
		},
		{ code: "const erased = 1 as unknown;", errors: [{ messageId: "unknown" }] },
		{
			code: 'import { Schema } from "effect"; const Config = Schema.Struct({ known: Schema.Unknown });',
			errors: [{ messageId: "unknown" }],
		},
		{
			code: 'import { Schema } from "effect"; const Config = Schema.Struct({ known: Schema.optional(Schema.Unknown) });',
			errors: [{ messageId: "unknown" }],
		},
		{
			code: "type Bad<T> = T extends string ? { value: unknown } : never;",
			errors: [{ messageId: "unknown" }],
		},
		{
			code: `// FLOW_STATE_ALLOW_UNKNOWN: not attached

type Entry = { value: unknown };`,
			errors: [{ messageId: "unknown" }],
		},
	],
});
