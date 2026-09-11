import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noObjectFreezeRule } from "./no-object-freeze.ts";

const tester = createRuleTester("no-object-freeze");

tester.run("no-object-freeze-regression", noObjectFreezeRule, {
	valid: [
		"const snapshot = { ...value };",
		"const localObject = { freeze: (input) => input }; localObject.freeze(value);",
		"function read(Object) { return Object.freeze(value); }",
		"const Object = { freeze<T>(value: T): T { return value; } }; Object.freeze(value);",
		"function save(Object: typeof globalThis.Object) { return Object.freeze(value); }",
	],
	invalid: [
		{ code: "Object.freeze(value);", errors: [{ messageId: "objectFreeze" }] },
		{ code: 'Object["freeze"](value);', errors: [{ messageId: "objectFreeze" }] },
		{ code: "const freeze = Object.freeze;", errors: [{ messageId: "objectFreeze" }] },
		{ code: "Object.freeze(new Map());", errors: [{ messageId: "objectFreeze" }] },
		{ code: 'Object["freeze"]({});', errors: [{ messageId: "objectFreeze" }] },
	],
});
