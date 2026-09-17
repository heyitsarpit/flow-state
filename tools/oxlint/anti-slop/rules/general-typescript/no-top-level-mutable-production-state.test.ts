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
      code: "class Map {}; const values = new Map(); values.set(\"key\", 1);",
      filename: "/project/packages/demo/src/shadowed-map.ts",
    },
    {
      code: "class Set {}; const values = new Set(); values.add(1);",
      filename: "/project/packages/demo/src/shadowed-set.ts",
    },
    {
      code: "function makeState() { const state = { nested: [] }; state.nested.push(1); return state; }",
      filename: "/project/packages/demo/src/value.ts",
    },
    {
      code: "const values = []; values.push(1);",
      filename: "/project/packages/demo/src/value.ts",
    },
    {
      code: "class Map {}; const cache = ready ? new Map() : {};",
      filename: "/project/packages/demo/src/conditional-shadowed-map.ts",
    },
    {
      code: "const cache = ready ? new WeakMap() : new WeakSet();",
      filename: "/project/packages/demo/src/conditional-weak-storage.ts",
    },
    {
      code: "function makeCache() { let Constructor = Map; Constructor = Object; return new Constructor(); }",
      filename: "/project/packages/demo/src/reassigned-constructor.ts",
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
    {
      code: "let value = 1;",
      filename: "/project/packages/flow-state/src/value.ts",
      options: [{ sourceRoots: ["packages/flow-state-rewrite/src"] }],
    },
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
      code: "const state = {}; const assign = Object.assign; function mutate() { assign(state, { value: 1 }); } mutate();",
      filename: "/project/packages/demo/src/aliased-object-mutator.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const root = globalThis; const assign = root.Object.assign; const state = {}; function mutate() { assign(state, { value: 1 }); } mutate();",
      filename: "/project/packages/demo/src/aliased-global-object-mutator.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const cache = ready ? new Map() : new Set();",
      filename: "/project/packages/demo/src/conditional-mutable-storage.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const cache = new globalThis.Map();",
      filename: "/project/packages/demo/src/global-map-storage.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const Constructor = Map; const cache = new Constructor();",
      filename: "/project/packages/demo/src/aliased-map-storage.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const Constructor = ready ? Map : Object; const cache = new Constructor();",
      filename: "/project/packages/demo/src/conditional-constructor-storage.ts",
      errors: [{ messageId: "topLevelMutable" }],
    },
    {
      code: "const first = {}; const second = []; const state = condition ? first : second; function mutate() { state.push(1); } mutate();",
      filename: "/project/packages/demo/src/conditional-aliased-storage.ts",
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
    {
      code: "let value = 1;",
      filename: "/project/packages/flow-state-rewrite/src/value.ts",
      options: [{ sourceRoots: ["packages/flow-state-rewrite/src"] }],
      errors: [{ messageId: "topLevelMutable" }],
    },
  ],
});
