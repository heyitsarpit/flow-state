import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnknownRule } from "./no-unknown.ts";

const tester = createRuleTester("no-unknown");

tester.run("no-unknown", noUnknownRule, {
	valid: [
		{
			code: "type Boundary = unknown;",
			filename: "/project/packages/other/src/module.ts",
			options: [{ sourceRoots: ["/project/packages/flow-state-rewrite/src"] }],
		},
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
							file: "/project/packages/flow-state-rewrite/src/operation/resource.ts",
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
								file: "/project/packages/flow-state-rewrite/src/diagnostic/failure.ts",
								fields: ["cause"],
							},
						],
					},
				],
			},
		`// FLOW_STATE_ALLOW_UNKNOWN: heterogeneous registry storage.
type Entry = { value: unknown };`,
		{
			code: `import { Schema as S } from "effect";
const ProfileSchema = S.Struct({ username: S.String });
	const isProfile = (value: unknown): value is S.Schema.Type<typeof ProfileSchema> => S.is(ProfileSchema)(value);`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `import * as Effect from "effect";
const ProfileSchema = Effect.Schema.Struct({ username: Effect.Schema.String });
const isProfileSchema = Effect.Schema.is(ProfileSchema);
type Profile = Effect.Schema.Schema.Type<typeof ProfileSchema>;
function isProfile(value: unknown): value is Profile { return isProfileSchema(value); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `import { Schema } from "effect";
const ProfileSchema = Schema.Struct({ username: Schema.String });
function assertProfile(value: unknown): asserts value is Schema.Schema.Type<typeof ProfileSchema> { Schema.asserts(ProfileSchema, value); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `import { Schema } from "effect";
const ProfileSchema = Schema.Struct({ username: Schema.String });
type Profile = Schema.Schema.Type<typeof ProfileSchema>;
function isProfile(value: unknown): value is Profile { return Schema.is(ProfileSchema)(value); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `import { Schema } from "effect";
const ProfileSchema = Schema.Struct({ username: Schema.String });
type Profile = typeof ProfileSchema.Type;
function isProfile(value: unknown): value is Profile { return Schema.is(ProfileSchema)(value); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `import { Schema } from "effect";
const ProfileSchema = Schema.Struct({ username: Schema.String });
const AliasSchema = ProfileSchema;
type Profile = typeof AliasSchema.Type;
function isProfile(value: unknown): value is Profile { return Schema.is(ProfileSchema)(value); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `import { Schema } from "effect";
const ProfileSchema = Schema.Struct({ username: Schema.String });
type Profile = typeof ProfileSchema.Type;
const isProfileSchema = Schema.is(ProfileSchema);
function isProfile(value: unknown): value is Profile { return isProfileSchema(value); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `type Profile = { username: string };
function isProfile(value: Profile): value is Profile { return true; }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `type Profile = { username: string };
type ProfileGuard = (value: unknown) => value is Profile;`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `type Profile = { username: string };
interface ProfileGuards { is(value: unknown): value is Profile; }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `type Profile = { username: string };
declare function isProfile(value: unknown): value is Profile;`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: `type Profile = { username: string };
declare function isProfile(value: any): value is Profile;`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
		},
		{
			code: "function isProfile(value: unknown): value is object { return true; }",
			filename: "/project/packages/other/src/profile.ts",
			options: [{ admissionRoots: ["/project/packages/app/src"] }],
		},
		{
			code: "const isProfile = (value: any): value is object => true;",
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"], reportAnyAdmissionPredicates: false }],
		},
	],
	invalid: [
		{ code: "type Box = { value: unknown };", errors: [{ messageId: "unknown" }] },
		{
			code: "function parse(value: unknown) { return value; }",
			errors: [{
				message: "This explicit unknown is outside the rule's recognized exceptions. Preserve the named type or generic relationship. External input may remain unknown at its boundary; decode it with Schema before downstream use. Document intentional erasure with FLOW_STATE_ALLOW_UNKNOWN:.",
			}],
		},
		{ code: "function parse(cause: unknown) { return cause; }", errors: [{ messageId: "unknown" }] },
		{ code: 'import { Schema } from "effect"; function parse(value: unknown) { function nested(value: string) { Schema.decodeUnknownSync(Schema.String)(value); } return value; }', errors: [{ messageId: "unknown" }] },
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
		{
			code: `type Profile = { username: string };
const isProfile = (value: unknown): value is Profile =>
	typeof value === "object" && value !== null && "username" in value;`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionRoots: ["/project/packages/app/src"] }],
			errors: [{
				message: "This configured admission implementation declares a type predicate for unknown or any input that is not tied to a recognized Schema-derived result. Use a Schema decoder or return a guard derived from the same Schema; this rule checks syntax and does not verify arbitrary schema/type equivalence.",
			}],
		},
		{
			code: `import { Schema } from "effect";
type Profile = { username: string };
const ProfileSchema = Schema.Struct({ username: Schema.String });
function isProfile(value: unknown): value is Profile {
	const Schema = { is: (_schema: object) => (_value: object) => true };
	return Schema.is(ProfileSchema)(value);
}`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{ messageId: "admission" }],
		},
		{
			code: `import { Schema } from "./schema.ts";
type Profile = { username: string };
function isProfile(value: unknown): value is Profile { return Schema.is(Profile)(value); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{ messageId: "admission" }],
		},
		{
			code: `import { Schema } from "effect";
function isProfile(value: unknown): value is { username: string } { return Schema.is(Schema.String)(value); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{ messageId: "admission" }],
		},
		{
			code: `import { Schema } from "effect";
const ProfileSchema = Schema.Struct({ username: Schema.String });
const OtherSchema = Schema.Number;
type Profile = typeof OtherSchema.Type;
function isProfile(value: unknown): value is Profile { return Schema.is(ProfileSchema)(value); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{ messageId: "admission" }],
		},
		{
			code: `type Profile = { username: string };
function isMarker(value: unknown, marker: string): marker is string { return true; }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{ messageId: "unknown" }],
		},
		{
			code: `type Profile = { username: string };
function assertProfile(value: unknown): asserts value is Profile { if (!value) throw new Error(); }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{ messageId: "admission" }],
		},
		{
			code: `import { Schema } from "effect";
type Profile = { username: string };
const ProfileSchema = Schema.Struct({ username: Schema.String });
function assertProfile(value: unknown): asserts value is Profile {
	const Schema = { asserts: (_schema: object, _value: object) => undefined };
	Schema.asserts(ProfileSchema, value);
}`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{ messageId: "admission" }],
		},
		{
			code: `import { Schema } from "effect";
type Profile = { username: string };
const ProfileSchema = Schema.Struct({ username: Schema.String });
function assertProfile(value: unknown, other: object): asserts value is Profile {
	Schema.asserts(ProfileSchema, other);
}`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{ messageId: "admission" }],
		},
		{
			code: "function isProfile(value: any): value is object { return true; }",
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{
				message: "This configured admission implementation declares a type predicate for unknown or any input that is not tied to a recognized Schema-derived result. Use a Schema decoder or return a guard derived from the same Schema; this rule checks syntax and does not verify arbitrary schema/type equivalence.",
			}],
		},
		{
			code: `class ProfileGuard { isProfile(this: unknown): this is object { return true; } }`,
			filename: "/project/packages/app/src/profile.ts",
			options: [{ admissionFiles: ["/project/packages/app/src/profile.ts"] }],
			errors: [{ messageId: "unknown" }],
		},
	],
});
