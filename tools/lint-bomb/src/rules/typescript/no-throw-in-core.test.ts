import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noThrowInCoreRule } from "./no-throw-in-core.ts";

const tester = createRuleTester("no-throw-in-core");
const options = [{ defects: ["Defect", "unreachable"] }];

tester.run("no-throw-in-core", noThrowInCoreRule, {
	valid: [
		{ code: "const f = () => { throw new Defect('lane lost its head'); };", options },
		{ code: "const f = (x: never) => { throw unreachable(x); };", options },
		{ code: "const f = () => { throw new Errors.Defect('x'); };", options },
		{ code: "const f = () => Result.fail(new Refused({ reason: 'quota' }));", options },
	],
	invalid: [
		{ code: "const f = () => { throw new Error('quota'); };", options, errors: [{ messageId: "throw" }] },
		{ code: "const f = (e: Refused) => { throw e; };", options, errors: [{ messageId: "throw" }] },
		{ code: "const f = () => { throw new Defect('x'); };", errors: [{ messageId: "throw" }] },
	],
});
