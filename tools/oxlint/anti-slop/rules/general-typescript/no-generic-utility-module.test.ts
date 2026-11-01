import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noGenericUtilityModuleRule } from "./no-generic-utility-module.ts";

const tester = createRuleTester("no-generic-utility-module");

tester.run("no-generic-utility-module", noGenericUtilityModuleRule, {
	valid: [
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/src/value.ts" },
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/docs/src/utils.ts" },
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/src/utils.test.ts" },
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/src/testing/utils.ts" },
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/src/utils.ts", options: [{ bannedNames: ["helper"] }] },
	],
	invalid: [
		{
			code: "export const parseValue = () => 1;",
			filename: "/project/packages/demo/src/utils.ts",
			errors: [{ messageId: "genericUtilityModule" }],
		},
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/src/helper.ts", errors: [{ messageId: "genericUtilityModule" }] },
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/src/common.ts", errors: [{ messageId: "genericUtilityModule" }] },
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/src/manager.ts", errors: [{ messageId: "genericUtilityModule" }] },
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/src/custom.ts", options: [{ bannedNames: ["custom"] }], errors: [{ messageId: "genericUtilityModule" }] },
	],
});
