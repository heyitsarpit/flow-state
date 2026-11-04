import { eslintCompatPlugin } from "@oxlint/plugins";

import { noAnonymousDefaultExportRule } from "./rules/typescript/no-anonymous-default-export.ts";
import { noArrayFromThenMapRule } from "./rules/typescript/no-array-from-then-map.ts";
import { noBivariantCallbackRule } from "./rules/typescript/no-bivariant-callback.ts";
import { noChainedTypeAssertionsRule } from "./rules/typescript/no-chained-type-assertions.ts";
import { noConditionalEmptyObjectSpreadRule } from "./rules/typescript/no-conditional-empty-object-spread.ts";
import { noConditionalArraySpreadRule } from "./rules/typescript/no-conditional-array-spread.ts";
import { noDirectProcessEnvRule } from "./rules/typescript/no-direct-process-env.ts";
import { noEscapeHatchAssertionRule } from "./rules/typescript/no-escape-hatch-assertion.ts";
import { noExcessiveCognitiveComplexityRule } from "./rules/typescript/no-excessive-cognitive-complexity.ts";
import { noExplicitAnyRule } from "./rules/typescript/no-explicit-any.ts";
import { noExpectInIfRule } from "./rules/typescript/no-expect-in-if.ts";
import { noForEachRule } from "./rules/typescript/no-for-each.ts";
import { noGenericUtilityModuleRule } from "./rules/typescript/no-generic-utility-module.ts";
import { noGodServiceShapeRule } from "./rules/typescript/no-god-service-shape.ts";
import { noInlineImportTypeQueryRule } from "./rules/typescript/no-inline-import-type-query.ts";
import { noInwardModuleDependencyRule } from "./rules/typescript/no-inward-module-dependency.ts";
import { noKnownValueWideningRule } from "./rules/typescript/no-known-value-widening.ts";
import { noLargeProductionFileRule } from "./rules/typescript/no-large-production-file.ts";
import { noLocalDefiniteAssignmentRule } from "./rules/typescript/no-local-definite-assignment.ts";
import { noModuleMockingRule } from "./rules/typescript/no-module-mocking.ts";
import { noNestedConditionalExpressionRule } from "./rules/typescript/no-nested-conditional-expression.ts";
import { noNullishFunctionContractsRule } from "./rules/typescript/no-nullish-function-contracts.ts";
import { noObjectFreezeRule } from "./rules/typescript/no-object-freeze.ts";
import { noObjectTypeRule } from "./rules/typescript/no-object-type.ts";
import { noOptionalDomainPropertiesRule } from "./rules/typescript/no-optional-domain-properties.ts";
import { noPackageDistOrSelfImportInSrcRule } from "./rules/typescript/no-package-dist-or-self-import-in-src.ts";
import { noPublicEntrypointExportDriftRule } from "./rules/typescript/no-public-entrypoint-export-drift.ts";
import { noPromiseMicrotaskBarrierRule } from "./rules/typescript/no-promise-microtask-barrier.ts";
import { noRawTryCatchRule } from "./rules/typescript/no-raw-try-catch.ts";
import { noReadonlyRule } from "./rules/typescript/no-readonly.ts";
import { noReduceAccumulatorCopyRule } from "./rules/typescript/no-reduce-accumulator-copy.ts";
import { noRedundantReadonlyWrapperRule } from "./rules/typescript/no-redundant-readonly-wrapper.ts";
import { noReflectApplyRule } from "./rules/typescript/no-reflect-apply.ts";
import { noReflectGetRule } from "./rules/typescript/no-reflect-get.ts";
import { noRuntimeTypeofRule } from "./rules/typescript/no-runtime-typeof.ts";
import { noShallowJsonDomainCastRule } from "./rules/typescript/no-shallow-json-domain-cast.ts";
import { noForbiddenTermInSymbolNamesRule } from "./rules/typescript/no-shape-in-symbol-names.ts";
import { noStagedObjectAssignRule } from "./rules/typescript/no-staged-object-assign.ts";
import { noSwallowedCleanupErrorRule } from "./rules/typescript/no-swallowed-cleanup-error.ts";
import { noTernaryIifeRule } from "./rules/typescript/no-ternary-iife.ts";
import { noUnknownRule } from "./rules/typescript/no-unknown.ts";
import { noUnsafeDictionaryTypeRule } from "./rules/typescript/no-unsafe-dictionary-type.ts";
import { noWidenThenAssertRule } from "./rules/typescript/no-widen-then-assert.ts";
import { preferInferredReturnTypesRule } from "./rules/typescript/prefer-inferred-return-types.ts";
import { requireReadableSpacingRule } from "./rules/typescript/require-readable-spacing.ts";
import { requireSafetyCommentForTypeAssertionRule } from "./rules/typescript/require-safety-comment-for-type-assertion.ts";
import { useConsistentTypeDefinitionsRule } from "./rules/typescript/use-consistent-type-definitions.ts";
import { useExportTypeRule } from "./rules/typescript/use-export-type.ts";
import { useImportTypeRule } from "./rules/typescript/use-import-type.ts";
import { noConstantEffectFlatMapRule } from "./rules/effect/no-constant-effect-flatmap.ts";
import { noContextTagRule } from "./rules/effect/no-context-tag.ts";
import { noEagerStatefulEffectSucceedRule } from "./rules/effect/no-eager-stateful-effect-succeed.ts";
import { noEffectPromiseRule } from "./rules/effect/no-effect-promise.ts";
import { noEffectRefReadThenWriteRule } from "./rules/effect/no-effect-ref-read-then-write.ts";
import { noEffectRunnerInDomainRule } from "./rules/effect/no-effect-runner-in-domain.ts";
import { noEmptyContextMakeUnsafeRule } from "./rules/effect/no-empty-context-make-unsafe.ts";
import { noImplicitEffectConcurrencyRule } from "./rules/effect/no-implicit-effect-concurrency.ts";
import { noManualEffectErrorTagRule } from "./rules/effect/no-manual-effect-error-tag.ts";
import { noManualTagComparisonRule } from "./rules/effect/no-manual-tag-comparison.ts";
import { noNumericDurationRule } from "./rules/effect/no-numeric-duration.ts";
import { noObjectIterationResultCastRule } from "./rules/effect/no-object-iteration-result-cast.ts";
import { preferEffectNativeTaggedTypesRule } from "./rules/effect/prefer-effect-native-tagged-types.ts";
import { noServiceShapeParameterExtractionRule } from "./rules/effect/no-service-shape-parameter-extraction.ts";
import { noModuleLevelMutableStateRule } from "./rules/effect/no-module-level-mutable-state.ts";
import { noStatefulEffectConstructionRule } from "./rules/effect/no-stateful-effect-construction.ts";
import { noThrowInEffectGenRule } from "./rules/effect/no-throw-in-effect-gen.ts";
import { noUnjustifiedEffectTryPromiseRule } from "./rules/effect/no-unjustified-effect-try-promise.ts";
import { noUnmanagedEffectScopeRule } from "./rules/effect/no-unmanaged-effect-scope.ts";
import { noUnsafeFiberMethodsRule } from "./rules/effect/no-unsafe-fiber-methods.ts";
import { noUnwrappedPromiseInEffectCoreRule } from "./rules/effect/no-unwrapped-promise-in-effect-core.ts";

/** Generic Oxlint rules that reject low-evidence and low-signal implementation patterns. */
const lintBombPlugin = eslintCompatPlugin({
	meta: { name: "lint-bomb" },
	rules: {
		"no-array-from-then-map": noArrayFromThenMapRule,
		"no-chained-type-assertions": noChainedTypeAssertionsRule,
		"no-conditional-empty-object-spread": noConditionalEmptyObjectSpreadRule,
		"no-conditional-array-spread": noConditionalArraySpreadRule,
		"no-bivariant-callback": noBivariantCallbackRule,
		"no-context-tag": noContextTagRule,
		"no-effect-promise": noEffectPromiseRule,
		"no-unjustified-effect-try-promise": noUnjustifiedEffectTryPromiseRule,
		"no-effect-runner-in-domain": noEffectRunnerInDomainRule,
		"no-module-level-mutable-state": noModuleLevelMutableStateRule,
		"no-stateful-effect-construction": noStatefulEffectConstructionRule,
		"no-eager-stateful-effect-succeed": noEagerStatefulEffectSucceedRule,
		"no-constant-effect-flatmap": noConstantEffectFlatMapRule,
		"no-empty-context-make-unsafe": noEmptyContextMakeUnsafeRule,
		"no-object-iteration-result-cast": noObjectIterationResultCastRule,
		"prefer-effect-native-tagged-types": preferEffectNativeTaggedTypesRule,
		"no-effect-ref-read-then-write": noEffectRefReadThenWriteRule,
		"no-excessive-cognitive-complexity": noExcessiveCognitiveComplexityRule,
		"no-escape-hatch-assertion": noEscapeHatchAssertionRule,
		"no-explicit-any": noExplicitAnyRule,
		"no-expect-in-if": noExpectInIfRule,
		"no-for-each": noForEachRule,
		"no-inward-module-dependency": noInwardModuleDependencyRule,
		"no-implicit-effect-concurrency": noImplicitEffectConcurrencyRule,
		"no-manual-effect-error-tag": noManualEffectErrorTagRule,
		"no-manual-tag-comparison": noManualTagComparisonRule,
		"no-known-value-widening": noKnownValueWideningRule,
		"no-inline-import-type-query": noInlineImportTypeQueryRule,
		"no-local-definite-assignment": noLocalDefiniteAssignmentRule,
		"no-module-mocking": noModuleMockingRule,
		"no-numeric-duration": noNumericDurationRule,
		"no-nested-conditional-expression": noNestedConditionalExpressionRule,
		"no-nullish-function-contracts": noNullishFunctionContractsRule,
		"no-object-freeze": noObjectFreezeRule,
		"no-anonymous-default-export": noAnonymousDefaultExportRule,
		"no-direct-process-env": noDirectProcessEnvRule,
		"no-generic-utility-module": noGenericUtilityModuleRule,
		"no-god-service-shape": noGodServiceShapeRule,
		"no-large-production-file": noLargeProductionFileRule,
		"no-object-type": noObjectTypeRule,
		"no-optional-domain-properties": noOptionalDomainPropertiesRule,
		"no-package-dist-or-self-import-in-src": noPackageDistOrSelfImportInSrcRule,
		"no-raw-try-catch": noRawTryCatchRule,
		"no-promise-microtask-barrier": noPromiseMicrotaskBarrierRule,
		"no-readonly": noReadonlyRule,
		"no-reduce-accumulator-copy": noReduceAccumulatorCopyRule,
		"no-redundant-readonly-wrapper": noRedundantReadonlyWrapperRule,
		"prefer-inferred-return-types": preferInferredReturnTypesRule,
		"require-readable-spacing": requireReadableSpacingRule,
		"no-reflect-apply": noReflectApplyRule,
		"no-reflect-get": noReflectGetRule,
		"no-runtime-typeof": noRuntimeTypeofRule,
		"no-shallow-json-domain-cast": noShallowJsonDomainCastRule,
		"no-service-shape-parameter-extraction": noServiceShapeParameterExtractionRule,
		"no-public-entrypoint-export-drift": noPublicEntrypointExportDriftRule,
		"no-staged-object-assign": noStagedObjectAssignRule,
		"no-unsafe-dictionary-type": noUnsafeDictionaryTypeRule,
		"no-swallowed-cleanup-error": noSwallowedCleanupErrorRule,
		"no-ternary-iife": noTernaryIifeRule,
		"no-throw-in-effect-gen": noThrowInEffectGenRule,
		"no-unmanaged-effect-scope": noUnmanagedEffectScopeRule,
		"no-shape-in-symbol-names": noForbiddenTermInSymbolNamesRule,
		"no-unknown": noUnknownRule,
		"no-unwrapped-promise-in-effect-core": noUnwrappedPromiseInEffectCoreRule,
		"no-unsafe-fiber-methods": noUnsafeFiberMethodsRule,
		"no-widen-then-assert": noWidenThenAssertRule,
		"require-safety-comment-for-type-assertion": requireSafetyCommentForTypeAssertionRule,
		"use-consistent-type-definitions": useConsistentTypeDefinitionsRule,
		"use-export-type": useExportTypeRule,
		"use-import-type": useImportTypeRule,
	},
});

export default lintBombPlugin;
