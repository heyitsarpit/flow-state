import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noShallowJsonDomainCastRule } from "./no-shallow-json-domain-cast.ts";

const tester = createRuleTester("no-shallow-json-domain-cast");

tester.run("no-shallow-json-domain-cast", noShallowJsonDomainCastRule, {
	valid: [
		{
			code: "const raw: unknown = JSON.parse(source);",
			filename: "/project/packages/flow-state/src/runtime/runtime-boot-decoder.ts",
		},
		{
			code: "const raw = JSON.parse(source);",
			filename: "/project/packages/flow-state/src/core/inspection/trace-artifact.ts",
		},
		{ code: "const value = JSON.parse(source);", filename: "/project/src/runtime/runtime-boot-decoder.ts" },
		{ code: "const value = JSON.parse(source);", filename: "/project/src/value.test.ts" },
		{ code: "const value = JSON.parse(source);", filename: "/project/data/value.json" },
	],
	invalid: [
		{
			code: "const value = JSON.parse(source) as DomainValue;",
			errors: [{ messageId: "jsonParse" }],
		},
		{
			code: "let value: DomainValue; value = JSON.parse(source);",
			errors: [{ messageId: "jsonParse" }],
		},
		{ code: "function read() { return JSON.parse(source); }", errors: [{ messageId: "jsonParse" }] },
		{ code: "const raw: unknown = JSON.parse(source);", errors: [{ messageId: "jsonParse" }] },
		{ code: "function decode() { return JSON.parse(source) as DomainValue; }", errors: [{ messageId: "jsonParse" }] },
	],
});
