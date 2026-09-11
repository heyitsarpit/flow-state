import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noLargeProductionFileRule } from "./no-large-production-file.ts";

const tester = createRuleTester("no-large-production-file");

const largeProductionFile = Array.from({ length: 501 }, (_, index) => `const value${index} = ${index};`).join("\n");
const largeTestFile = Array.from({ length: 1001 }, (_, index) => `const testValue${index} = ${index};`).join("\n");
const customProductionFile = Array.from({ length: 4 }, (_, index) => `const customValue${index} = ${index};`).join("\n");
const customTestFile = Array.from({ length: 4 }, (_, index) => `const customTestValue${index} = ${index};`).join("\n");
const windowsProductionFile = Array.from({ length: 501 }, (_, index) => `const windowsValue${index} = ${index};`).join("\n");
tester.run("no-large-production-file", noLargeProductionFileRule, {
	valid: [
		{ code: "const value = 1;", filename: "/project/packages/demo/src/value.ts" },
		{
			code: Array.from({ length: 1000 }, (_, index) => `const testValue${index} = ${index};`).join("\n"),
			filename: "/project/packages/demo/src/value.test.ts",
		},
		{
			code: Array.from({ length: 500 }, (_, index) => `const value${index} = ${index};`).join("\n") + "\n",
			filename: "/project/packages/demo/src/value.ts",
		},
		{
			code: Array.from({ length: 500 }, (_, index) => `const value${index} = ${index};`).join("\n") + "\n\n",
			filename: "/project/packages/demo/src/value.ts",
		},
		{
			code: Array.from({ length: 1001 }, (_, index) => `declare const value${index}: string;`).join("\n"),
			filename: "/project/packages/demo/src/types.d.ts",
		},
	],
	invalid: [
		{
			code: largeProductionFile,
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "largeFile" }],
		},
		{
			code: largeTestFile,
			filename: "/project/packages/demo/src/value.test.ts",
			errors: [{ messageId: "largeFile" }],
		},
		{
			code: customProductionFile,
			filename: "/project/packages/demo/src/custom.ts",
			options: [{ productionThreshold: 3 }],
			errors: [{ messageId: "largeFile" }],
		},
		{
			code: customTestFile,
			filename: "/project/packages/demo/src/custom.test.ts",
			options: [{ testThreshold: 3 }],
			errors: [{ messageId: "largeFile" }],
		},
		{
			code: windowsProductionFile,
			filename: "C:\\project\\packages\\demo\\src\\windows.ts",
			errors: [{ messageId: "largeFile" }],
		},
	],
});
