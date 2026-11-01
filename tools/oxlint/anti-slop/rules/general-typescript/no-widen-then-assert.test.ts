import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noWidenThenAssertRule } from "./no-widen-then-assert.ts";

const tester = createRuleTester("no-widen-then-assert");

tester.run("no-widen-then-assert-regression", noWidenThenAssertRule, {
	valid: [
		"const value = input as DomainValue;",
		"const precise: { id: string } = { id: \"x\" }; const value = precise as { id: string };",
		"const value = input as Record<string, string>;",
		"const erased: unknown = getInput(); const value = erased as DomainValue;",
		"let erased: unknown = { id: \"x\" }; const value = erased as DomainValue;",
		"const erased: unknown = { id: \"erased\" }; const value = erased as DomainValue;",
		"const erased: Record<string, unknown> = { id: \"x\" }; const value = erased as Record<string, string>;",
	],
	invalid: [
		{ code: "const erased: any = { id: \"x\" }; const value = erased as { id: string };", errors: [{ messageId: "widenThenAssert" }] },
		{ code: "const erased: object = { id: \"x\" }; const value = erased as { id: string };", errors: [{ messageId: "widenThenAssert" }] },
	],
});
