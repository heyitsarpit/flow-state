import { RuleTester } from "oxlint/plugins-dev";
import { readFileSync } from "node:fs";

import { noArrayFromThenMapRule } from "./rules/no-array-from-then-map.ts";
import { noBivariantCallbackRule } from "./rules/no-bivariant-callback.ts";
import { noChainedTypeAssertionsRule } from "./rules/no-chained-type-assertions.ts";
import { noConditionalEmptyObjectSpreadRule } from "./rules/no-conditional-empty-object-spread.ts";
import { noConditionalSingletonArraySpreadRule } from "./rules/no-conditional-singleton-array-spread.ts";
import { noContextTagRule } from "./rules/no-context-tag.ts";
import { noDataTaggedErrorRule } from "./rules/no-data-taggederror.ts";
import { noAnonymousDefaultExportRule } from "./rules/no-anonymous-default-export.ts";
import { noDirectProcessEnvRule } from "./rules/no-direct-process-env.ts";
import { noEffectPromiseRule } from "./rules/no-effect-promise.ts";
import { noEffectPromiseMicrotaskRule } from "./rules/no-effect-promise-microtask.ts";
import { noEffectRunnerInDomainRule } from "./rules/no-effect-runner-in-domain.ts";
import { noEffectRefReadThenWriteRule } from "./rules/no-effect-ref-read-then-write.ts";
import { noExcessiveCognitiveComplexityRule } from "./rules/no-excessive-cognitive-complexity.ts";
import { noEscapeHatchAssertionRule } from "./rules/no-escape-hatch-assertion.ts";
import { noExplicitAnyRule } from "./rules/no-explicit-any.ts";
import { noExpectInIfRule } from "./rules/no-expect-in-if.ts";
import { noForEachRule } from "./rules/no-for-each.ts";
import { noGenericUtilityModuleRule } from "./rules/no-generic-utility-module.ts";
import { noGodServiceShapeRule } from "./rules/no-god-service-shape.ts";
import { noImplicitEffectConcurrencyRule } from "./rules/no-implicit-effect-concurrency.ts";
import { noInwardModuleDependencyRule } from "./rules/no-inward-module-dependency.ts";
import { noInlineImportTypeQueryRule } from "./rules/no-inline-import-type-query.ts";
import { noKnownValueWideningRule } from "./rules/no-known-value-widening.ts";
import { noLocalDefiniteAssignmentRule } from "./rules/no-local-definite-assignment.ts";
import { noLargeProductionFileRule } from "./rules/no-large-production-file.ts";
import { noModuleMockingRule } from "./rules/no-module-mocking.ts";
import { noNumericDurationRule } from "./rules/no-numeric-duration.ts";
import { noNestedConditionalExpressionRule } from "./rules/no-nested-conditional-expression.ts";
import { noNullishFunctionContractsRule } from "./rules/no-nullish-function-contracts.ts";
import { noObjectFreezeRule } from "./rules/no-object-freeze.ts";
import { noObjectParametersRule } from "./rules/no-object-parameters.ts";
import { noOptionalDomainPropertiesRule } from "./rules/no-optional-domain-properties.ts";
import { noPackageDistOrSelfImportInSrcRule } from "./rules/no-package-dist-or-self-import-in-src.ts";
import { noPromiseMicrotaskBarrierRule } from "./rules/no-promise-microtask-barrier.ts";
import { noPureEffectWrapperRule } from "./rules/no-pure-effect-wrapper.ts";
import { noPublicEntrypointExportDriftRule } from "./rules/no-public-entrypoint-export-drift.ts";
import { noRawTryCatchRule } from "./rules/no-raw-try-catch.ts";
import { noRedundantReadonlyWrapperRule } from "./rules/no-redundant-readonly-wrapper.ts";
import { noShallowJsonDomainCastRule } from "./rules/no-shallow-json-domain-cast.ts";
import { noServiceShapeParameterExtractionRule } from "./rules/no-service-shape-parameter-extraction.ts";
import { noStagedObjectAssignRule } from "./rules/no-staged-object-assign.ts";
import { noSwallowedCleanupErrorRule } from "./rules/no-swallowed-cleanup-error.ts";
import { noTernaryIifeRule } from "./rules/no-ternary-iife.ts";
import { noTopLevelMutableProductionStateRule } from "./rules/no-top-level-mutable-production-state.ts";
import { noThrowInEffectGenRule } from "./rules/no-throw-in-effect-gen.ts";
import { noUnmanagedEffectScopeRule } from "./rules/no-unmanaged-effect-scope.ts";
import { noUnsafeFiberMethodsRule } from "./rules/no-unsafe-fiber-methods.ts";
import { noUnwrappedPromiseInEffectCoreRule } from "./rules/no-unwrapped-promise-in-effect-core.ts";
import { noUnknownParametersRule } from "./rules/no-unknown-parameters.ts";
import { noUnknownReturnsRule } from "./rules/no-unknown-returns.ts";
import { noUnknownTypeAliasesRule } from "./rules/no-unknown-type-aliases.ts";
import { noUnsafeDictionaryTypeRule } from "./rules/no-unsafe-dictionary-type.ts";
import { noRuntimeTypeofRule } from "./rules/no-runtime-typeof.ts";
import { noReflectApplyRule } from "./rules/no-reflect-apply.ts";
import { noReflectGetRule } from "./rules/no-reflect-get.ts";
import { noForbiddenTermInSymbolNamesRule } from "./rules/no-shape-in-symbol-names.ts";
import { noWidenThenAssertRule } from "./rules/no-widen-then-assert.ts";
import { requireSafetyCommentForTypeAssertionRule } from "./rules/require-safety-comment-for-type-assertion.ts";
import { useConsistentTypeDefinitionsRule } from "./rules/use-consistent-type-definitions.ts";
import { useExportTypeRule } from "./rules/use-export-type.ts";
import { useImportTypeRule } from "./rules/use-import-type.ts";

RuleTester.describe = (_name, callback) => callback();
RuleTester.it = (name, callback) => {
	try {
		callback();
	} catch (error) {
		console.error(`failed: ${name}`);
		throw error;
	}
};

const tester = new RuleTester({
	cwd: process.cwd(),
	languageOptions: { sourceType: "module", parserOptions: { lang: "ts" } },
});

tester.run("no-excessive-cognitive-complexity", noExcessiveCognitiveComplexityRule, {
	valid: [
		"function simple(value) { if (value) return 1; return 0; }",
		"function nested(value, first, second) { if (value) { if (first) { if (second) return 1; } } return 0; }",
	],
	invalid: [
		{
			code: "function manyBranches(value) { if (value) return 1; if (value) return 2; if (value) return 3; if (value) return 4; if (value) return 5; if (value) return 6; if (value) return 7; if (value) return 8; if (value) return 9; if (value) return 10; if (value) return 11; if (value) return 12; if (value) return 13; if (value) return 14; if (value) return 15; if (value) return 16; return 0; }",
			errors: [{ messageId: "complexity" }],
		},
	],
});

tester.run("no-for-each", noForEachRule, {
	valid: [
		"const values = items.map((item) => item.id);",
		"for (const item of items) consume(item);",
		'import { Effect } from "effect"; Effect.forEach(items, run, { concurrency: 1 });',
		'import { Effect as E } from "effect"; E["forEach"](items, run, { concurrency: 1 });',
	],
	invalid: [
		{
			code: "items.forEach((item) => consume(item));",
			errors: [{ messageId: "forEach" }],
		},
		{
			code: "items.forEach((item) => item);",
			errors: [{ messageId: "forEach" }],
		},
		{
			code: 'items["forEach"]((item) => item);',
			errors: [{ messageId: "forEach" }],
		},
	],
});

tester.run("no-top-level-mutable-production-state", noTopLevelMutableProductionStateRule, {
	valid: [
		{ code: "const value = 1;", filename: "/project/packages/demo/src/value.ts" },
		{ code: "let value = 1;", filename: "/project/packages/demo/src/value.test.ts" },
		{ code: "declare let externalValue: number;", filename: "/project/packages/demo/src/value.d.ts" },
	],
	invalid: [
		{
			code: "let value = 1;",
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "topLevelMutable" }],
		},
	],
});

tester.run("no-inward-module-dependency", noInwardModuleDependencyRule, {
	valid: [
		{
			code: 'import { value } from "../api/value.js"; void value;',
			filename: "/project/packages/flow-state/src/core/value.ts",
		},
		{
			code: 'import { value } from "../internal/value.js"; void value;',
			filename: "/project/packages/flow-state-rewrite/src/internal/scaffold.ts",
			options: [
				{
					profiles: [
						{
							sourceRoot: "packages/flow-state-rewrite/src/internal",
							forbiddenRoots: ["packages/flow-state-rewrite/src/public"],
						},
					],
				},
			],
		},
	],
	invalid: [
		{
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "/project/packages/flow-state/src/core/value.ts",
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "C:\\project\\packages\\flow-state\\src\\core\\value.ts",
			options: [{ sourceRoot: "packages/flow-state/src/core", forbiddenRoots: ["packages/flow-state/src/cli"] }],
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { root } from "../index.js"; void root;',
			filename: "/project/packages/flow-state/src/core/value.ts",
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { run } from "../cli/run.js"; void run;',
			filename: "C:\\project\\packages\\flow-state\\src\\core\\value.ts",
			errors: [{ messageId: "inwardDependency" }],
		},
		{
			code: 'import { root } from "../public/root.js"; void root;',
			filename: "/project/packages/flow-state-rewrite/src/internal/scaffold.ts",
			options: [
				{
					profiles: [
						{
							sourceRoot: "packages/flow-state-rewrite/src/internal",
							forbiddenRoots: ["packages/flow-state-rewrite/src/public"],
						},
					],
				},
			],
			errors: [{ messageId: "inwardDependency" }],
		},
	],
});

tester.run("no-direct-process-env", noDirectProcessEnvRule, {
	valid: [
		{ code: "const value = process.env.VALUE;", filename: "/project/packages/flow-state/src/cli/main.ts" },
		{ code: "const value = process.env.VALUE;", filename: "/project/packages/flow-state/src/value.test.ts" },
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state-rewrite/src/host/root.ts",
			options: [{ sourceRoots: ["packages/flow-state-rewrite/src"] }],
		},
	],
	invalid: [
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: "const value = process.env.VALUE;",
			filename: "/project/packages/flow-state-rewrite/src/internal/scaffold.ts",
			options: [{ sourceRoots: ["packages/flow-state-rewrite/src"] }],
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const value = globalThis["process"]["env"].VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
		{
			code: 'const p = process; const value = p.env.VALUE;',
			filename: "/project/packages/flow-state/src/value.ts",
			errors: [{ messageId: "processEnv" }],
		},
	],
});

tester.run("no-anonymous-default-export", noAnonymousDefaultExportRule, {
	valid: [
		{ code: "const value = 1; export default value;", filename: "/project/packages/demo/src/value.ts" },
		{ code: "export default function named() {}", filename: "/project/packages/demo/src/value.ts" },
		{ code: "export default (function namedExpression() {})", filename: "/project/packages/demo/src/value.ts" },
		{ code: "export default (class NamedClass {})", filename: "/project/packages/demo/src/value.ts" },
	],
	invalid: [
		{
			code: "export default () => 1;",
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "anonymousDefault" }],
		},
	],
});

tester.run("no-generic-utility-module", noGenericUtilityModuleRule, {
	valid: [
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/src/value.ts" },
		{ code: "export const parseValue = () => 1;", filename: "/project/packages/demo/docs/src/utils.ts" },
	],
	invalid: [
		{
			code: "export const parseValue = () => 1;",
			filename: "/project/packages/demo/src/utils.ts",
			errors: [{ messageId: "genericUtilityModule" }],
		},
	],
});

tester.run("no-pure-effect-wrapper", noPureEffectWrapperRule, {
	valid: [
		'import { Effect } from "effect"; Effect.succeed(load());',
		{ code: 'import { Effect } from "effect"; Effect.succeed(value);', filename: "/project/packages/demo/docs/src/value.ts" },
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; const value = 1; Effect.succeed(value);',
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "pureEffectWrapper" }],
		},
	],
});

tester.run("no-god-service-shape", noGodServiceShapeRule, {
	valid: [{ code: "interface SmallService { one(): void; two(): void; }", filename: "/project/packages/demo/src/service.ts" }],
	invalid: [
		{
			code: "interface LargeService { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }",
			filename: "/project/packages/demo/src/service.ts",
			errors: [{ messageId: "godServiceShape" }],
		},
		{
			code: "interface DerivedService extends BaseService { three(): void; } interface BaseService { one(): void; two(): void; }",
			filename: "/project/packages/demo/src/service.ts",
			options: [{ threshold: 2 }],
			errors: [{ messageId: "godServiceShape" }],
		},
		{
			code: "type WrappedService = Readonly<{ one(): void; two(): void; three(): void; }>;",
			filename: "/project/packages/demo/src/service.ts",
			options: [{ threshold: 2 }],
			errors: [{ messageId: "godServiceShape" }],
		},
	],
});

const largeProductionFile = Array.from({ length: 501 }, (_, index) => `const value${index} = ${index};`).join("\n");
const largeTestFile = Array.from({ length: 1001 }, (_, index) => `const testValue${index} = ${index};`).join("\n");
tester.run("no-large-production-file", noLargeProductionFileRule, {
	valid: [
		{ code: "const value = 1;", filename: "/project/packages/demo/src/value.ts" },
		{
			code: Array.from({ length: 1000 }, (_, index) => `const testValue${index} = ${index};`).join("\n"),
			filename: "/project/packages/demo/src/value.test.ts",
		},
		{
			code: Array.from({ length: 500 }, (_, index) => `const value${index} = ${index};`).join("\n") + "\n",
			filename: "/project/packages/demo/src/value.ts",
		},
		{
			code: Array.from({ length: 500 }, (_, index) => `const value${index} = ${index};`).join("\n") + "\n\n",
			filename: "/project/packages/demo/src/value.ts",
		},
		{
			code: Array.from({ length: 1001 }, (_, index) => `declare const value${index}: string;`).join("\n"),
			filename: "/project/packages/demo/src/types.d.ts",
		},
	],
	invalid: [
		{
			code: largeProductionFile,
			filename: "/project/packages/demo/src/value.ts",
			errors: [{ messageId: "largeFile" }],
		},
		{
			code: largeTestFile,
			filename: "/project/packages/demo/src/value.test.ts",
			errors: [{ messageId: "largeFile" }],
		},
	],
});

tester.run("use-import-type", useImportTypeRule, {
	valid: [
		'import type { Value } from "./types.js"; type Result = Value;',
		'import { value } from "./values.js"; void value;',
	],
	invalid: [
		{
			code: 'import { Value } from "./types.js"; type Result = Value;',
			errors: [{ messageId: "importType" }],
		},
	],
});

tester.run("use-export-type", useExportTypeRule, {
	valid: [
		"type Value = string; export type { Value };",
		"const value = 1; export { value };",
	],
	invalid: [
		{
			code: "type Value = string; export { Value };",
			errors: [{ messageId: "exportType" }],
		},
	],
});

tester.run("use-consistent-type-definitions", useConsistentTypeDefinitionsRule, {
	valid: [
		"type Value = { value: string };",
	],
	invalid: [
		{
			code: "interface Value { value: string }",
			errors: [{ messageId: "preferType" }],
		},
	],
});

tester.run("no-inline-import-type-query", noInlineImportTypeQueryRule, {
	valid: [
		'import type { FlowResourceSnapshot } from "../api/types.js"; type Snapshot = FlowResourceSnapshot;',
		{
			code: 'type Snapshot = import("../api/types.js").FlowResourceSnapshot;',
			filename: "/project/types.d.ts",
		},
		{
			code: 'type Snapshot = import("../api/types.js").FlowResourceSnapshot;',
			filename: "/project/src/generated/api.ts",
		},
	],
	invalid: [
		{
			code: 'type Snapshot = import("../api/types.js").FlowResourceSnapshot;',
			filename: "/project/src/domain.ts",
			errors: [{ messageId: "inlineImportType" }],
		},
	],
});

tester.run("no-conditional-singleton-array-spread", noConditionalSingletonArraySpreadRule, {
	valid: [
		"const values = [...(first ? [one] : [])];",
		"const values = [...(first ? [one, two] : []), ...(second ? [three] : [])];",
		"const values = [...(first ? [...items] : []), ...(second ? [three] : [])];",
		"const values = [...items, ...(second ? [three] : [])];",
	],
	invalid: [
		{
			code: "const values = [...(first ? [one] : []), ...(second ? [] : [two])];",
			errors: [{ messageId: "conditionalSingletonSpreads" }],
		},
		{
			code: "const values = [...(first ? [one] : []), ...items, ...(second ? [] : [two])];",
			errors: [{ messageId: "conditionalSingletonSpreads" }],
		},
	],
});

tester.run("no-ternary-iife", noTernaryIifeRule, {
	valid: [
		"const value = enabled ? buildValue() : fallback();",
		"const value = enabled ? namedFunction() : otherValue;",
	],
	invalid: [
		{
			code: "const value = enabled ? (() => buildValue())() : fallback;",
			errors: [{ messageId: "ternaryIife" }],
		},
		{
			code: "const value = enabled ? fallback : (function () { return buildValue(); })();",
			errors: [{ messageId: "ternaryIife" }],
		},
	],
});

tester.run("no-array-from-then-map", noArrayFromThenMapRule, {
	valid: [
		"const values = Array.from(iterable, callback);",
		"const values = Array.from(iterable, callback).map(otherCallback);",
		"const values = iterable.map(callback);",
		"const copied = Array.from(iterable); const values = copied.map(callback);",
		"function convert(Array) { return Array.from(iterable).map(callback); }",
	],
	invalid: [
		{
			code: "const values = Array.from(iterable).map(callback);",
			errors: [{ messageId: "arrayFromThenMap" }],
		},
		{
			code: "const values = (Array.from(iterable)).map(callback);",
			errors: [{ messageId: "arrayFromThenMap" }],
		},
	],
});

tester.run("no-staged-object-assign", noStagedObjectAssignRule, {
	valid: [
		"const value = Object.assign({}, first, second);",
		"const value = Object.assign({}, first); const result = Object.assign({}, value, second);",
		"const value = {}; Object.assign(value, first);",
		"const Object = { assign: Object.assign }; const value = Object.assign({}, first); Object.assign(value, second);",
		"let value = Object.assign({}, first); value = replacement; Object.assign(value, second);",
	],
	invalid: [
		{
			code: "function create() { const value = Object.assign({ kind: 'module' }, inventory); return Object.assign(value, { summary }); }",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
		{
			code: "let value = Object.assign({}, first); Object.assign(value, second);",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
		{
			code: "const value = Object.assign({}, first) as Value; Object.assign(value, second);",
			errors: [{ messageId: "stagedObjectAssign" }],
		},
	],
});

tester.run("no-nested-conditional-expression", noNestedConditionalExpressionRule, {
	valid: [
		"const value = enabled ? first : second;",
		"const value = (enabled ? first : second) ? one : two;",
	],
	invalid: [
		{
			code: "const value = enabled ? first ? one : two : fallback;",
			errors: [{ messageId: "nestedConditional" }],
		},
		{
			code: "const value = enabled ? first : fallback ? one : two;",
			errors: [{ messageId: "nestedConditional" }],
		},
		{
			code: "const value = enabled ? choose(first ? one : two) : fallback;",
			errors: [{ messageId: "nestedConditional" }],
		},
	],
});

tester.run("no-package-dist-or-self-import-in-src", noPackageDistOrSelfImportInSrcRule, {
	valid: [
		{
			code: 'import { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
		{
			code: 'import * as flow from "flow-state";',
			filename: "/project/packages/flow-state/scripts/check-packed-consumers.mjs",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
		{
			code: 'export { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
		{
			code: 'await import("flow-state");',
			filename: "/project/packages/flow-state/scripts/check-packed-consumers.mjs",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
		{
			code: 'import { value } from "../src2/value.js"; void value;',
			filename: "C:\\project\\packages\\flow-state\\src\\cli\\trace-input.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
		},
	],
	invalid: [
		{
			code: 'import * as flow from "flow-state";',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "selfImport" }],
		},
		{
			code: 'import { captureTrace } from "../dist/inspect.mjs";',
			filename: "/project/packages/flow-state/src/cli/trace-input.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "distImport" }],
		},
		{
			code: 'export * from "flow-state/testing";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "selfImport" }],
		},
		{
			code: 'await import("flow-state/inspect");',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "selfImport" }],
		},
		{
			code: 'import { captureTrace } from "../DIST/inspect.mjs"; void captureTrace;',
			filename: "C:\\project\\packages\\flow-state\\src\\cli\\trace-input.ts",
			options: [{ packageName: "flow-state", sourceRoot: "packages/flow-state/src" }],
			errors: [{ messageId: "distImport" }],
		},
	],
});

tester.run("no-public-entrypoint-export-drift", noPublicEntrypointExportDriftRule, {
	valid: [
		{
			code: 'export { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'export * from "./core/api/types.js";',
			filename: "/project/packages/flow-state/src/core/api/types.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
		{
			code: 'import { createKey } from "./core/api/keys.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
		},
	],
	invalid: [
		{
			code: 'export * from "./core/api/types.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "starReExport" }],
		},
		{
			code: 'import { test } from "./testing.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'export { withRequestRuntime } from "./server.js";',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'await import("./testing.js");',
			filename: "C:\\project\\packages\\flow-state\\src\\index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "testing.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'await import("./testing.js");',
			filename: "/project/packages/flow-state/src/index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
		{
			code: 'import { test } from "./testing.js";',
			filename: "C:\\project\\packages\\flow-state\\src\\index.ts",
			options: [{ sourceRoot: "packages/flow-state/src", entrypoints: ["index.ts", "react-entry.ts", "testing.ts", "server.ts", "inspect.ts"] }],
			errors: [{ messageId: "crossEntrypoint" }],
		},
	],
});

tester.run("no-bivariant-callback", noBivariantCallbackRule, {
	valid: [
		"type Callback = (value: string) => number;",
		{ code: 'type Callback<A, B> = { bivarianceHack(args: A): B }["bivarianceHack"];', filename: "/project/types.d.ts" },
	],
	invalid: [
		{
			code: 'type Callback<A, B> = { bivarianceHack(args: A): B }["bivarianceHack"];',
			errors: [{ messageId: "bivariantCallback" }],
		},
	],
});

tester.run("no-effect-promise-microtask", noEffectPromiseMicrotaskRule, {
	valid: [
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise(() => Promise.resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => Promise.resolve());',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
		},
		{
			code: 'import { Effect } from "effect"; Promise.resolve();',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => Promise.resolve());',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promiseMicrotask" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => { return Promise.resolve(); });',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promiseMicrotask" }],
		},
	],
});

tester.run("no-context-tag", noContextTagRule, {
	valid: [
		'import { Context } from "effect"; Context.Service;',
		'import { Context as C } from "effect"; C.Service("Service");',
	],
	invalid: [
		{
			code: 'import { Context } from "effect"; Context.Tag("Service");',
			errors: [{ messageId: "v3Service" }],
		},
		{
			code: 'import { Context } from "effect"; Context.GenericTag("Service");',
			errors: [{ messageId: "v3Service" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.Service("Service");',
			errors: [{ messageId: "v3Service" }],
		},
		{
			code: 'import { Context as C, Effect as E } from "effect"; C["Tag"]("Service"); E["Service"]("Service");',
			errors: [{ messageId: "v3Service" }, { messageId: "v3Service" }],
		},
	],
});

tester.run("no-data-taggederror", noDataTaggedErrorRule, {
	valid: ['import { Schema } from "effect"; Schema.TaggedErrorClass("Error");'],
	invalid: [
		{
			code: 'import { Data } from "effect"; Data.TaggedError("Error");',
			errors: [{ messageId: "taggedError" }],
		},
		{
			code: 'import { Data as D } from "effect"; D["TaggedError"]("Error");',
			errors: [{ messageId: "taggedError" }],
		},
	],
});

tester.run("no-effect-promise", noEffectPromiseRule, {
	valid: [
		'import { Effect } from "effect"; Effect.tryPromise({ try: () => Promise.resolve(1), catch: String });',
		'import { Effect } from "effect"; Effect.tryPromise(({ try: makeRequest, catch: String }));',
		'import { Effect as E } from "effect"; E.tryPromise({ try: makeRequest, catch: String });',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise(() => Promise.resolve(1));',
			errors: [{ messageId: "tryPromise" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise(makeRequest);',
			errors: [{ messageId: "tryPromise" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise({ try: makeRequest, catch: undefined });',
			errors: [{ messageId: "tryPromise" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise({ try: makeRequest });',
			errors: [{ messageId: "tryPromise" }],
		},
	],
});

tester.run("no-effect-ref-read-then-write", noEffectRefReadThenWriteRule, {
	valid: [
		'import { Ref } from "effect"; function update(state: Ref.Ref<number>) { return Ref.modify(state, (value) => [value + 1, value]); }',
		'import { Ref as R } from "effect"; function readOnly(state: R.Ref<number>) { return R.get(state); }',
		'import * as E from "effect"; function separate(first: E.Ref.Ref<number>, second: E.Ref.Ref<number>) { E.Ref.get(first); E.Ref.set(second, 1); }',
		'import { Ref } from "effect"; function firstWrites(state: Ref.Ref<number>) { Ref.set(state, 1); Ref.get(state); }',
		'import { Ref } from "effect"; function outer(state: Ref.Ref<number>) { Ref.get(state); return () => Ref.set(state, 1); }',
	],
	invalid: [
		{
			code: 'import { Ref } from "effect"; function update(state: Ref.Ref<number>) { const current = Ref.get(state); return Ref.set(state, current + 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import { Ref as R } from "effect"; function update(state: R.Ref<number>) { R.get(state); R.set(state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import * as E from "effect"; function update(state: E.Ref.Ref<number>) { E.Ref.get(state); E.Ref.set(state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
	],
});

tester.run("no-unmanaged-effect-scope", noUnmanagedEffectScopeRule, {
	valid: [
		'import { Effect, Scope } from "effect"; Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, "interrupt"));',
		'import { Effect as E, Scope as S } from "effect"; E.acquireRelease(S.make(), release);',
		'import * as Fx from "effect"; Fx.acquireRelease(Fx.Scope.make(), release);',
		'import { Scope } from "effect"; const value = Scope.close(scope, "interrupt");',
		'const Scope = { make: () => effect }; Scope.make();',
	],
	invalid: [
		{
			code: 'import { Scope } from "effect"; function open() { const scope = Scope.make(); return scope; }',
			errors: [{ messageId: "unmanaged" }],
		},
		{
			code: 'import * as Fx from "effect"; function open() { const scope = Fx.Scope.make(); Fx.Scope.close(scope, "interrupt"); }',
			errors: [{ messageId: "unmanaged" }],
		},
	],
});

tester.run("no-optional-domain-properties", noOptionalDomainPropertiesRule, {
	valid: [
		{ code: "interface Value { value?: string; }", filename: "/project/packages/other/src/value.ts" },
		{ code: "interface Value { value: Option<string>; }", filename: "/project/packages/flow-state/src/core/api/value.ts" },
		{ code: "class Value { value: Option<string>; }", filename: "/project/packages/flow-state/src/vnext/value.ts" },
		{ code: "const value = { optional: undefined };", filename: "/project/packages/flow-state/src/core/api/value.ts" },
		{
			code: "interface Value { value?: string; }",
			filename: "/project/packages/custom/src/value.ts",
			options: [{ sourceRoots: ["packages/other/src"] }],
		},
	],
	invalid: [
		{
			code: "interface Value { value?: string; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "interface Value { value: string | undefined; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "class Value { value: string | null; }",
			filename: "/project/packages/flow-state-rewrite/src/public/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "type Maybe<T> = T | undefined; interface Value { value: Maybe<string>; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
	],
});

tester.run("no-implicit-effect-concurrency", noImplicitEffectConcurrencyRule, {
	valid: [
		'import { Effect } from "effect"; Effect.all(items, { concurrency: 1 });',
		'import { Effect } from "effect"; Effect.forEach(items, run, { concurrency: "unbounded" });',
		'import { Effect } from "effect"; Effect.validate(items, run, { concurrency: 4 });',
		'import { Effect } from "effect"; Effect.all(items, { ["concurrency"]: 1 });',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.all(items);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.forEach(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.validate(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; const concurrency = 1; Effect.all(items, concurrency);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.all(items, { metadata: { concurrency: 1 } });',
			errors: [{ messageId: "concurrency" }],
		},
	],
});

tester.run("no-numeric-duration", noNumericDurationRule, {
	valid: [
		'import { Duration, Effect, Schedule } from "effect"; Effect.sleep(Duration.seconds(1));',
		'import { Effect } from "effect"; Effect.timeout("5 seconds");',
		'import { Schedule } from "effect"; Schedule.recurs(3);',
		'import { Effect } from "effect"; const duration = 100; Effect.delay(duration);',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.sleep(100);',
			errors: [{ messageId: "duration" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.timeout(effect, 100);',
			errors: [{ messageId: "duration" }],
		},
		{
			code: 'import { Schedule } from "effect"; Schedule.exponential(100);',
			errors: [{ messageId: "duration" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.sleep(-100);',
			errors: [{ messageId: "duration" }],
		},
	],
});

tester.run("no-raw-try-catch", noRawTryCatchRule, {
	valid: [
		"try { work(); } catch (cause) { report(cause); }",
		'import { Effect } from "effect"; const value = Effect.try({ try: work, catch: String });',
		'import type { Effect } from "effect"; try { work(); } catch (cause) { report(cause); }',
		'import { Effect } from "effect"; try { work(); } finally { cleanup(); }',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; try { work(); } catch (cause) { report(cause); }',
			errors: [{ messageId: "rawTryCatch" }],
		},
		{
			code: 'import { Effect } from "effect/submodule"; try { work(); } catch (cause) { report(cause); }',
			errors: [{ messageId: "rawTryCatch" }],
		},
	],
});

tester.run("no-throw-in-effect-gen", noThrowInEffectGenRule, {
	valid: [
		'import { Effect } from "effect"; Effect.gen(function* () { yield* Effect.succeed(1); });',
		'import { Effect } from "effect"; Effect.gen(function* () { const helper = () => { throw cause; }; return helper; });',
		'import { Effect } from "effect"; Effect.gen(function* () { function nested() { throw new Error("allowed nested function"); } yield* Effect.succeed(nested); });',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.gen(function* () { throw new Error("boom"); });',
			errors: [{ messageId: "throw" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.fn("work")(function* () { if (bad) throw cause; });',
			errors: [{ messageId: "throw" }],
		},
	],
});

tester.run("no-expect-in-if", noExpectInIfRule, {
	valid: [
		{ code: 'test("works", () => { if (value) expect(value).toBe(true); });', filename: "/project/src/production.ts" },
		{ code: 'test("works", () => { expect(value).toBe(true); if (value) expect(value).toBe(true); });', filename: "/project/src/example.test.ts" },
		{ code: 'test("works", () => { expect.assertions(1); if (value) expect(value).toBe(true); });', filename: "/project/src/example.test.ts" },
		{ code: 'test.concurrent.each(cases)("works", () => { expect(value).toBe(true); });', filename: "/project/src/example.test.ts" },
	],
	invalid: [
		{
			code: 'test("works", () => { if (value) expect(value).toBe(true); });',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "conditionalAssertion" }],
		},
		{
			code: 'test.each([[true]])("works", (value) => { if (value) expect(value).toBe(true); });',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "conditionalAssertion" }],
		},
		{
			code: 'test.each(cases)("works", () => { if (value) expect(value).resolves.toBe(true); });',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "conditionalAssertion" }],
		},
	],
});

tester.run("no-module-mocking", noModuleMockingRule, {
	valid: [
		{ code: 'import { vi } from "vitest"; vi.mock("./dependency");', filename: "/project/src/production.ts" },
		{ code: 'import { vi } from "vitest"; vi.fn();', filename: "/project/src/example.test.ts" },
	],
	invalid: [
		{
			code: 'import { vi } from "vitest"; vi.mock("./dependency");',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "moduleMock" }],
		},
		{
			code: 'import * as vi from "vitest"; vi["mock"]("./dependency");',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "moduleMock" }],
		},
		{
			code: 'import * as vitest from "vitest"; vitest.mock("./dependency");',
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "moduleMock" }],
		},
	],
});

tester.run("no-unsafe-fiber-methods", noUnsafeFiberMethodsRule, {
	valid: [
		"const worker = { pollUnsafe() {} }; worker.pollUnsafe();",
		{
			code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.interruptUnsafe();',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
		},
	],
	invalid: [
		{
			code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.pollUnsafe();',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "unsafeFiberMethod" }],
		},
		{
			code: 'import { Fiber } from "effect"; interface Holder { fiber: Fiber.Fiber<number, never> } declare const holder: Holder; holder.fiber["pollUnsafe"]();',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "unsafeFiberMethod" }],
		},
	],
});

tester.run("no-promise-microtask-barrier", noPromiseMicrotaskBarrierRule, {
	valid: [
		{ code: "async function flush() { await Promise.resolve(1); }", filename: "/project/src/example.test.ts" },
		{ code: "async function flush() { await Promise.resolve(); }", filename: "/project/src/domain.ts" },
		{ code: "async function flush(Promise: PromiseConstructor) { await Promise.resolve(); }", filename: "/project/src/example.test.ts" },
	],
	invalid: [
		{
			code: "async function flush() { await Promise.resolve(); }",
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "microtaskBarrier" }],
		},
	],
});

tester.run("no-swallowed-cleanup-error", noSwallowedCleanupErrorRule, {
	valid: [
		{ code: "await runtime.dispose().catch(report);", filename: "/project/src/example.test.ts" },
		{ code: "await runtime.dispose().catch(() => expect(true).toBe(true));", filename: "/project/src/example.test.ts" },
		{ code: "await runtime.dispose().catch(() => undefined);", filename: "/project/src/domain.ts" },
	],
	invalid: [
		{
			code: "await runtime.dispose().catch(() => undefined);",
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "swallowedCleanupError" }],
		},
		{
			code: "await release().catch(() => void 0);",
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "swallowedCleanupError" }],
		},
		{
			code: "await release().catch(() => {});",
			filename: "/project/src/example.test.ts",
			errors: [{ messageId: "swallowedCleanupError" }],
		},
	],
});

tester.run("no-local-definite-assignment", noLocalDefiniteAssignmentRule, {
	valid: ["class Example { value!: string; }", "const value = input!;"],
	invalid: [
		{
			code: "let app!: App; app = createApp();",
			errors: [{ messageId: "localDefiniteAssignment" }],
		},
	],
});

tester.run("no-service-shape-parameter-extraction", noServiceShapeParameterExtractionRule, {
	valid: [
		"type Value = Parameters<typeof fn>[0];",
		"type Value = Parameters<(typeof Service)[\"get\"]>[0];",
		'declare const Repository: { of(input: string): unknown }; type Value = Parameters<(typeof Repository)["of"]>[0];',
	],
	invalid: [
		{
			code: 'import { Context } from "effect"; class Service extends Context.Service<Service>()("Service") {} type Value = Parameters<(typeof Service)["of"]>[0];',
			errors: [{ messageId: "serviceShape" }],
		},
		{
			code: 'import { Context as C } from "effect"; class Service extends C["Service"]<Service>()("Service") {} type Value = Parameters<(typeof Service)["of"]>[0];',
			errors: [{ messageId: "serviceShape" }],
		},
	],
});

tester.run("no-explicit-any", noExplicitAnyRule, {
	valid: [
		{ code: "const value: unknown = 1;", filename: "/project/src/domain.ts" },
		{ code: "const value: any = 1;", filename: "/project/src/testing/harness.ts" },
	],
	invalid: [
		{
			code: "const value: any = 1;",
			filename: "/project/src/domain.ts",
			errors: [{ messageId: "explicitAny" }],
		},
	],
});

tester.run("no-escape-hatch-assertion", noEscapeHatchAssertionRule, {
	valid: [
		"const value = input as const;",
		"const value = input as string;",
		"const value = input as unknown as string;",
	],
	invalid: [
		{ code: "const value = input as any;", errors: [{ messageId: "escapeHatch" }] },
		{ code: "const value = input as unknown;", errors: [{ messageId: "escapeHatch" }] },
		{
			code: "const value = input as Record<string, unknown>;",
			errors: [{ messageId: "escapeHatch" }],
		},
	],
});

tester.run("no-redundant-readonly-wrapper", noRedundantReadonlyWrapperRule, {
	valid: [
		"type Value = Readonly<{ value: string }>;",
		"type Value = Readonly<ValueFields>;",
		"type Value = Readonly<{ readonly value: string } | { readonly other: string }>;",
	],
	invalid: [
		{
			code: "type Value = Readonly<{ readonly value: string }>;",
			errors: [{ messageId: "redundant" }],
		},
	],
});

tester.run("no-shallow-json-domain-cast", noShallowJsonDomainCastRule, {
	valid: [
		{
			code: "const raw: unknown = JSON.parse(source);",
			filename: "/project/packages/flow-state/src/runtime/runtime-boot-decoder.ts",
		},
		{
			code: "const raw = JSON.parse(source);",
			filename: "/project/packages/flow-state/src/core/inspection/trace-artifact.ts",
		},
		{ code: "const value = JSON.parse(source);", filename: "/project/src/runtime/runtime-boot-decoder.ts" },
	],
	invalid: [
		{
			code: "const value = JSON.parse(source) as DomainValue;",
			errors: [{ messageId: "jsonParse" }],
		},
		{
			code: "let value: DomainValue; value = JSON.parse(source);",
			errors: [{ messageId: "jsonParse" }],
		},
		{ code: "function read() { return JSON.parse(source); }", errors: [{ messageId: "jsonParse" }] },
		{ code: "const raw: unknown = JSON.parse(source);", errors: [{ messageId: "jsonParse" }] },
	],
});

tester.run("no-effect-runner-in-domain", noEffectRunnerInDomainRule, {
	valid: [
		"const worker = { runSync() {} }; worker.runSync();",
		{
			code: 'import { Effect } from "effect"; Effect.runSync(Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.runSync(Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.runSync(Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/core/machines/flow-paths.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E.runPromise(E.succeed(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "runner" }],
		},
	],
});

tester.run("no-unwrapped-promise-in-effect-core", noUnwrappedPromiseInEffectCoreRule, {
	valid: [
		"const value = Promise.resolve(1);",
		{
			code: 'import { Effect } from "effect"; const value = Effect.tryPromise(() => Promise.resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import { Effect } from "effect"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/core/inspection/trace-artifact.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const value = new Promise((resolve) => resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect/submodule"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "promise" }],
		},
	],
});

tester.run("no-chained-type-assertions-regression", noChainedTypeAssertionsRule, {
	valid: ["const value = input as string;"],
	invalid: [{ code: "const value = input as unknown as string;", errors: [{ messageId: "chained" }] }],
});

tester.run("no-conditional-empty-object-spread-regression", noConditionalEmptyObjectSpreadRule, {
	valid: ["const value = { ...(condition ? { enabled: true } : { disabled: true }) };"],
	invalid: [{ code: "const value = { ...(condition ? {} : { enabled: true }) };", errors: [{ messageId: "avoid" }] }],
});

tester.run("no-known-value-widening-regression", noKnownValueWideningRule, {
	valid: ["const value = { id: 1 };"],
	invalid: [
		{ code: "const value: unknown = {};", errors: [{ messageId: "widening" }] },
		{ code: "const value: unknown = {} as unknown;", errors: [{ messageId: "widening" }] },
		{
			code: "function make() { type Bag = Record<string, unknown>; const value: Bag = { key: \"value\" }; return value; }",
			errors: [{ messageId: "widening" }],
		},
	],
});

tester.run("no-widen-then-assert-regression", noWidenThenAssertRule, {
	valid: ["const value = input as DomainValue;"],
	invalid: [
		{ code: "const erased: unknown = { id: \"erased\" }; const value = erased as DomainValue;", errors: [{ messageId: "widenThenAssert" }] },
	],
});

tester.run("no-unknown-parameters-regression", noUnknownParametersRule, {
	valid: [
		"function parse(cause: unknown) { return cause; }",
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownSync(Schema.String)(value); }',
	],
	invalid: [
		{ code: "function parse(value: unknown) { return value; }", errors: [{ messageId: "unknownParameter" }] },
		{ code: "const Schema = { decodeUnknownSync: (value) => value }; function parse(value: unknown) { return Schema.decodeUnknownSync(value); }", errors: [{ messageId: "unknownParameter" }] },
	],
});

tester.run("no-unknown-returns-regression", noUnknownReturnsRule, {
	valid: [
		"type Promise<T> = T; function local(): Promise<unknown> { return value; }",
		"function union(): string | number { return value; }",
	],
	invalid: [
		{ code: "function direct(): unknown { return value; }", errors: [{ messageId: "unknownReturn" }] },
		{ code: "function union(): string | unknown { return value; }", errors: [{ messageId: "unknownReturn" }] },
	],
});

tester.run("no-unknown-type-aliases-regression", noUnknownTypeAliasesRule, {
	valid: ["type Value = string;", "function outer() { type Value = string; return null as Value; }"],
	invalid: [
		{ code: "type Value = string | unknown;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type Box<T> = T; type Value = Box<unknown>;", errors: [{ messageId: "unknownAlias" }] },
	],
});

tester.run("no-unsafe-dictionary-type-regression", noUnsafeDictionaryTypeRule, {
	valid: ["const value: Record<string, string> = {};"],
	invalid: [
		{ code: "function make() { type Unknown = unknown; const value: Record<string, Unknown> = {}; return value; }", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "interface Value { id: string } function make() { interface Value {} const value: Record<string, Value> = {}; return value; }", errors: [{ messageId: "unsafeDictionary" }] },
	],
});

tester.run("no-object-parameters-regression", noObjectParametersRule, {
	valid: ["function read(value: { readonly id: string }) { return value.id; }"],
	invalid: [
		{ code: "function read(value: object) { return value; }", errors: [{ messageId: "objectParameter" }] },
		{ code: "function read() { type Input = object; function nested(value: Input) { return value; } return nested; }", errors: [{ messageId: "objectParameter" }] },
	],
});

tester.run("no-nullish-function-contracts-regression", noNullishFunctionContractsRule, {
	valid: [
		"function find(value: string): string { return value; }",
		"function find(value: Option.Option<string>): Result.Result<string, Error> { return result; }",
		"type Maybe<T> = Option.Option<T>; function find(value: Maybe<string>): Maybe<string> { return value; }",
		"type Identity<T> = T; function find<T>(value: Identity<T>): T { return value; }",
		"function run(): Effect.Effect<string, Error, never> { return effect; }",
		"function stop(): void {}",
		"function decode(value: unknown): Result.Result<string, Error> { return result; }",
	],
	invalid: [
		{ code: "function find(value?: string): string { return value ?? \"fallback\"; }", errors: [{ messageId: "nullishContract" }] },
		{ code: "function find(value = \"fallback\"): string { return value; }", errors: [{ messageId: "nullishContract" }] },
		{ code: "function find(value: string | undefined): string { return value ?? \"fallback\"; }", errors: [{ messageId: "nullishContract" }] },
		{ code: "function find(value: string | null): string { return value ?? \"fallback\"; }", errors: [{ messageId: "nullishContract" }] },
		{ code: "function find(value: Maybe<string>): Maybe<string> { return value; } type Maybe<T> = T | undefined;", errors: [{ messageId: "nullishContract" }, { messageId: "nullishContract" }] },
		{ code: "function find(): Promise<string | undefined> { return Promise.resolve(\"value\"); }", errors: [{ messageId: "nullishContract" }] },
		{ code: "type Maybe<T> = T | null; function find(value: Maybe<string>): string { return value ?? \"fallback\"; }", errors: [{ messageId: "nullishContract" }] },
		{ code: "type Handler = (value?: string) => void;", errors: [{ messageId: "nullishContract" }] },
		{ code: "type Handler = () => string | null;", errors: [{ messageId: "nullishContract" }] },
	],
});

tester.run("no-object-freeze-regression", noObjectFreezeRule, {
	valid: [
		"const snapshot = { ...value };",
		"const localObject = { freeze: (input) => input }; localObject.freeze(value);",
		"function read(Object) { return Object.freeze(value); }",
	],
	invalid: [
		{ code: "Object.freeze(value);", errors: [{ messageId: "objectFreeze" }] },
		{ code: 'Object["freeze"](value);', errors: [{ messageId: "objectFreeze" }] },
		{ code: "const freeze = Object.freeze;", errors: [{ messageId: "objectFreeze" }] },
	],
});

tester.run("no-runtime-typeof-regression", noRuntimeTypeofRule, {
	valid: [{ code: "function isText(value: unknown): value is string { return typeof value === \"string\"; }", options: [{ allowInTypeGuards: true }] }],
	invalid: [{ code: "const kind = typeof value;", errors: [{ messageId: "runtimeTypeof" }] }],
});

tester.run("no-reflect-regression", noReflectApplyRule, {
	valid: ["callback(value);"],
	invalid: [{ code: "Reflect.apply(callback, undefined, [value]);", errors: [{ messageId: "reflectApply" }] }],
});
tester.run("no-reflect-get-regression", noReflectGetRule, {
	valid: ["value[key];"],
	invalid: [{ code: "Reflect.get(value, key);", errors: [{ messageId: "reflectGet" }] }],
});

tester.run("no-shape-in-symbol-names-regression", noForbiddenTermInSymbolNamesRule, {
	valid: ["const value = 1; console.log(value);"],
	invalid: [{ code: "const shapeValue = 1;", errors: [{ messageId: "forbiddenSymbolName" }] }],
});

tester.run("no-effect-promise-regression", noEffectPromiseRule, {
	valid: ['import { Effect } from "effect"; Effect.tryPromise({ try: work, catch: String });'],
	invalid: [{ code: 'import { Effect } from "effect"; Effect.tryPromise({ try: work });', errors: [{ messageId: "tryPromise" }] }],
});

tester.run("require-safety-comment-for-type-assertion-regression", requireSafetyCommentForTypeAssertionRule, {
	valid: [
		"const value = input as const;",
		"// SAFETY: schema validation above proves the invariant.\nconst value = input as DomainValue;",
	],
	invalid: [{ code: "const value = input as DomainValue;", errors: [{ messageId: "missingSafetyComment" }] }],
});

const preferredFixture = readFileSync(new URL("./fixtures/all-preferred-patterns.ts", import.meta.url), "utf8");
const preferredFixtureRules = [
	["no-array-from-then-map", noArrayFromThenMapRule],
	["no-bivariant-callback", noBivariantCallbackRule],
	["no-chained-type-assertions", noChainedTypeAssertionsRule],
	["no-conditional-empty-object-spread", noConditionalEmptyObjectSpreadRule],
	["no-conditional-singleton-array-spread", noConditionalSingletonArraySpreadRule],
	["no-context-tag", noContextTagRule],
	["no-data-taggederror", noDataTaggedErrorRule],
	["no-direct-process-env", noDirectProcessEnvRule],
	["no-effect-promise", noEffectPromiseRule],
	["no-effect-promise-microtask", noEffectPromiseMicrotaskRule],
	["no-effect-runner-in-domain", noEffectRunnerInDomainRule],
	["no-effect-ref-read-then-write", noEffectRefReadThenWriteRule],
	["no-escape-hatch-assertion", noEscapeHatchAssertionRule],
	["no-explicit-any", noExplicitAnyRule],
	["no-expect-in-if", noExpectInIfRule],
	["no-for-each", noForEachRule],
	["no-generic-utility-module", noGenericUtilityModuleRule],
	["no-god-service-shape", noGodServiceShapeRule],
	["no-implicit-effect-concurrency", noImplicitEffectConcurrencyRule],
	["no-inward-module-dependency", noInwardModuleDependencyRule],
	["no-inline-import-type-query", noInlineImportTypeQueryRule],
	["no-known-value-widening", noKnownValueWideningRule],
	["no-local-definite-assignment", noLocalDefiniteAssignmentRule],
	["no-large-production-file", noLargeProductionFileRule],
	["no-module-mocking", noModuleMockingRule],
	["no-numeric-duration", noNumericDurationRule],
	["no-nested-conditional-expression", noNestedConditionalExpressionRule],
	["no-nullish-function-contracts", noNullishFunctionContractsRule],
	["no-object-freeze", noObjectFreezeRule],
	["no-object-parameters", noObjectParametersRule],
	["no-optional-domain-properties", noOptionalDomainPropertiesRule],
	["no-package-dist-or-self-import-in-src", noPackageDistOrSelfImportInSrcRule],
	["no-promise-microtask-barrier", noPromiseMicrotaskBarrierRule],
	["no-pure-effect-wrapper", noPureEffectWrapperRule],
	["no-public-entrypoint-export-drift", noPublicEntrypointExportDriftRule],
	["no-raw-try-catch", noRawTryCatchRule],
	["no-redundant-readonly-wrapper", noRedundantReadonlyWrapperRule],
	["no-reflect-apply", noReflectApplyRule],
	["no-reflect-get", noReflectGetRule],
	["no-runtime-typeof", noRuntimeTypeofRule],
	["no-service-shape-parameter-extraction", noServiceShapeParameterExtractionRule],
	["no-shape-in-symbol-names", noForbiddenTermInSymbolNamesRule],
	["no-staged-object-assign", noStagedObjectAssignRule],
	["no-swallowed-cleanup-error", noSwallowedCleanupErrorRule],
	["no-ternary-iife", noTernaryIifeRule],
	["no-throw-in-effect-gen", noThrowInEffectGenRule],
	["no-top-level-mutable-production-state", noTopLevelMutableProductionStateRule],
	["no-unmanaged-effect-scope", noUnmanagedEffectScopeRule],
	["no-unknown-parameters", noUnknownParametersRule],
	["no-unknown-returns", noUnknownReturnsRule],
	["no-unknown-type-aliases", noUnknownTypeAliasesRule],
	["no-unsafe-dictionary-type", noUnsafeDictionaryTypeRule],
	["no-unsafe-fiber-methods", noUnsafeFiberMethodsRule],
	["no-unwrapped-promise-in-effect-core", noUnwrappedPromiseInEffectCoreRule],
	["no-widen-then-assert", noWidenThenAssertRule],
	["require-safety-comment-for-type-assertion", requireSafetyCommentForTypeAssertionRule],
	["use-export-type", useExportTypeRule],
	["use-import-type", useImportTypeRule],
];
for (const [name, rule] of preferredFixtureRules) {
	tester.run(`preferred fixture: ${name}`, rule, {
		valid: [{ code: preferredFixture, filename: "/project/packages/flow-state/src/preferred-fixture.ts" }],
		invalid: [],
	});
}

console.log("anti-slop rule tests passed");
