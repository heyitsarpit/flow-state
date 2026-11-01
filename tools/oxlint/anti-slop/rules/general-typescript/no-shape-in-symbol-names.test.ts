import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noForbiddenTermInSymbolNamesRule } from "./no-shape-in-symbol-names.ts";

const tester = createRuleTester("no-shape-in-symbol-names");

tester.run("no-shape-in-symbol-names-regression", noForbiddenTermInSymbolNamesRule, {
	valid: [
		"const value = { shape: 1 };",
		"function read(shape: string) { return shape; }",
		"const value = shape;",
		"const method = { shape() {} };",
		"const value = 1; console.log(value);",
	],
	invalid: [
		{ code: "const shapeValue = 1;", errors: [{ messageId: "forbiddenSymbolName" }] },
		{ code: "function shapeFactory() {}", errors: [{ messageId: "forbiddenSymbolName" }] },
		{ code: "class ShapeOwner {}", errors: [{ messageId: "forbiddenSymbolName" }] },
		{ code: "type Shape = string;", errors: [{ messageId: "forbiddenSymbolName" }] },
		{ code: "interface PayloadShape {}", errors: [{ messageId: "forbiddenSymbolName" }] },
	],
});
