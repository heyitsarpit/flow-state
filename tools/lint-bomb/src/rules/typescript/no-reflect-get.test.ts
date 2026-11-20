import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noReflectGetRule } from "./no-reflect-get.ts";

const tester = createRuleTester("no-reflect-get");

tester.run("no-reflect-get-regression", noReflectGetRule, {
	valid: [
		"value[key];",
		"const Reflect = { get: (value: unknown, key: string) => value }; Reflect.get(value, key);",
		"Reflect.apply(callback, undefined, [value]);",
		"const get = Reflect.get; void get;",
		"const globalThis = { Reflect: { get: (value: unknown) => value } }; globalThis.Reflect.get(value, key);",
		"globalThis[Reflect].get(value, key);",
	],
	invalid: [
		{ code: "Reflect.get(value, key);", errors: [{ messageId: "reflectGet" }] },
		{ code: 'Reflect["get"](value, key);', errors: [{ messageId: "reflectGet" }] },
		{ code: 'Reflect.get(value, "name");', errors: [{ messageId: "reflectGet" }] },
		{ code: "Reflect.get(value, symbolKey);", errors: [{ messageId: "reflectGet" }] },
		{ code: "Reflect.get(value, key, receiver);", errors: [{ messageId: "reflectGet" }] },
		{ code: "globalThis.Reflect.get(value, key);", errors: [{ messageId: "reflectGet" }] },
		{ code: "global.Reflect.get(value, key);", errors: [{ messageId: "reflectGet" }] },
	],
});
