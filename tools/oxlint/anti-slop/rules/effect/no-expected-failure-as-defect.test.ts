import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noExpectedFailureAsDefectRule } from "./no-expected-failure-as-defect.ts";

const tester = createRuleTester("no-expected-failure-as-defect");

tester.run("no-expected-failure-as-defect", noExpectedFailureAsDefectRule, {
	valid: [
		'import { Effect } from "effect"; Effect.fail(mailboxAdmissionFailure("closed"));',
		'import { Effect } from "effect"; Effect.die(new Error("invariant"));',
		'import { Effect } from "effect"; Effect.sync(() => { throw new Error("foreign callback"); });',
		'import { Effect } from "effect"; const failure: Error = getFailure(); Effect.die(failure);',
		'import { Effect } from "effect"; const failure: DomainError = getFailure(); Effect.sync(() => { throw failure; });',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.die(mailboxAdmissionFailure("closed"));',
			errors: [{ messageId: "defect" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.sync(() => { throw diagnostic; });',
			errors: [{ messageId: "defect" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.sync(() => { if (closed) { throw diagnostic; } });',
			errors: [{ messageId: "defect" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.die(undefined);',
			errors: [{ messageId: "defect" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.sync(() => { throw "closed"; });',
			errors: [{ messageId: "defect" }],
		},
	],
});
