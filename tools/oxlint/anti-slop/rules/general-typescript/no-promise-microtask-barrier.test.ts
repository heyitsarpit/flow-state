import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noPromiseMicrotaskBarrierRule } from "./no-promise-microtask-barrier.ts";

const tester = createRuleTester("no-promise-microtask-barrier");

tester.run("no-promise-microtask-barrier", noPromiseMicrotaskBarrierRule, {
	valid: [
		{ code: "async function flush() { await Promise.resolve(1); }", filename: "/project/src/example.test.ts" },
		{ code: "async function flush() { await Promise.resolve(); }", filename: "/project/src/domain.ts" },
		{ code: "async function flush(Promise: PromiseConstructor) { await Promise.resolve(); }", filename: "/project/src/example.test.ts" },
		{ code: "async function flush() { const tick = await Promise.resolve(); return tick; }", filename: "/project/src/flush.test.ts" },
		{ code: "async function flush(value: string) { await Promise.resolve(value); }", filename: "/project/src/flush.test.ts" },
	],
	invalid: [
		{
			code: "async function flush() { await Promise.resolve(); }",
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve(); }",
			filename: "/project/src/flush.spec.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve(); }",
			filename: "/project/src/__tests__/flush.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve(); }",
			filename: "C:\\project\\src\\flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { if (ready) await Promise.resolve(); }",
			filename: "/project/src/flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
	],
});
