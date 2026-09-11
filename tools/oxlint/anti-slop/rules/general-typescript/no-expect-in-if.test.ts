import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noExpectInIfRule } from "./no-expect-in-if.ts";

const tester = createRuleTester("no-expect-in-if");

tester.run("no-expect-in-if", noExpectInIfRule, {
	valid: [
		{ code: 'test("works", () => { if (value) expect(value).toBe(true); });', filename: "/project/src/production.ts" },
		{ code: 'test("works", () => { expect(value).toBe(true); if (value) expect(value).toBe(true); });', filename: "/project/src/example.test.ts" },
		{ code: 'test("works", () => { expect.assertions(1); if (value) expect(value).toBe(true); });', filename: "/project/src/example.test.ts" },
		{ code: 'test.concurrent.each(cases)("works", () => { expect(value).toBe(true); });', filename: "/project/src/example.test.ts" },
		{ code: 'test("works", () => { expect(value).toBe(true); });', filename: "/project/src/example.test.ts" },
	],
	invalid: [
		{
			code: 'test("works", () => { if (value) expect(value).toBe(true); });',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "conditionalAssertion" }],
		},
		{
			code: 'test.each([[true]])("works", (value) => { if (value) expect(value).toBe(true); });',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "conditionalAssertion" }],
		},
		{
			code: 'test.each(cases)("works", () => { if (value) expect(value).resolves.toBe(true); });',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "conditionalAssertion" }],
		},
		{
			code: 'test("works", () => { if (value) expect.hasAssertions(); });',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "conditionalAssertion" }],
		},
		{
			code: 'describe("suite", () => { it("works", () => { if (value) expect(value).toBe(true); }); });',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "conditionalAssertion" }],
		},
	],
});
