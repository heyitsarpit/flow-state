// Archived: superseded by anti-slop/no-unknown. Retained for historical reference; not registered.
import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnknownTypeAliasesRule } from "./no-unknown-type-aliases.ts";

const tester = createRuleTester("no-unknown-type-aliases");

tester.run("no-unknown-type-aliases-regression", noUnknownTypeAliasesRule, {
	valid: [
		"type Value = string;",
		"function outer() { type Value = string; return null as Value; }",
		"type AsyncPayload = Promise<unknown>; type UnknownList = Array<unknown>; type UnknownMap = Record<string, unknown>;",
		"type First = Second; type Second = First;",
		"type Value = unknown & { id: string };",
	],
	invalid: [
		{ code: "type Value = string | unknown;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type Box<T> = T; type Value = Box<unknown>;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type Payload = { value: unknown } | unknown;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type Box<T> = T; type Payload = Box<unknown | string>;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type UnknownValue = unknown;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type NullableValue = unknown | null | undefined;", errors: [{ messageId: "unknownAlias" }] },
	],
});

let duplicateBranch = "unknown";
for (let index = 0; index < 20; index += 1) duplicateBranch = `Branch<${duplicateBranch}>`;
tester.run("no-unknown-type-aliases-performance", noUnknownTypeAliasesRule, {
	valid: [
		"type Value = string;",
		"type Box<T> = T; type Value = Box<string>;",
		"type Value = unknown & { id: string };",
		"type First = Second; type Second = First;",
		"type Value = Promise<unknown>;",
	],
	invalid: [
		{ code: "type Bad = unknown;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type Bad = string | unknown;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type Box<T> = T; type Bad = Box<unknown>;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type Inner<T> = T; type Bad = Inner<unknown>;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type Bad = unknown & unknown;", errors: [{ messageId: "unknownAlias" }] },
		{
			code: `type Branch<T> = T | T; type Bad = ${duplicateBranch};`,
			errors: [{ messageId: "unknownAlias" }],
		},
	],
});
