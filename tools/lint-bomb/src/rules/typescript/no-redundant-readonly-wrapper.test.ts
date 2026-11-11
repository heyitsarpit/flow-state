import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noRedundantReadonlyWrapperRule } from "./no-redundant-readonly-wrapper.ts";

const tester = createRuleTester("no-redundant-readonly-wrapper");

tester.run("no-redundant-readonly-wrapper", noRedundantReadonlyWrapperRule, {
	valid: [
		"type Value = { readonly value: string };",
		"namespace Custom { type Readonly<T> = T; type Value = Readonly<{ readonly id: string }>; }",
		"type Value = Readonly<{ value: string }> ;",
		"type Value = Readonly<{ readonly value: string; mutable: number }>;",
		"type Value = Readonly<Record<string, string>>;",
		"type Value = Readonly<{}>;",
		"type Value = Readonly<{ method(): void }>;",
		'import { Data } from "effect"; type E = Data.TaggedEnum<{ A: { id: string }; B: {} }>;',
		'import { TaggedEnum } from "effect"; type E = TaggedEnum<{ A: { id: string } }>;',
		'import { Data } from "effect"; type E = Data.TaggedEnum<{ A: { items: ReadonlyArray<string> } }>;',
		'import { Data } from "effect"; type E = Data.TaggedEnum<{ A: { nested: { readonly id: string } } }>;',
		"type Plain = { A: { readonly id: string } };",
		'import { Data } from "effect"; type Other = { readonly id: string }; type E = Data.TaggedEnum<{ A: { id: string } }>;',
		'namespace Custom { type TaggedEnum<T> = T; type E = TaggedEnum<{ A: { readonly id: string } }>; }',
	],
	invalid: [
		{
			code: 'import { Data } from "effect"; type E = Data.TaggedEnum<{ A: { readonly id: string; name: string }; B: {} }>;',
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'import { TaggedEnum } from "effect"; type E = TaggedEnum<{ A: { readonly id: string } }>;',
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: 'import { Data } from "effect"; type E = Data.TaggedEnum<{ A: { readonly id: string; readonly name: string } }>;',
			errors: [{ messageId: "taggedEnum" }, { messageId: "taggedEnum" }],
		},
		{
			code: 'import { Data } from "effect"; type E = Data.TaggedEnum<{ A: { readonly nested: { readonly id: string } } }>;',
			errors: [{ messageId: "taggedEnum" }],
		},
		{
			code: "type Value = Readonly<{ readonly value: string }>;",
			errors: [{ messageId: "redundant" }],
		},
		{
			code: "type Value = Readonly<{ readonly id: string; readonly name: string }>;",
			errors: [{ messageId: "redundant" }],
		},
		{
			code: "type Value = Readonly<{ readonly [key: string]: string }>;",
			errors: [{ messageId: "redundant" }],
		},
		{
			code: "type Value = Readonly<({ readonly value: string })>;",
			errors: [{ messageId: "redundant" }],
		},
		{
			code: "type Value = Readonly<{ readonly nested: { readonly id: string } }>;",
			errors: [{ messageId: "redundant" }],
		},
	],
});
