import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noSleepBasedTestSyncRule } from "./no-sleep-based-test-sync.ts";

const tester = createRuleTester("no-sleep-based-test-sync");
const options = [{ sourceRoots: ["packages/flow-state-rewrite/src/runtime"] }];

tester.run("no-sleep-based-test-sync", noSleepBasedTestSyncRule, {
  valid: [
    {
      code: "async function wait() { return new Promise((resolve) => resolve()); }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: 'import { Deferred, Effect } from "effect"; const wait = Deferred.make<void>(); void Effect.zip(wait, Effect.void);',
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: 'import { TestClock } from "effect/testing"; const advance = TestClock.adjust("10 millis"); void advance;',
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "const setTimeout = () => 0; setTimeout();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "const timers = { setTimeout: () => 0 }; timers.setTimeout();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "const setTimeout = () => 0; const timer = setTimeout; timer();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "const localGlobalThis = { setTimeout: () => 0 }; const timer = localGlobalThis.setTimeout; timer();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "const [timer] = [() => 0]; timer();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "let timer = setTimeout; timer = () => 0; timer();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "function run(setTimeout) { setTimeout(resolve, 10); } run(() => 0);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "const globalThis = { setTimeout: () => 0 }; globalThis.setTimeout();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "new Promise((resolve) => setTimeout(resolve, 10));",
      filename: "/project/packages/other/src/example.test.ts",
      options,
    },
    {
      code: "new Promise((resolve) => setTimeout(resolve, 10));",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.ts",
      options,
    },
    {
      code: "const localTimer = () => 0; let timer = setTimeout; timer = localTimer; const alias = timer; alias(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "const localTimer = () => 0; let timer = localTimer; const alias = timer; timer = setTimeout; alias(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
  ],
  invalid: [
    {
      code: "setTimeout(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/default.test.ts",
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "setTimeout(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "setTimeout(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/test/helpers.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "setInterval(poll, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.spec.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "await new Promise((resolve) => setTimeout(resolve, 10));",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "new Promise((resolve) => globalThis.setTimeout(resolve, 10));",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: 'window["setInterval"](poll, 10);',
      filename: "/project/packages/flow-state-rewrite/src/runtime/__tests__/polling.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "const timer = setTimeout; timer(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "let timer; timer = setTimeout; timer(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "let timer = () => 0; timer = setTimeout; timer(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "const root = globalThis; const timer = root.setInterval; timer(poll, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "const { setTimeout: timer } = globalThis; timer(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "const [timer] = [setTimeout]; timer(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "let root; root = globalThis; root.setTimeout(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "const timer = globalThis.setTimeout.bind(globalThis); timer(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/bound-timer.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "globalThis.setTimeout.call(globalThis, resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/call-timer.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "globalThis.setTimeout.apply(globalThis, [resolve, 10]);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/apply-timer.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
    {
      code: "const bind = globalThis.setTimeout.bind; const timer = bind(globalThis); timer(resolve, 10);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/detached-bind-timer.test.ts",
      options,
      errors: [{ messageId: "nativeTimer" }],
    },
  ],
});
