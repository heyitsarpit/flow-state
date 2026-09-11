import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noModuleMockingRule } from "./no-module-mocking.ts";

const tester = createRuleTester("no-module-mocking");

tester.run("no-module-mocking", noModuleMockingRule, {
	valid: [
		{ code: 'import { vi } from "vitest"; vi.mock("./dependency");', filename: "/project/src/production.ts" },
		{ code: 'import { vi } from "vitest"; vi.fn();', filename: "/project/src/example.test.ts" },
		{ code: 'import { jest } from "@jest/globals"; jest.mock("./dependency");', filename: "/project/src/production.ts" },
		{ code: 'import { vi } from "vitest"; vi.doMock("./dependency");', filename: "/project/src/production.ts" },
		{ code: 'const mock = { mock() {} }; mock.mock("./dependency");', filename: "/project/src/example.test.ts" },
	],
	invalid: [
		{
			code: 'import { vi } from "vitest"; vi.mock("./dependency");',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "moduleMock" }],
		},
		{
			code: 'import * as vi from "vitest"; vi["mock"]("./dependency");',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "moduleMock" }],
		},
		{
			code: 'import * as vitest from "vitest"; vitest.mock("./dependency");',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "moduleMock" }],
		},
		{ code: 'import { vi } from "vitest"; vi.doMock("./dependency");', filename: "/project/src/example.test.ts", errors: [{ messageId: "moduleMock" }] },
		{ code: 'import { jest } from "@jest/globals"; jest.unstable_mockModule("./dependency");', filename: "/project/src/example.test.ts", errors: [{ messageId: "moduleMock" }] },
	],
});
