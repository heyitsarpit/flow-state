import { preferInferredReturnTypesRule } from "./rules/prefer-inferred-return-types.ts";
import { RuleTester } from "oxlint/plugins-dev";
import { readFileSync } from "node:fs";

import { noArrayFromThenMapRule } from "./rules/no-array-from-then-map.ts";
import { noBivariantCallbackRule } from "./rules/no-bivariant-callback.ts";
import { noChainedTypeAssertionsRule } from "./rules/no-chained-type-assertions.ts";
import { noConditionalEmptyObjectSpreadRule } from "./rules/no-conditional-empty-object-spread.ts";
import { noConditionalSingletonArraySpreadRule } from "./rules/no-conditional-singleton-array-spread.ts";
import { noContextTagRule } from "./rules/no-context-tag.ts";
import { noParallelDiagnosticErrorsRule } from "./rules/flow-state/no-parallel-diagnostic-errors.ts";
import { noUnknownEffectChannelRule } from "./rules/flow-state/no-unknown-effect-channel.ts";
import { noAnonymousDefaultExportRule } from "./rules/no-anonymous-default-export.ts";
import { noDirectProcessEnvRule } from "./rules/no-direct-process-env.ts";
import { noEffectPromiseRule } from "./rules/no-effect-promise.ts";
import { noUnjustifiedEffectTryPromiseRule } from "./rules/no-unjustified-effect-try-promise.ts";
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
import { noObjectTypeRule } from "./rules/no-object-type.ts";
import { noOptionalDomainPropertiesRule } from "./rules/no-optional-domain-properties.ts";
import { noPackageDistOrSelfImportInSrcRule } from "./rules/no-package-dist-or-self-import-in-src.ts";
import { noPromiseMicrotaskBarrierRule } from "./rules/no-promise-microtask-barrier.ts";
import { noPublicEntrypointExportDriftRule } from "./rules/no-public-entrypoint-export-drift.ts";
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
import { noRawTryCatchRule } from "./rules/no-raw-try-catch.ts";
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
		'import * as Fx from "effect"; Fx.Effect.forEach(items, run, { concurrency: 1 });',
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
			code: 'import { Effect } from "effect"; Effect.promise(() => Promise.resolve());',
			filename: "/project/packages/flow-state/src/server.ts",
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
		{
			code: 'import * as Fx from "effect"; Fx.Effect.promise(() => Promise.resolve());',
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
		{
			code: 'import * as Fx from "effect"; Fx.Context.Tag("Service"); Fx.Effect.Service("Service");',
			errors: [{ messageId: "v3Service" }, { messageId: "v3Service" }],
		},
	],
});

tester.run("no-effect-promise", noEffectPromiseRule, {
	valid: [
		'import { Effect } from "effect"; Effect.tryPromise(() => Promise.resolve(1));',
		'import { Effect } from "effect"; Effect.tryPromise({ try: makeRequest });',
		'import { Effect as E } from "effect"; E.tryPromise({ try: makeRequest, catch: String });',
		'import * as Fx from "effect"; Fx.Effect.tryPromise({ try: makeRequest, catch: String });',
		'import { Effect } from "effect"; const E = Effect; E.tryPromise({ try: makeRequest, catch: String });',
		'import { Effect } from "effect"; const tryPromise = Effect.tryPromise; tryPromise({ try: makeRequest, catch: String });',
		'import * as Fx from "effect"; const tryPromise = Fx.Effect.tryPromise; tryPromise({ try: makeRequest, catch: String });',
		'import { Effect } from "effect"; const local = { promise: () => Promise.resolve(1) }; local.promise();',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E["promise"](() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E[`promise`](() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E[`promise`].call(undefined, () => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.promise.apply(undefined, [() => Promise.resolve(1)]);',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import { Effect } from "effect"; const promise = Effect.promise; promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import * as Fx from "effect"; const E = Fx.Effect; E.promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
		{
			code: 'import * as Fx from "effect"; const promise = Fx.Effect.promise; promise(() => Promise.resolve(1));',
			errors: [{ messageId: "promise" }],
		},
	],
});

tester.run("no-unjustified-effect-try-promise", noUnjustifiedEffectTryPromiseRule, {
	valid: [
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: vendor SDK exposes only Promise and accepts AbortSignal.\nconst load = Effect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
		{
			code: 'import { Effect } from "effect";\nconst load = Effect.gen(function* () {\n  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: legacy client cannot return Effect.\n  yield* Effect.tryPromise({ try: work, catch: mapError });\n});',
			filename: "/project/packages/flow-state-rewrite/src/workflow.ts",
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: foreign Promise-only client.\nconst load = Effect.tryPromise.call(undefined, { try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
		{
			code: 'import * as Fx from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: foreign Promise-only client.\nconst load = Fx.Effect["tryPromise"].apply(undefined, [{ try: work, catch: mapError }]);',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
		{
			code: 'import { Effect as E } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: foreign Promise-only client.\nconst load = E.tryPromise.bind(undefined)({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state/src/adapter.ts",
		},
		{
			code: 'const Effect = { tryPromise: (value) => value }; Effect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/local.ts",
		},
		{
			code: 'const first = second; const second = first; first.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/local.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise(work);',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: this is still malformed.\nEffect.tryPromise({ try: work });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: this is still malformed.\nEffect.tryPromise({ catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: this is still malformed.\nEffect.tryPromise({ try: 1, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: this is still malformed.\nEffect.tryPromise({ try: work, catch: undefined });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "invalid" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: unrelated comment\nconst value = 1;\nEffect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect"; const value = 1; /* FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: trailing */\nEffect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: non-adjacent\n\nEffect.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E.tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect[`tryPromise`]({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.tryPromise.call(undefined, { try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.tryPromise.bind(undefined)({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
		{
			code: 'import * as Fx from "effect"; const tryPromise = Fx.Effect.tryPromise; tryPromise({ try: work, catch: mapError });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
	],
});

tester.run("no-parallel-diagnostic-errors", noParallelDiagnosticErrorsRule, {
	valid: [
		{
			code: 'import { Schema } from "effect"; class Diagnostic extends Schema.TaggedError<Diagnostic>()("Diagnostic", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/diagnostic/diagnostic.ts",
		},
		{
			code: 'import { Schema } from "effect"; class Diagnostic extends Schema.TaggedError<Diagnostic>("flow-state/Diagnostic")("Diagnostic", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/diagnostic/diagnostic.ts",
		},
		{
			code: 'import { Schema } from "effect"; const S = Schema; class Diagnostic extends S.TaggedError<Diagnostic>()("Diagnostic", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/diagnostic/diagnostic.ts",
		},
		{ code: 'const Schema = { TaggedError: () => undefined }; Schema.TaggedError("local");', filename: "/project/packages/flow-state-rewrite/src/local.ts" },
		{ code: 'class LocalErrorBase {} class FeatureFailure extends LocalErrorBase {}', filename: "/project/packages/flow-state-rewrite/src/local.ts" },
		{
			code: 'import { Data } from "effect"; let D = Data; D.TaggedError("local");',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
		},
		{
			code: 'import { Data } from "effect"; let D = Data; D = unrelated; D.TaggedError("local");',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
		},
		{
			code: 'const D = { TaggedError: () => undefined }; const DD = D; const Tagged = DD.TaggedError; Tagged("local");',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
		},
		{
			code: 'const first = second; const second = first; first.TaggedError("local");',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
		},
	],
	invalid: [
		{
			code: 'import { Schema } from "effect"; class Diagnostic { readonly factory = Schema.TaggedError("NotADeclaration"); }',
			filename: "/project/packages/flow-state-rewrite/src/diagnostic/diagnostic.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Data, Schema } from "effect"; class A extends Data.TaggedError("A") {} class B extends Schema.TaggedError<B>()("B", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }, { messageId: "parallel" }],
		},
		{
			code: 'import { Data as D } from "effect"; class A extends D["TaggedError"]("A") {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Schema as S } from "effect"; class A extends S["TaggedError"]<A>()("A", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Schema } from "effect"; const S = Schema; class A extends (S)[`TaggedError`]<A>()("A", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Data } from "effect"; class A extends Data[`TaggedError`]("A") {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import * as Fx from "effect"; class A extends Fx.Data.TaggedError("A") {} class B extends Error {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }, { messageId: "parallel" }],
		},
		{
			code: 'import * as Fx from "effect"; class A extends Fx["Schema"]["TaggedError"]<A>()("A", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Data } from "effect"; const { TaggedError: makeError } = Data; class A extends makeError("A") {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Data } from "effect"; const D = Data; const DD = D; const Tagged = DD.TaggedError; class A extends Tagged("A") {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Schema } from "effect"; const S = Schema; const SS = S; const Tagged = SS["TaggedError"]; class A extends Tagged<A>()("A", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'class FeatureError extends Error {}',
			filename: "C:\\project\\packages\\flow-state-rewrite\\src\\feature.ts",
			errors: [{ messageId: "parallel" }],
		},
	],
});

tester.run("no-unknown-effect-channel", noUnknownEffectChannelRule, {
	valid: [
		{ code: 'import { Effect } from "effect"; type Good = Effect.Effect<string, Error, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
		{ code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: internal erasure\ntype Internal = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/internal.ts" },
		{ code: 'import { Effect } from "effect"; type Narrowed = Effect.Effect<string, unknown & Error, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
		{ code: 'import { Effect } from "effect"; type PromiseBox<T> = Promise<T>; type Good = Effect.Effect<string, PromiseBox<unknown>, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts" },
	],
	invalid: [
		{ code: 'import { Effect } from "effect"; type Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import * as Fx from "effect"; type Bad = Fx.Effect.Effect<string, Error, unknown>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Hidden = unknown; type Bad = Effect.Effect<string, Hidden, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Bad = Effect.Effect<string, string | unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Wrapped<T> = Effect.Effect<string, T, never>; type Bad = Wrapped<unknown>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; type Identity<T> = T; type Bad = Effect.Effect<string, Identity<unknown>, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: '// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: header\nimport { Effect } from "effect";\ntype Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: unrelated\nconst value = 1;\ntype Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; const value = 1; /* FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: trailing */\ntype Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
		{ code: 'import { Effect } from "effect"; /** @internal erasure */\ntype Bad = Effect.Effect<string, unknown, never>;', filename: "/project/packages/flow-state-rewrite/src/public.ts", errors: [{ messageId: "unknownChannel" }] },
	],
});

const deepUnknownUnion = Array.from({ length: 26 }, (_, index) =>
	index === 0 ? "type Channel0 = unknown;" : `type Channel${index} = string | Channel${index - 1} | Channel${index - 1};`,
).join(" ");
tester.run("no-unknown-effect-channel-performance", noUnknownEffectChannelRule, {
	valid: [],
	invalid: [
		{
			code: `import { Effect } from "effect"; ${deepUnknownUnion} type Bad = Effect.Effect<string, Channel25, never>;`,
			filename: "/project/packages/flow-state-rewrite/src/public.ts",
			errors: [{ messageId: "unknownChannel" }],
		},
	],
});

tester.run("no-effect-ref-read-then-write", noEffectRefReadThenWriteRule, {
	valid: [
		'import { Ref } from "effect"; function update(state: Ref.Ref<number>) { return Ref.modify(state, (value) => [value + 1, value]); }',
		'import { Ref as R } from "effect"; function readOnly(state: R.Ref<number>) { return R.get(state); }',
		'import * as E from "effect"; function separate(first: E.Ref.Ref<number>, second: E.Ref.Ref<number>) { E.Ref.get(first); E.Ref.set(second, 1); }',
		'import * as E from "effect"; function separate(first: E.Ref.Ref<number>, second: E.Ref.Ref<number>) { E["Ref"].get(first); E["Ref"]["set"](second, 1); }',
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
		{
			code: 'import * as E from "effect"; function update(state: E.Ref.Ref<number>) { E["Ref"]["get"](state); E.Ref["set"](state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
	],
});

tester.run("no-unmanaged-effect-scope", noUnmanagedEffectScopeRule, {
	valid: [
		'import { Effect, Exit, Scope } from "effect"; Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void));',
		'import { Effect as E, Scope as S } from "effect"; E.acquireRelease(S.make(), release);',
		'import * as Fx from "effect"; Fx.acquireRelease(Fx.Scope.make(), release);',
		'import * as Fx from "effect"; Fx["acquireRelease"](Fx["Scope"]["make"](), release);',
		'import { Exit, Scope } from "effect"; const value = Scope.close(scope, Exit.void);',
		'const Scope = { make: () => effect }; Scope.make();',
		{
			code: 'import { Scope } from "effect"; const scope = Scope.make();',
			filename: "/project/packages/flow-state/src/server.ts",
		},
	],
	invalid: [
		{
			code: 'import { Scope } from "effect"; function open() { const scope = Scope.make(); return scope; }',
			errors: [{ messageId: "unmanaged" }],
		},
		{
			code: 'import * as Fx from "effect"; function open() { const scope = Fx.Scope.make(); Fx.Scope.close(scope, Fx.Exit.void); }',
			errors: [{ messageId: "unmanaged" }],
		},
		{
			code: 'import * as Fx from "effect"; function open() { const scope = Fx["Scope"]["make"](); return scope; }',
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
		'import { Effect } from "effect"; Effect.filterMapEffect(items, run, { concurrency: 1 });',
		'import { Effect } from "effect"; Effect.forEach(items, run, { concurrency: "unbounded" });',
		'import { Effect } from "effect"; Effect.partition(items, run, { concurrency: 2 });',
		'import { Effect } from "effect"; Effect.replicateEffect(work, 2, { concurrency: 2 });',
		'import { Effect } from "effect"; Effect.validate(items, run, { concurrency: 4 });',
		'import { Effect } from "effect"; Effect.all(items, { ["concurrency"]: 1 });',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.all(items);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx["Effect"]["all"](items);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.filterMapEffect(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.forEach(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.partition(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.replicateEffect(work, 2);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.validate(items, run);',
			errors: [{ messageId: "concurrency" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.forEach(items, run);',
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
		'import { Effect } from "effect"; Effect.timeoutOrElse({ duration: "5 seconds", orElse });',
		'import { Effect } from "effect"; Effect.cachedWithTTL(effect, "5 seconds");',
		'import { Schedule } from "effect"; Schedule.duration("5 seconds"); Schedule.upTo({ duration: "5 seconds" });',
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
			code: 'import { Effect } from "effect"; Effect.timeoutOption(100); Effect.cachedWithTTL(effect, 100); Effect.cachedInvalidateWithTTL(100);',
			errors: [
				{ messageId: "duration" },
				{ messageId: "duration" },
				{ messageId: "duration" },
			],
		},
		{
			code: 'import { Effect } from "effect"; Effect.timeoutOrElse({ duration: 100, orElse }); Effect.timeoutOrElse(effect, { duration: 100, orElse });',
			errors: [{ messageId: "duration" }, { messageId: "duration" }],
		},
		{
			code: 'import { Schedule } from "effect"; Schedule.duration(100); Schedule.during(100); Schedule.fibonacci(100); Schedule.fixed(100); Schedule.spaced(100); Schedule.windowed(100);',
			errors: Array.from({ length: 6 }, () => ({ messageId: "duration" })),
		},
		{
			code: 'import { Schedule } from "effect"; Schedule.upTo({ duration: 100 }); Schedule.upTo(schedule, { ["duration"]: 100 });',
			errors: [{ messageId: "duration" }, { messageId: "duration" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.sleep(-100);',
			errors: [{ messageId: "duration" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.sleep(100); Fx.Schedule.fixed(100);',
			errors: [{ messageId: "duration" }, { messageId: "duration" }],
		},
	],
});

tester.run("no-throw-in-effect-gen", noThrowInEffectGenRule, {
	valid: [
		'import { Effect } from "effect"; Effect.gen(function* () { yield* Effect.succeed(1); });',
		'import { Effect } from "effect"; Effect.gen(function* () { const helper = () => 1; return helper; });',
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
		{
			code: 'import { Effect } from "effect"; Effect.fnUntraced(function* () { throw cause; }); Effect.fnUntracedEager(function* () { throw cause; });',
			errors: [{ messageId: "throw" }, { messageId: "throw" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.fn("work")(function* () { throw cause; });',
			errors: [{ messageId: "throw" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.gen(((function* () { throw cause; }) as () => unknown));',
			errors: [{ messageId: "throw" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.gen(function* () { const callback = () => { throw cause; }; return callback; });',
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
		{
			code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.pollUnsafe();',
			filename: "/project/packages/flow-state/src/server.ts",
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
		{
			code: 'import * as Fx from "effect"; declare const fiber: Fx.Fiber.Fiber<number, never>; fiber.pollUnsafe();',
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
		{
			code: 'import * as Fx from "effect"; class Service extends Fx.Context.Service<Service>()("Service") {} type Value = Parameters<(typeof Service)["of"]>[0];',
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
		{ code: "const value = <any>input;", errors: [{ messageId: "escapeHatch" }] },
		{ code: "const value = <unknown>input;", errors: [{ messageId: "escapeHatch" }] },
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
			code: 'const first = second; const second = first; first.runPromise(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
		},
		{
			code: 'import { Effect } from "effect"; let E = Effect; E.runPromise(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
		},
		{
			code: 'import { Effect } from "effect"; let E = Effect; E = unrelated; E.runPromise(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
		},
		{
			code: 'import { Effect } from "effect"; let run = Effect.runPromise; run = unrelated; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.runSync(Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.runSync(Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.runPromise(Effect.void);',
			filename: "/project/packages/flow-state/src/server.ts",
		},
		{
			code: 'import { Effect } from "effect"; Effect.gen(function* () { yield* Effect.succeed(1); });',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.gen(function* () { yield* Effect.runPromise(Effect.succeed(1)); });',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
			errors: [{ messageId: "nestedRunner" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.runSync(Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/core/machines/flow-paths.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.runSync(Fx.Effect.succeed(1));',
			filename: "/project/packages/flow-state/src/core/machines/flow-paths.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect as E } from "effect"; E.runPromise(E.succeed(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect, ManagedRuntime } from "effect"; const runtime = ManagedRuntime.make(layer); runtime["runPromise"](effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import * as Fx from "effect"; const run = Fx.Effect.runPromise; Fx.Effect.gen(function* () { run(effect); });',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "nestedRunner" }],
		},
		{
			code: 'import { Effect } from "effect"; const run = Effect["runSync"]; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const { runPromise: run } = Effect; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; const EE = E; const run = EE.runPromise; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; const cycle = E; const E2 = cycle; const run = E2.runPromise; run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { ManagedRuntime } from "effect"; const runtime = ManagedRuntime.make(layer); const runtimeAlias = runtime; runtimeAlias.runPromise(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const run = Effect.runPromiseWith(context); run(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.gen((function* () { yield* Effect.runPromise(effect); }) as () => unknown);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "nestedRunner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E[`runPromise`].call(undefined, effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.runPromise.apply(undefined, [effect]);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
		{
			code: 'import { Effect } from "effect"; const E = Effect; E.runPromise.bind(undefined)(effect);',
			filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts",
			errors: [{ messageId: "runner" }],
		},
	],
});

tester.run("no-raw-try-catch", noRawTryCatchRule, {
	valid: [
		{ code: "try { work(); } finally { cleanup(); }", filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts" },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/implementation/live.test.ts" },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state/src/runtime/host.ts" },
	],
	invalid: [
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/implementation/live.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "const value = 1; try { work(value); } catch { recover(); }", filename: "/project/packages/flow-state-rewrite/src/definition/domain.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/runtime/host.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/public/root.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/react/component.ts", errors: [{ messageId: "rawTryCatch" }] },
		{ code: "try { work(); } catch (error) { report(error); }", filename: "/project/packages/flow-state-rewrite/src/server/adapter.ts", errors: [{ messageId: "rawTryCatch" }] },
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
			code: 'import * as Fx from "effect"; const value = Fx.Effect.tryPromise(() => Promise.resolve(1));',
			filename: "/project/packages/flow-state/src/core/domain.ts",
		},
		{
			code: 'import { Effect } from "effect"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/core/inspection/trace-artifact.ts",
		},
		{
			code: 'import { Effect } from "effect"; const value = Promise.resolve(1);',
			filename: "/project/packages/flow-state/src/server.ts",
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
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownEffect(Schema.String)(value); }',
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownExit(Schema.String)(value); }',
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownOption(Schema.String)(value); }',
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownPromise(Schema.String)(value); }',
		'import { Schema } from "effect"; function parseDomainValue(value: unknown) { return Schema.decodeUnknownResult(Schema.String)(value); }',
		'import { Schema as S } from "effect"; function parseDomainValue(value: unknown) { return S.decodeUnknownSync(S.String)(value); }',
		'import * as Fx from "effect"; function parseDomainValue(value: unknown) { return Fx.Schema.decodeUnknownSync(Fx.Schema.String)(value); }',
	],
	invalid: [
		{ code: "function parse(value: unknown) { return value; }", errors: [{ messageId: "unknownParameter" }] },
		{ code: "const Schema = { decodeUnknownSync: (value) => value }; function parse(value: unknown) { return Schema.decodeUnknownSync(value); }", errors: [{ messageId: "unknownParameter" }] },
		{ code: 'import { Schema } from "effect"; function parse(value: unknown) { return Schema.decode(Schema.String)(value); }', errors: [{ messageId: "unknownParameter" }] },
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
	valid: [
		"type Value = string;",
		"function outer() { type Value = string; return null as Value; }",
		"type AsyncPayload = Promise<unknown>; type UnknownList = Array<unknown>; type UnknownMap = Record<string, unknown>;",
		"type First = Second; type Second = First;",
	],
	invalid: [
		{ code: "type Value = string | unknown;", errors: [{ messageId: "unknownAlias" }] },
		{ code: "type Box<T> = T; type Value = Box<unknown>;", errors: [{ messageId: "unknownAlias" }] },
	],
});

let duplicateBranch = "unknown";
for (let index = 0; index < 20; index += 1) duplicateBranch = `Branch<${duplicateBranch}>`;
tester.run("no-unknown-type-aliases-performance", noUnknownTypeAliasesRule, {
	valid: [],
	invalid: [
		{
			code: `type Branch<T> = T | T; type Bad = ${duplicateBranch};`,
			errors: [{ messageId: "unknownAlias" }],
		},
	],
});

tester.run("no-unsafe-dictionary-type-regression", noUnsafeDictionaryTypeRule, {
	valid: ["const value: Record<string, string> = {};"],
	invalid: [
		{ code: "function make() { type Unknown = unknown; const value: Record<string, Unknown> = {}; return value; }", errors: [{ messageId: "unsafeDictionary" }] },
		{ code: "interface Value { id: string } function make() { interface Value {} const value: Record<string, Value> = {}; return value; }", errors: [{ messageId: "unsafeDictionary" }] },
	],
});

tester.run("no-object-type-regression", noObjectTypeRule, {
	valid: [
		{ code: "function read(value: { readonly id: string }): { readonly id: string } { return value; }", filename: "/project/packages/flow-state-rewrite/src/value.ts" },
		{ code: "const kind = typeof value; const text = \"object\";", filename: "/project/packages/flow-state-rewrite/src/value.ts" },
		{ code: "function read(value: object): object { return value; }", filename: "/project/packages/flow-state/src/value.ts" },
	],
	invalid: [
		{
			code: "function read(value: object): object { return value; }",
			filename: "/project/packages/flow-state-rewrite/src/value.ts",
			errors: [{ messageId: "objectType" }, { messageId: "objectType" }],
		},
		{
			code: "type Value = object; type Union = string | object; type Alias<T extends object = object> = T;",
			filename: "/project/packages/flow-state-rewrite/src/value.ts",
			errors: [
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
			],
		},
		{
			code: "type Generic = Array<object>; type Tuple = [object, ...object[]]; type Conditional<T> = T extends object ? object : never;",
			filename: "/project/packages/flow-state-rewrite/src/test/value.test.ts",
			errors: [
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
			],
		},
		{
			code: "type Properties = { value: object }; type MapValue = WeakMap<object, object>; type SetValue = WeakSet<object>;",
			filename: "/project/packages/flow-state-rewrite/src/value.ts",
			errors: [
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
				{ messageId: "objectType" },
			],
		},
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
		"type A<T> = T; type B<T> = A<T>; function safe(value: B<string>): string { return value; }",
		"type A<T> = T; type B<T> = A<Wrapper<T>>; function safe(value: B<string>): string { return \"x\"; }",
		"type Cycle<T> = Cycle<T>; function safe(value: Cycle<string>): string { return value; }",
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
		{ code: "type A<T> = T; type B<T> = A<T>; function find(value: B<undefined>): string { return \"x\"; }", errors: [{ messageId: "nullishContract" }] },
		{ code: "type A<T> = T; type B<T> = A<T>; function find(value: B<null>): string { return \"x\"; }", errors: [{ messageId: "nullishContract" }] },
		{ code: "type A<T> = T; type B<T> = A<Wrapper<T>>; function find(value: B<undefined>): string { return \"x\"; }", errors: [{ messageId: "nullishContract" }] },
		{ code: "type A<T> = T; type B<T> = A<[T]>; function find(value: B<undefined>): string { return \"x\"; }", errors: [{ messageId: "nullishContract" }] },
		{ code: "type A<T> = T; type B<T> = A<string | T>; function find(value: B<undefined>): string { return \"x\"; }", errors: [{ messageId: "nullishContract" }] },
		{
			code: [
				"type Recursive<T> = External<T>;",
				"type Overloaded<T> = {",
				"(value: Recursive<ReadonlyCanonical<T>>): T;",
				"(value: Recursive<ReadonlyCanonical<T>>, options?: T): T;",
				"};",
			].join(" "),
			errors: [{ messageId: "nullishContract" }],
		},
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
	invalid: [{ code: 'import { Effect } from "effect"; Effect.promise(work);', errors: [{ messageId: "promise" }] }],
});

tester.run("no-unjustified-effect-try-promise-regression", noUnjustifiedEffectTryPromiseRule, {
	valid: [
		{
			code: 'import { Effect } from "effect";\n// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: external Promise-only API.\nEffect.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
		},
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.tryPromise({ try: work, catch: String });',
			filename: "/project/packages/flow-state-rewrite/src/adapter.ts",
			errors: [{ messageId: "unjustified" }],
		},
	],
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
	["no-parallel-diagnostic-errors", noParallelDiagnosticErrorsRule],
	["no-direct-process-env", noDirectProcessEnvRule],
	["no-effect-promise", noEffectPromiseRule],
	["no-unjustified-effect-try-promise", noUnjustifiedEffectTryPromiseRule],
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
	["no-object-type", noObjectTypeRule],
	["no-optional-domain-properties", noOptionalDomainPropertiesRule],
	["no-package-dist-or-self-import-in-src", noPackageDistOrSelfImportInSrcRule],
	["no-promise-microtask-barrier", noPromiseMicrotaskBarrierRule],
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
	["no-unknown-effect-channel", noUnknownEffectChannelRule],
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

const returnTypeFilename = "/project/packages/flow-state-rewrite/src/example.ts";
tester.run("prefer-inferred-return-types", preferInferredReturnTypesRule, {
  valid: [
    { code: "const size = (text: string) => text.length;", filename: returnTypeFilename },
    { code: "type Read = () => string; interface Reader { read(): string; } declare function read(): string; abstract class Base { abstract read(): string; }", filename: returnTypeFilename },
    { code: "function size(): number; function size() { return 1; }", filename: returnTypeFilename },
    { code: "// RETURN_TYPE: Recursive inference requires an anchor.\nexport const depth = (n: number): number => n ? depth(n - 1) : 0;", filename: returnTypeFilename },
    { code: "// RETURN_TYPE: Exposes only the public view.\nexport default function read(): string { return 'value'; }", filename: returnTypeFilename },
    { code: "const reader = {\n// RETURN_TYPE: Preserves the readonly publication boundary.\nread(): readonly string[] { return []; }\n};", filename: returnTypeFilename },
    { code: "class Reader {\n// RETURN_TYPE: Defines the narrowing contract.\nread(value: unknown): value is string { return typeof value === 'string'; }\n}", filename: returnTypeFilename },
    { code: "class Reader {\n/* RETURN_TYPE: Preserves the public callback contract. */\nread = (): string => 'value';\n}", filename: returnTypeFilename },
    { code: "// RETURN_TYPE: Keeps the getter public type stable.\nfunction read(): string { return 'value'; }", filename: "C:\\project\\packages\\flow-state-rewrite\\src\\example.ts" },
    { code: "function read(): string { return 'value'; }", filename: "/project/packages/flow-state/src/example.ts" },
  ],
  invalid: [
    { code: "const value = (): number => 1;", filename: "/project/packages/flow-state-rewrite/test/static/medium.ts", errors: [{ messageId: "infer" }] },
    ...[
      "const size = (text: string): number => text.length;",
      "export function read(): string { return 'value'; }",
      "const read = function (): string { return 'value'; };",
      "const reader = { read(): string { return 'value'; } };",
      "class Reader { get value(): string { return 'value'; } }",
      "consume((): number => 1);",
      "const isText = (value: unknown): value is string => typeof value === 'string';",
      "function assertText(value: unknown): asserts value is string { if (typeof value !== 'string') throw Error(); }",
      "// RETURN_TYPE:\nconst read = (): string => 'value';",
      "// RETURN_TYPE:    \nconst read = (): string => 'value';",
      "// RETURN_TYPE: stale comment\n\nconst read = (): string => 'value';",
      "const previous = 1; // RETURN_TYPE: belongs to another statement\nconst read = (): string => 'value';",
      "// RETURN_TYPE: Outer signature has a required contract.\nconst outer = (): string => { const inner = (): string => 'value'; return inner(); };",
      "// RETURN_TYPE: Must not cover multiple declarations.\nconst a = (): string => 'a', b = () => 'b';",
    ].map((code) => ({ code, filename: returnTypeFilename, errors: [{ messageId: "infer" }] })),
  ],
});
