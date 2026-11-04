import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noExpectInIfRule } from "./no-expect-in-if.ts";

const tester = createRuleTester("no-expect-in-if");

tester.run("no-expect-in-if", noExpectInIfRule, {
  valid: [
    {
      code: 'test("x",()=>{const expect=()=>({toBe(){}}); if(flag) expect(1).toBe(1);});',
      filename: "/app/src/a.test.ts",
      languageOptions: { globals: { test: "readonly", expect: "readonly" } },
    },

    {
      code: 'test("x", () => { expect.assertions(1); switch(status) { case "ready": expect(value).toBe(true); break; } });',
      filename: "/app/src/example.test.ts",
    },
    {
      code: 'test("works", () => { if (value) expect(value).toBe(true); });',
      filename: "/project/src/production.ts",
    },
    {
      code: 'test("works", () => { expect.assertions(1); if (value) expect(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'test("works", () => { expect.assertions(0); expect.assertions(1); if (value) expect(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'test("works", () => { expect.assertions(2); expect(true).toBe(true); if (value) expect(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'test("works", () => { expect.assertions(2); value && expect(value).toBe(true); expect(true).toBe(true); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'import { expect, test } from "vitest"; test("works", () => { expect.assertions(1); if (value) expect.soft(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'test("works", function run() { const callbackName = run.name; expect.assertions(2); if (value) expect(value).toBe(true); expect(true).toBe(true); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'test.concurrent.each(cases)("works", () => { expect(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'test("works", () => { expect(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'test("works", () => { const expect = (_value: unknown) => ({ toBe: (_expected: unknown) => undefined }); if (value) expect(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'test("works", () => { if (check(expect(value).toBe(true))) run(); });',
      filename: "/project/src/example.test.ts",
    },
    {
      code: 'test("works", () => { value && expect(value).toBe(true); });',
      filename: "/project/src/production.ts",
    },
    {
      code: 'test("works", () => { const expect = { soft: (_value: unknown) => ({ toBe: () => undefined }) }; if (value) expect.soft(value).toBe(); });',
      filename: "/project/src/example.test.ts",
    },
  ],
  invalid: [
    {
      code: 'test("x",()=>{if(flag) expect(1).toBe(1);});',
      filename: "/app/src/a.test.ts",
      languageOptions: { globals: { test: "readonly", expect: "readonly" } },
      errors: [{ messageId: "conditionalAssertion" }],
    },

    {
      code: 'test("x", () => { switch(status) { case "ready": expect(value).toBe(true); break; } });',
      filename: "/app/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
    {
      code: 'test("x", () => { for(const item of []) expect(item).toBeDefined(); });',
      filename: "/app/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
    {
      code: 'test("x", () => { expect.assertions(1); for(const item of []) expect(item).toBeDefined(); });',
      filename: "/app/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
    {
      code: `test("works", () => {
	value && expect(value).toBe(true);
	value || expect(value).toBe(false);
	value ?? expect(value).toBeDefined();
	value ? expect(value).toBe(true) : expect(value).toBe(false);
});`,
      filename: "/project/src/example.test.ts",
      errors: Array.from({ length: 5 }, () => ({ messageId: "conditionalAssertion" })),
    },
    {
      code: 'import { expect as check, test as spec } from "vitest"; spec("works", () => { if (value) check.soft(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
    {
      code: 'import * as vitest from "vitest"; test("works", () => { if (value) vitest.expect.soft(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
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
    {
      code: 'test("works", () => { expect(true).toBe(true); if (record.ok) expect(record.expected).toBeDefined(); });',
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
    {
      code: 'test("works", () => { expect.assertions(1); expect.assertions(0); if (value) expect(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
    {
      code: `test("works", () => {
	expect.assertions(2);
	if (record.ok) expect(record.expected).toBeDefined();
	for (const item of [1, 2]) expect(item).toBeGreaterThan(0);
});`,
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }, { messageId: "conditionalAssertion" }],
    },
    {
      code: `let depth = 0;
test("works", function run() {
	expect.assertions(2);
	if (record.ok) expect(record.expected).toBeDefined();
	if (depth++ === 0) run();
	expect(true).toBe(true);
});`,
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
    {
      code: 'import { expect as check, test as spec } from "vitest"; spec("works", () => { if (value) check(value).toBe(true); });',
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
    {
      code: 'test("works", () => { const verify = () => { if (value) expect(value).toBe(true); }; verify(); });',
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
    {
      code: 'test("works", () => { expect.assertions(1); const verify = () => { if (value) expect(value).toBe(true); }; });',
      filename: "/project/src/example.test.ts",
      errors: [{ messageId: "conditionalAssertion" }],
    },
  ],
});

tester.run("no-expect-in-if-declaration-boundaries", noExpectInIfRule, {
  valid: [
    { code: 'test("x", () => { expect.assertions(1); if(value) expect(value).toBe(true); });', filename: '/app/src/value.test.ts' },
  ],
  invalid: [
    {
      code: 'test("x", () => { expect.assertions(1); function helper() { if(value) expect(value).toBe(true); } });',
      filename: '/app/src/value.test.ts',
      errors: [{messageId: 'conditionalAssertion'}],
    },
    {
      code: 'test("x", () => { expect.assertions(1); function helper() { if(value) expect(value).toBe(true); } helper(); });',
      filename: '/app/src/value.test.ts',
      errors: [{messageId: 'conditionalAssertion'}],
    },
  ],
});
