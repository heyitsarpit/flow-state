import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noStagedObjectAssignRule } from "./no-staged-object-assign.ts";

const tester = createRuleTester("no-staged-object-assign");

tester.run("no-staged-object-assign", noStagedObjectAssignRule, {
	valid: [
		"const value = Object.assign({}, first, second);",
		"const value = Object.assign({}, first); const result = Object.assign({}, value, second);",
		"const Object = { assign: Object.assign }; const value = Object.assign({}, first); Object.assign(value, second);",
		"let value = Object.assign({}, first); value = replacement; Object.assign(value, second);",
		"const value = {}; const result = Object.assign({}, value);",
	],
	invalid: [
		{
			code: "function create() { const value = Object.assign({ kind: 'module' }, inventory); return Object.assign(value, { summary }); }",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
		{
			code: "let value = Object.assign({}, first); Object.assign(value, second);",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
		{
			code: "const value = Object.assign({}, first) as Value; Object.assign(value, second);",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
		{
			code: "const value = Object.assign({}, first); Object.assign(value, second, third);",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
		{
			code: "const value = Object.assign(base, first); Object.assign(value, second);",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
		{
			code: "const value = Object.assign({}, first); Object[\"assign\"](value, second);",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
		{
			code: "const value = {}; Object.assign(value, first);",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
	],
});
