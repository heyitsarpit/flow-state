import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noTestModuleStateRule } from "./no-test-module-state.ts";

const tester = createRuleTester("no-test-module-state");
const options = [{ sourceRoots: ["packages/flow-state-rewrite/src"] }];

tester.run("no-test-module-state", noTestModuleStateRule, {
  valid: [
    {
      code: "const fixture = { value: 1 }; const values = [1, 2, 3];",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "function makeFixture() { let count = 0; const seen = new Set(); return { count, seen }; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "beforeEach(() => { let count = 0; const seen = new WeakSet(); void count; void seen; });",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "const identity = new WeakMap(); const provenance = new WeakSet();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/identity.test.ts",
      options,
    },
    {
      code: "const identity = new WeakMap(); identity.set({}, {}); const provenance = new WeakSet(); provenance.add({});",
      filename: "/project/packages/flow-state-rewrite/src/runtime/identity.test.ts",
      options,
    },
    {
      code: "function makeFixture() { const state = { nested: [] }; state.nested.push(1); return state; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "function makeFixture() { const state = {}; const assign = Object.assign; assign(state, { value: 1 }); return state; }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
    {
      code: "class Map {}; const values = new Map(); values.set(\"key\", 1);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/shadowed-map.test.ts",
      options,
    },
    {
      code: "class Set {}; const values = new Set(); values.add(1);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/shadowed-set.test.ts",
      options,
    },
    {
      code: "const state = makeState(); { const Object = { assign: (target: object) => target }; const assign = Object.assign; assign(state); }",
      filename: "/project/packages/flow-state-rewrite/src/runtime/shadowed-object-mutator.test.ts",
      options,
    },
    {
      code: "let count = 0; const seen = new Map();",
      filename: "/project/packages/other/src/example.test.ts",
      options,
    },
    {
      code: "let count = 0; const seen = new Map();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.ts",
      options,
    },
    {
      code: "declare let count: number; declare const seen: Map<string, string>;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
    },
  ],
  invalid: [
    {
      code: "let count = 0;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "export var attempts = 0;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const values = new Map();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const values = new Set(), refs = new Map();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = { value: 0 }; state.value = 1;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const values = []; values.push(1);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = {}; function mutate() { state.value = 1; } mutate();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = {}; const alias = state; alias.value = 1;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = {}; Object.assign(state, { value: 1 });",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'const state = {}; Object.defineProperty(state, "value", { value: 1 });',
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'const state = {}; Reflect.set(state, "value", 1);',
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = {}; function mutate() { let alias; alias = state; alias.value = 1; } mutate();",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = {}; const assign = Object.assign; assign(state, { value: 1 });",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'const state = {}; const defineProperty = Object.defineProperty; defineProperty(state, "value", { value: 1 });',
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'const state = {}; const set = Reflect.set; set(state, "value", 1);',
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = {}; const { assign } = Object; assign(state, { value: 1 });",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'const state = {}; const { defineProperty: define } = Object; define(state, "value", { value: 1 });',
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'const state = {}; const { set: reflectSet } = Reflect; reflectSet(state, "value", 1);',
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = {}; const objectApi = Object; const assign = objectApi.assign; assign(state, { value: 1 });",
      filename: "/project/packages/flow-state-rewrite/src/runtime/aliased-object-mutator.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'const state = {}; const reflectApi = Reflect; const set = reflectApi.set; set(state, "value", 1);',
      filename: "/project/packages/flow-state-rewrite/src/runtime/aliased-reflect-mutator.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = {}; globalThis.Object.assign(state, { value: 1 });",
      filename: "/project/packages/flow-state-rewrite/src/runtime/global-object-mutator.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const root = globalThis; const assign = root.Object.assign; const state = {}; assign(state, { value: 1 });",
      filename: "/project/packages/flow-state-rewrite/src/runtime/aliased-global-object-mutator.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const { Object: objectApi } = globalThis; const state = {}; objectApi.assign(state, { value: 1 });",
      filename: "/project/packages/flow-state-rewrite/src/runtime/destructured-global-object-mutator.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = condition ? {} : []; state.push(1);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/conditional-storage.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const values = new globalThis.Map(); values.set(\"key\", 1);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/global-map-storage.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const first = {}; const second = []; const state = condition ? first : second; state.push(1);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/conditional-aliased-storage.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const source = { values: [] }; const { values } = source; values.push(1);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/destructured-shared.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const state = { nested: { value: 0 } }; state.nested.value = 1;",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: "const values = [[]]; values[0].push(1);",
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
    {
      code: 'const values = new Map(); values.set("key", 1); const keys = new Set(); keys.add(1);',
      filename: "/project/packages/flow-state-rewrite/src/runtime/example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }, { messageId: "moduleState" }],
    },
    {
      code: "const values = new Map();",
      filename: "C:\\project\\packages\\flow-state-rewrite\\src\\runtime\\example.test.ts",
      options,
      errors: [{ messageId: "moduleState" }],
    },
  ],
});
