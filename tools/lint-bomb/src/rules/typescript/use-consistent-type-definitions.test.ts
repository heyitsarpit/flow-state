import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { useConsistentTypeDefinitionsRule } from "./use-consistent-type-definitions.ts";

const tester = createRuleTester("use-consistent-type-definitions");

tester.run("use-consistent-type-definitions", useConsistentTypeDefinitionsRule, {
	valid: [
		"type Value = { value: string };",
		"interface Value extends Base { value: string; }",
		"declare interface Value { value: string; }",
		"interface Public { a: string } interface Public { b: number }",
		"class Client {}; interface Client { id: string };",
		"export default class Client {}; interface Client { id: string };",
		"namespace Nested { class Shared {} interface Shared { nested: string } }",
		"namespace Nested { interface Shared { a: string } interface Shared { b: number } }",
		"namespace Nested { export interface Shared { top: string } } namespace Nested { export interface Shared { nested: string } }",
		"export {}; declare global { interface Array<T> { auditOne?: string } } declare global { interface Array<T> { auditTwo?: number } }",
		"type Value = string;",
		{ code: "interface Other extends Base { value: string; }", options: [{ preference: "interface" }] },
	],
	invalid: [
		{
			code: "interface Value { value: string }",
			errors: [{ messageId: "preferType" }],
		},
		{
			code: "class Shared {} interface Shared { top: string } namespace Nested { interface Shared { nested: string } }",
			errors: [{ messageId: "preferType" }],
		},
		{
			code: "namespace Nested { interface Shared { top: string } } namespace Nested { interface Shared { nested: string } }",
			errors: [{ messageId: "preferType" }, { messageId: "preferType" }],
		},
		{
			code: "namespace Nested { export interface Shared { top: string } } namespace Nested { interface Shared { nested: string } }",
			errors: [{ messageId: "preferType" }, { messageId: "preferType" }],
		},
		{
			code: "namespace Nested { interface Shared { nested: string } } namespace Nested { export interface Shared { top: string } }",
			errors: [{ messageId: "preferType" }, { messageId: "preferType" }],
		},
		{ code: "interface Value { method(): void; }", errors: [{ messageId: "preferType" }] },
		{ code: "interface Value { readonly label: string; }", options: [{ preference: "type" }], errors: [{ messageId: "preferType" }] },
		{ code: "interface Values { [key: string]: string; }", options: [{ preference: "type" }], errors: [{ messageId: "preferType" }] },
		{ code: "interface Value { value: string; }", options: [{ preference: "type" }], errors: [{ messageId: "preferType" }] },
		{
			code: "type Value = { value: string };",
			options: [{ preference: "interface" }],
			errors: [{ messageId: "preferInterface" }],
		},
		{
			code: "type Values = { [key: string]: string };",
			options: [{ preference: "interface" }],
			errors: [{ messageId: "preferInterface" }],
		},
	],
});
