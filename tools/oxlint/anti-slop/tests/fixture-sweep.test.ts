import { readFileSync } from "node:fs";
import type { Rule } from "@oxlint/plugins";
import { createRuleTester } from "../shared/test/rule-tester.ts";
import { noArrayFilterMapRule } from "../rules/general-typescript/no-array-filter-map.ts";
import { noArrayFromThenMapRule } from "../rules/general-typescript/no-array-from-then-map.ts";
import { noBivariantCallbackRule } from "../rules/general-typescript/no-bivariant-callback.ts";
import { noChainedTypeAssertionsRule } from "../rules/general-typescript/no-chained-type-assertions.ts";
import { noConditionalEmptyObjectSpreadRule } from "../rules/general-typescript/no-conditional-empty-object-spread.ts";
import { noConditionalArraySpreadRule } from "../rules/general-typescript/no-conditional-array-spread.ts";
import { noContextTagRule } from "../rules/effect/no-context-tag.ts";
import { noManualEffectErrorTagRule } from "../rules/effect/no-manual-effect-error-tag.ts";
import { noManualTagComparisonRule } from "../rules/effect/no-manual-tag-comparison.ts";
import { noParallelDiagnosticErrorsRule } from "../rules/flow-state/no-parallel-diagnostic-errors.ts";
import { noDirectProcessEnvRule } from "../rules/general-typescript/no-direct-process-env.ts";
import { noEffectPromiseRule } from "../rules/effect/no-effect-promise.ts";
import { noEagerStatefulEffectSucceedRule } from "../rules/effect/no-eager-stateful-effect-succeed.ts";
import { noExpectedFailureAsDefectRule } from "../rules/effect/no-expected-failure-as-defect.ts";
import { noConstantEffectFlatMapRule } from "../rules/effect/no-constant-effect-flatmap.ts";
import { noEmptyContextMakeUnsafeRule } from "../rules/effect/no-empty-context-make-unsafe.ts";
import { noStatefulEffectConstructionRule } from "../rules/effect/no-stateful-effect-construction.ts";
import { noPublicRuntimeInfrastructureRule } from "../rules/effect/no-public-runtime-infrastructure.ts";
import { noObjectIterationResultCastRule } from "../rules/effect/no-object-iteration-result-cast.ts";
import { noUnjustifiedEffectTryPromiseRule } from "../rules/effect/no-unjustified-effect-try-promise.ts";
import { noEffectPromiseMicrotaskRule } from "../rules/effect/no-effect-promise-microtask.ts";
import { noEffectRunnerInDomainRule } from "../rules/effect/no-effect-runner-in-domain.ts";
import { noEffectRefReadThenWriteRule } from "../rules/effect/no-effect-ref-read-then-write.ts";
import { noEscapeHatchAssertionRule } from "../rules/general-typescript/no-escape-hatch-assertion.ts";
import { noExplicitAnyRule } from "../rules/general-typescript/no-explicit-any.ts";
import { noExpectInIfRule } from "../rules/general-typescript/no-expect-in-if.ts";
import { noForEachRule } from "../rules/general-typescript/no-for-each.ts";
import { noGenericUtilityModuleRule } from "../rules/general-typescript/no-generic-utility-module.ts";
import { noGodServiceShapeRule } from "../rules/general-typescript/no-god-service-shape.ts";
import { noImplicitEffectConcurrencyRule } from "../rules/effect/no-implicit-effect-concurrency.ts";
import { noInwardModuleDependencyRule } from "../rules/general-typescript/no-inward-module-dependency.ts";
import { noInlineImportTypeQueryRule } from "../rules/general-typescript/no-inline-import-type-query.ts";
import { noKnownValueWideningRule } from "../rules/general-typescript/no-known-value-widening.ts";
import { noLocalDefiniteAssignmentRule } from "../rules/general-typescript/no-local-definite-assignment.ts";
import { noLargeProductionFileRule } from "../rules/general-typescript/no-large-production-file.ts";
import { noModuleMockingRule } from "../rules/general-typescript/no-module-mocking.ts";
import { noNumericDurationRule } from "../rules/effect/no-numeric-duration.ts";
import { noNestedConditionalExpressionRule } from "../rules/general-typescript/no-nested-conditional-expression.ts";
import { noNullishFunctionContractsRule } from "../rules/general-typescript/no-nullish-function-contracts.ts";
import { noObjectFreezeRule } from "../rules/general-typescript/no-object-freeze.ts";
import { noObjectTypeRule } from "../rules/general-typescript/no-object-type.ts";
import { noOptionalDomainPropertiesRule } from "../rules/general-typescript/no-optional-domain-properties.ts";
import { noPackageDistOrSelfImportInSrcRule } from "../rules/general-typescript/no-package-dist-or-self-import-in-src.ts";
import { noPromiseMicrotaskBarrierRule } from "../rules/general-typescript/no-promise-microtask-barrier.ts";
import { noPublicEntrypointExportDriftRule } from "../rules/general-typescript/no-public-entrypoint-export-drift.ts";
import { noRawTryCatchRule } from "../rules/general-typescript/no-raw-try-catch.ts";
import { noReadonlyRule } from "../rules/general-typescript/no-readonly.ts";
import { noReduceAccumulatorCopyRule } from "../rules/general-typescript/no-reduce-accumulator-copy.ts";
import { noReflectApplyRule } from "../rules/general-typescript/no-reflect-apply.ts";
import { noReflectGetRule } from "../rules/general-typescript/no-reflect-get.ts";
import { noRuntimeTypeofRule } from "../rules/general-typescript/no-runtime-typeof.ts";
import { noServiceShapeParameterExtractionRule } from "../rules/effect/no-service-shape-parameter-extraction.ts";
import { noForbiddenTermInSymbolNamesRule } from "../rules/general-typescript/no-shape-in-symbol-names.ts";
import { noStagedObjectAssignRule } from "../rules/general-typescript/no-staged-object-assign.ts";
import { noSwallowedCleanupErrorRule } from "../rules/general-typescript/no-swallowed-cleanup-error.ts";
import { noTernaryIifeRule } from "../rules/general-typescript/no-ternary-iife.ts";
import { noThrowInEffectGenRule } from "../rules/effect/no-throw-in-effect-gen.ts";
import { noTopLevelMutableProductionStateRule } from "../rules/general-typescript/no-top-level-mutable-production-state.ts";
import { noUnmanagedEffectScopeRule } from "../rules/effect/no-unmanaged-effect-scope.ts";
import { noUnknownRule } from "../rules/general-typescript/no-unknown.ts";
import { noUnsafeDictionaryTypeRule } from "../rules/general-typescript/no-unsafe-dictionary-type.ts";
import { noUnsafeFiberMethodsRule } from "../rules/effect/no-unsafe-fiber-methods.ts";
import { noUnwrappedPromiseInEffectCoreRule } from "../rules/effect/no-unwrapped-promise-in-effect-core.ts";
import { noWidenThenAssertRule } from "../rules/general-typescript/no-widen-then-assert.ts";
import { requireSafetyCommentForTypeAssertionRule } from "../rules/general-typescript/require-safety-comment-for-type-assertion.ts";
import { useExportTypeRule } from "../rules/general-typescript/use-export-type.ts";
import { useImportTypeRule } from "../rules/general-typescript/use-import-type.ts";

const tester = createRuleTester("preferred fixture sweep");
const preferredFixture = readFileSync(new URL("../fixtures/all-preferred-patterns.ts", import.meta.url), "utf8");
const rawFixtureMarker = "// anti-slop-fixture: text-only";
if (!preferredFixture.startsWith(rawFixtureMarker)) {
	throw new Error(`Preferred fixture must begin with ${rawFixtureMarker}.`);
}
const preferredFixtureRules: ReadonlyArray<readonly [string, Rule]> = [
	["no-array-filter-map", noArrayFilterMapRule],
	["no-array-from-then-map", noArrayFromThenMapRule],
	["no-bivariant-callback", noBivariantCallbackRule],
	["no-chained-type-assertions", noChainedTypeAssertionsRule],
	["no-conditional-empty-object-spread", noConditionalEmptyObjectSpreadRule],
	["no-conditional-array-spread", noConditionalArraySpreadRule],
	["no-context-tag", noContextTagRule],
	["no-parallel-diagnostic-errors", noParallelDiagnosticErrorsRule],
	["no-direct-process-env", noDirectProcessEnvRule],
	["no-effect-promise", noEffectPromiseRule],
	["no-eager-stateful-effect-succeed", noEagerStatefulEffectSucceedRule],
	["no-expected-failure-as-defect", noExpectedFailureAsDefectRule],
	["no-constant-effect-flatmap", noConstantEffectFlatMapRule],
	["no-empty-context-make-unsafe", noEmptyContextMakeUnsafeRule],
	["no-stateful-effect-construction", noStatefulEffectConstructionRule],
	["no-public-runtime-infrastructure", noPublicRuntimeInfrastructureRule],
	["no-object-iteration-result-cast", noObjectIterationResultCastRule],
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
	["no-manual-effect-error-tag", noManualEffectErrorTagRule],
	["no-manual-tag-comparison", noManualTagComparisonRule],
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
	["no-readonly", noReadonlyRule],
	["no-reduce-accumulator-copy", noReduceAccumulatorCopyRule],
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

tester.run("path-correct preferred fixture: no-parallel-diagnostic-errors", noParallelDiagnosticErrorsRule, {
	valid: [
		{
			code: preferredFixture,
			filename: "/project/packages/flow-state-rewrite/src/preferred-fixture.ts",
		},
	],
	invalid: [],
});

tester.run("path-correct preferred fixture: no-unknown", noUnknownRule, {
	valid: [
		{
			code: preferredFixture,
			filename: "/project/packages/flow-state-rewrite/src/preferred-fixture.ts",
			options: [
				{
					sourceRoots: ["packages/flow-state-rewrite/src"],
					allowedSchemaFields: [
						{
							file: "packages/flow-state-rewrite/src/operation/resource.ts",
							fields: ["gcTime", "staleTime"],
						},
					],
				},
			],
		},
	],
	invalid: [],
});

tester.run("failing fixture sentinels: no-parallel-diagnostic-errors", noParallelDiagnosticErrorsRule, {
	valid: [],
	invalid: [
		{
			code: `import { Data, Schema } from "effect";
class FeatureFailure extends Data.TaggedError("FeatureFailure") {}
class AnotherFeatureFailure extends Schema.TaggedError<AnotherFeatureFailure>()("AnotherFeatureFailure", {}) {}
class LegacyFeatureError extends Error {}`,
			filename: "/project/packages/flow-state-rewrite/src/fixture.ts",
			errors: [{ messageId: "parallel" }, { messageId: "parallel" }, { messageId: "parallel" }],
		},
	],
});

tester.run("failing fixture sentinels: no-unknown", noUnknownRule, {
	valid: [],
	invalid: [
		{
			code: 'import { Effect } from "effect"; type Bad = Effect.Effect<string, unknown, unknown>;',
			filename: "/project/packages/flow-state-rewrite/src/fixture.ts",
			errors: [{ messageId: "unknown" }, { messageId: "unknown" }],
		},
	],
});
