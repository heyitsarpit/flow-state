import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noExportedMutableSurfaceRule } from "./no-exported-mutable-surface.ts";

const tester = createRuleTester("no-exported-mutable-surface");

const packageSource = "/project/packages/flow-state-rewrite/src/value.ts";
const options = [{ sourceRoots: ["packages/flow-state-rewrite/src"] }];

tester.run("no-exported-mutable-surface", noExportedMutableSurfaceRule, {
  valid: [
    { code: "export const count = 1;", filename: packageSource },
    { code: "export const makeStore = () => ({ value: 1 });", filename: packageSource },
    { code: "export class Store {}", filename: packageSource },
    {
      code: "export const operations = { create() {}, update: () => {}, remove: function () {} };",
      filename: packageSource,
    },
    {
      code: "const create = () => {}; class Handler {}; export const operations = { create, Handler };",
      filename: packageSource,
    },
    {
      code: "const Diagnostic = { Defect: (cause: unknown) => cause, Failure: (value: unknown) => value, Interrupt: () => undefined } as const; export { Diagnostic };",
      filename: packageSource,
    },
    { code: "export const snapshot = Object.freeze({ value: 1 });", filename: packageSource },
    { code: "export const snapshot = Object.freeze([1, 2]);", filename: packageSource },
    { code: "export const maybeCount = ready ? 1 : 2;", filename: packageSource },
    { code: "export const result = ready && 1;", filename: packageSource },
    { code: "export const result = (sideEffect(), 1);", filename: packageSource },
    { code: "class Map {}; export const localCollection = new Map();", filename: packageSource },
    {
      code: "const snapshot = Object.freeze({ value: 1 }); export { snapshot };",
      filename: packageSource,
    },
    { code: "const { count } = { count: 1 }; export { count };", filename: packageSource },
    {
      code: "const source = { count: 1 }; const { count } = source; export { count };",
      filename: packageSource,
    },
    { code: "const [count] = [1]; export { count };", filename: packageSource },
    {
      code: "const source = [1]; const [count] = source; export { count };",
      filename: packageSource,
    },
    {
      code: "let source = 0; const alias = source; source = []; export { alias };",
      filename: packageSource,
    },
    {
      code: "let Constructor = Map; Constructor = Object; export const values = new Constructor();",
      filename: packageSource,
    },
    {
      code: "const first = second; const second = first; export { first };",
      filename: packageSource,
    },
    {
      code: "const value = {}; function make() { const local = new Map(); return local; } export { make };",
      filename: packageSource,
    },
    { code: "export { value } from './other.ts';", filename: packageSource },
    { code: "export const value = {};", filename: "/project/packages/demo/test/value.ts" },
    {
      code: "export const value = {};",
      filename: "/project/packages/demo/src/value.ts",
      options,
    },
  ],
  invalid: [
    {
      code: "export const state = {};",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export let state = 0; state = {};",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const state = ready ? {} : snapshot;",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const state = ready && [];",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const state = (ready, []);",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const mixed = { create: () => {}, state: 0 };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "let create = () => {}; create = {}; export const operations = { create };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const spread = { ...operations };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const values = [];",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const values = new Map();",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const values = new Set();",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const values = Object.freeze(new Map());",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const values = Object.freeze(new Set());",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const map = new Map(); export const values = Object.freeze(map);",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const MapConstructor = Map; export const values = new MapConstructor();",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export const values = new globalThis.Map();",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const CollectionConstructor = ready ? Map : Object; export const values = new CollectionConstructor();",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "let Constructor = Map; if (ready) Constructor = Object; export const values = new Constructor();",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "let CollectionConstructor = Set; if (ready) CollectionConstructor = Map; export const values = new CollectionConstructor();",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const state = {}; export { state };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const { values: publicValues } = { values: [] }; export { publicValues };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const source = { values: [] }; const { values: publicValues } = source; export { publicValues };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const [publicValues] = [[]]; export { publicValues };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const source = [[]]; const [publicValues] = source; export { publicValues };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "let state = 0; state = []; export { state };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "let state; state = {}; export { state };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "let state = 0; state = {}; export { state as publicState };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const values = []; export { values as publicValues };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "const state = {}; const alias = state; export { alias };",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "let alias = 0; export { alias }; alias = [];",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "let alias = 0; export { alias }; if (ready) alias = {};",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
    {
      code: "export default {};",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
  ],
});
