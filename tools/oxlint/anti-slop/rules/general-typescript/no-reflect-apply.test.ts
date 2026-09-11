import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noReflectApplyRule } from "./no-reflect-apply.ts";

const tester = createRuleTester("no-reflect-apply");

tester.run("no-reflect-regression", noReflectApplyRule, {
	valid: [
		"callback(value);",
		"const Reflect = { apply: (fn: unknown) => fn }; Reflect.apply(callback);",
		"Reflect.get(value, key);",
		"const apply = Reflect.apply; void apply;",
		"const globalThis = { Reflect: { apply: callback } }; globalThis.Reflect.apply(callback);",
		"globalThis[Reflect].apply(callback, undefined, [value]);",
	],
	invalid: [
		{ code: "Reflect.apply(callback, undefined, [value]);", errors: [{ messageId: "reflectApply" }] },
		{ code: 'Reflect["apply"](callback, undefined, [value]);', errors: [{ messageId: "reflectApply" }] },
		{ code: "Reflect.apply(callback, null, []);", errors: [{ messageId: "reflectApply" }] },
		{ code: "Reflect.apply(callback, this, args);", errors: [{ messageId: "reflectApply" }] },
		{ code: "function invoke() { return Reflect.apply(callback, receiver, arguments); }", errors: [{ messageId: "reflectApply" }] },
		{ code: "globalThis.Reflect.apply(callback, undefined, [value]);", errors: [{ messageId: "reflectApply" }] },
		{ code: "global.Reflect.apply(callback, undefined, [value]);", errors: [{ messageId: "reflectApply" }] },
	],
});
