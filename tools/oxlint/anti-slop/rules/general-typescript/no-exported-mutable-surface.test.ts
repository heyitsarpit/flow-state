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
		{ code: "export const operations = { create() {}, update: () => {}, remove: function () {} };", filename: packageSource },
		{ code: "const create = () => {}; class Handler {}; export const operations = { create, Handler };", filename: packageSource },
		{
			code: "const Diagnostic = { Defect: (cause: unknown) => cause, Failure: (value: unknown) => value, Interrupt: () => undefined } as const; export { Diagnostic };",
			filename: packageSource,
		},
		{ code: "export const snapshot = Object.freeze({ value: 1 });", filename: packageSource },
		{ code: "export const snapshot = Object.freeze([1, 2]);", filename: packageSource },
		{ code: "const snapshot = Object.freeze({ value: 1 }); export { snapshot };", filename: packageSource },
		{ code: "const first = second; const second = first; export { first };", filename: packageSource },
		{ code: "const value = {}; function make() { const local = new Map(); return local; } export { make };", filename: packageSource },
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
			code: "export const mixed = { create: () => {}, state: 0 };",
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
			code: "const state = {}; export { state };",
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
			code: "export default {};",
      filename: packageSource,
      errors: [{ messageId: "exportedMutableSurface" }],
    },
  ],
});
