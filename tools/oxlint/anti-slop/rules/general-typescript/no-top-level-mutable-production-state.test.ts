import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noTopLevelMutableProductionStateRule } from "./no-top-level-mutable-production-state.ts";

const tester = createRuleTester("no-top-level-mutable-production-state");

tester.run("no-top-level-mutable-production-state", noTopLevelMutableProductionStateRule, {
  valid: [
    { code: "const value = 1;", filename: "/project/packages/demo/src/value.ts" },
    {
      code: "const snapshot = { value: 1 }; const values = [1, 2, 3];",
      filename: "/project/packages/demo/src/value.ts",
    },
    {
      code: "function makeRegistry() { const cache = new Map(); const keys = new Set(); return { cache, keys }; }",
      filename: "/project/packages/demo/src/value.ts",
    },
    {
      code: "const identity = new WeakMap(); const provenance = new WeakSet();",
      filename: "/project/packages/demo/src/value.ts",
    },
    {
      code: "const identity = new WeakMap(); identity.set({}, {}); const provenance = new WeakSet(); provenance.add({});",
      filename: "/project/packages/demo/src/value.ts",
    },
    {
      code: "function makeState() { const state = { nested: [] }; state.nested.push(1); return state; }",
      filename: "/project/packages/demo/src/value.ts",
    },
    {
      code: "const values = []; values.push(1);",
      filename: "/project/packages/demo/src/value.ts",
    },
    { code: "let value = 1;", filename: "/project/packages/demo/src/value.test.ts" },
    {
      code: "declare let externalValue: number;",
      filename: "/project/packages/demo/src/value.d.ts",
    },
    {
      code: "function make() { let value = 1; return value; }",
      filename: "/project/packages/demo/src/value.ts",
    },
    { code: "let value = 1;", filename: "/project/src/value.ts" },
  ],
  invalid: [
    {
      code: "let value = 1;",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "var cache = new Map();",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "export let revision = 0;",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const cache = new Map();",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const state = {}; function mutate() { state.value = 1; } mutate();",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const state = {}; const alias = state; function mutate() { alias.value = 1; } mutate();",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: 'const state = {}; function mutate() { Reflect.set(state, "value", 1); } mutate();',
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const state = {}; function mutate() { Object.assign(state, { value: 1 }); } mutate();",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: 'const state = {}; function mutate() { Object.defineProperty(state, "value", { value: 1 }); } mutate();',
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const state = { nested: { value: 0 } }; function mutate() { state.nested.value = 1; } mutate();",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const values = [[]]; function mutate() { values[0].push(1); } mutate();",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: 'const values = new Map(); values.set("key", 1); const keys = new Set(); keys.add(1);',
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }, { messageId: "topLevelMutable" }],
    },
    {
      code: "export const registry = new Set();",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "export const registry = Object.freeze(new Map());",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "let first = 1, second = 2;",
      filename: "/project/packages/demo/src/value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: 'let state = "idle";',
      filename: "C:\\project\\packages\\demo\\src\\value.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
  ],
});
