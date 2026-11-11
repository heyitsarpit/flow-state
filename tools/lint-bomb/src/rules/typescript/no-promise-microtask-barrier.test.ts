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
		{ code: "async function flush() { const ready = await Promise.resolve().then(() => 'ready'); return ready; }", filename: "/project/src/flush.test.ts" },
		{ code: "const undefined = 'ready'; async function flush() { await Promise.resolve().then(() => undefined); }", filename: "/project/src/flush.test.ts" },
		{ code: "async function flush() { await Promise.resolve().then(() => record()); }", filename: "/project/src/flush.test.ts" },
		{ code: "async function flush() { await Promise.resolve().then(async () => { await ready; }); }", filename: "/project/src/flush.test.ts" },
		{ code: "async function flush() { await Promise.resolve().then(() => { return ready; }); }", filename: "/project/src/flush.test.ts" },
		{ code: "const undefined = () => record(); async function flush() { await Promise.resolve().then(undefined); }", filename: "/project/src/flush.test.ts" },
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
		{
			code: "async function flush() { await Promise.resolve().then(() => undefined); }",
			filename: "/project/src/flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve().then(() => {}); }",
			filename: "/project/src/flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve().then(undefined); }",
			filename: "/project/src/flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve().then(null); }",
			filename: "/project/src/flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve().then(void 0); }",
			filename: "/project/src/flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve().then(() => { return; }); }",
			filename: "/project/src/flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve().then(function () {}); }",
			filename: "/project/src/flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
		{
			code: "async function flush() { await Promise.resolve().then(function () { return; }); }",
			filename: "/project/src/flush.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
	],
});

tester.run("no-promise-microtask-barrier-round3", noPromiseMicrotaskBarrierRule, {
  "valid": [
    {
      "code": "async function run() { await Promise[\"resolve\"](1); }",
      "filename": "/project/src/value.test.ts"
    },
    {
      "code": "async function run(Promise) { await Promise[\"resolve\"](); }",
      "filename": "/project/src/value.test.ts"
    },
    {
      "code": "async function run() { await Promise.resolve()[\"then\"](() => work()); }",
      "filename": "/project/src/value.test.ts"
    }
  ],
  "invalid": [
    {
      "code": "async function run() { await Promise[\"resolve\"](); }",
      "errors": [
        {
          "messageId": "microtaskBarrier"
        }
      ],
      "filename": "/project/src/value.test.ts"
    },
    {
      "code": "async function run() { await Promise.resolve()[\"then\"](() => {}); }",
      "errors": [
        {
          "messageId": "microtaskBarrier"
        }
      ],
      "filename": "/project/src/value.test.ts"
    }
  ]
});
