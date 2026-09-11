// Archived: superseded by anti-slop/no-unknown. Retained for historical reference; not registered.
import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnknownReturnsRule } from "./no-unknown-returns.ts";

const tester = createRuleTester("no-unknown-returns");

tester.run("no-unknown-returns-regression", noUnknownReturnsRule, {
	valid: [
		"type Promise<T> = T; function local(): Promise<unknown> { return value; }",
		"function union(): string | number { return value; }",
		"function read(): Promise<string> { return promise; }",
		"function identity<T>(): T { return value; }",
		"function read(): unknown & { id: string } { return value; }",
	],
	invalid: [
		{ code: "function direct(): unknown { return value; }", errors: [{ messageId: "unknownReturn" }] },
		{ code: "function union(): string | unknown { return value; }", errors: [{ messageId: "unknownReturn" }] },
		{ code: "const read = (): Promise<unknown> => value;", errors: [{ messageId: "unknownReturn" }] },
		{ code: "type Unknown = unknown; function read(): Unknown { return value; }", errors: [{ messageId: "unknownReturn" }] },
		{ code: "function read(): PromiseLike<unknown> { return promise; }", errors: [{ messageId: "unknownReturn" }] },
	],
});
