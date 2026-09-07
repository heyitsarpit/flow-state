import { preferInferredReturnTypesRule } from "./rules/prefer-inferred-return-types.ts";
import { eslintCompatPlugin } from "@oxlint/plugins";

import { noChainedTypeAssertionsRule } from "./rules/no-chained-type-assertions.ts";
import { noArrayFromThenMapRule } from "./rules/no-array-from-then-map.ts";
import { noConditionalEmptyObjectSpreadRule } from "./rules/no-conditional-empty-object-spread.ts";
import { noConditionalSingletonArraySpreadRule } from "./rules/no-conditional-singleton-array-spread.ts";
import { noContextTagRule } from "./rules/no-context-tag.ts";
// import { noDataTaggedErrorRule } from "./rules/no-data-taggederror.ts"; // Superseded by the Flow-State-specific Diagnostic rule.
import { noEffectPromiseRule } from "./rules/no-effect-promise.ts";
import { noEffectRunnerInDomainRule } from "./rules/no-effect-runner-in-domain.ts";
import { noEffectRefReadThenWriteRule } from "./rules/no-effect-ref-read-then-write.ts";
import { noUnjustifiedEffectTryPromiseRule } from "./rules/no-unjustified-effect-try-promise.ts";
import { noExcessiveCognitiveComplexityRule } from "./rules/no-excessive-cognitive-complexity.ts";
import { noEscapeHatchAssertionRule } from "./rules/no-escape-hatch-assertion.ts";
import { noExplicitAnyRule } from "./rules/no-explicit-any.ts";
import { noExpectInIfRule } from "./rules/no-expect-in-if.ts";
import { noForEachRule } from "./rules/no-for-each.ts";
import { noImplicitEffectConcurrencyRule } from "./rules/no-implicit-effect-concurrency.ts";
import { noInwardModuleDependencyRule } from "./rules/no-inward-module-dependency.ts";
import { noKnownValueWideningRule } from "./rules/no-known-value-widening.ts";
import { noInlineImportTypeQueryRule } from "./rules/no-inline-import-type-query.ts";
import { noModuleMockingRule } from "./rules/no-module-mocking.ts";
import { noNumericDurationRule } from "./rules/no-numeric-duration.ts";
import { noNestedConditionalExpressionRule } from "./rules/no-nested-conditional-expression.ts";
import { noNullishFunctionContractsRule } from "./rules/no-nullish-function-contracts.ts";
import { noObjectFreezeRule } from "./rules/no-object-freeze.ts";
import { noObjectTypeRule } from "./rules/no-object-type.ts";
import { noOptionalDomainPropertiesRule } from "./rules/no-optional-domain-properties.ts";
import { noAnonymousDefaultExportRule } from "./rules/no-anonymous-default-export.ts";
import { noDirectProcessEnvRule } from "./rules/no-direct-process-env.ts";
import { noGenericUtilityModuleRule } from "./rules/no-generic-utility-module.ts";
import { noGodServiceShapeRule } from "./rules/no-god-service-shape.ts";
import { noLargeProductionFileRule } from "./rules/no-large-production-file.ts";
import { noPackageDistOrSelfImportInSrcRule } from "./rules/no-package-dist-or-self-import-in-src.ts";
import { noRawTryCatchRule } from "./rules/no-raw-try-catch.ts";
import { noBivariantCallbackRule } from "./rules/no-bivariant-callback.ts";
// import { noEffectPromiseMicrotaskRule } from "./rules/no-effect-promise-microtask.ts"; // Superseded by no-effect-promise.
import { noLocalDefiniteAssignmentRule } from "./rules/no-local-definite-assignment.ts";
import { noPromiseMicrotaskBarrierRule } from "./rules/no-promise-microtask-barrier.ts";
import { noRedundantReadonlyWrapperRule } from "./rules/no-redundant-readonly-wrapper.ts";
import { noReflectApplyRule } from "./rules/no-reflect-apply.ts";
import { noReflectGetRule } from "./rules/no-reflect-get.ts";
import { noRuntimeTypeofRule } from "./rules/no-runtime-typeof.ts";
import { noShallowJsonDomainCastRule } from "./rules/no-shallow-json-domain-cast.ts";
import { noForbiddenTermInSymbolNamesRule } from "./rules/no-shape-in-symbol-names.ts";
import { noServiceShapeParameterExtractionRule } from "./rules/no-service-shape-parameter-extraction.ts";
import { noPublicEntrypointExportDriftRule } from "./rules/no-public-entrypoint-export-drift.ts";
import { noStagedObjectAssignRule } from "./rules/no-staged-object-assign.ts";
import { noSwallowedCleanupErrorRule } from "./rules/no-swallowed-cleanup-error.ts";
import { noTernaryIifeRule } from "./rules/no-ternary-iife.ts";
import { noThrowInEffectGenRule } from "./rules/no-throw-in-effect-gen.ts";
import { noTopLevelMutableProductionStateRule } from "./rules/no-top-level-mutable-production-state.ts";
import { noUnmanagedEffectScopeRule } from "./rules/no-unmanaged-effect-scope.ts";
import { noUnknownParametersRule } from "./rules/no-unknown-parameters.ts";
import { noUnknownReturnsRule } from "./rules/no-unknown-returns.ts";
import { noUnknownTypeAliasesRule } from "./rules/no-unknown-type-aliases.ts";
import { noUnwrappedPromiseInEffectCoreRule } from "./rules/no-unwrapped-promise-in-effect-core.ts";
import { noUnsafeDictionaryTypeRule } from "./rules/no-unsafe-dictionary-type.ts";
import { noUnsafeFiberMethodsRule } from "./rules/no-unsafe-fiber-methods.ts";
import { noWidenThenAssertRule } from "./rules/no-widen-then-assert.ts";
import { requireSafetyCommentForTypeAssertionRule } from "./rules/require-safety-comment-for-type-assertion.ts";
import { useConsistentTypeDefinitionsRule } from "./rules/use-consistent-type-definitions.ts";
import { useExportTypeRule } from "./rules/use-export-type.ts";
import { useImportTypeRule } from "./rules/use-import-type.ts";
import { noParallelDiagnosticErrorsRule } from "./rules/flow-state/no-parallel-diagnostic-errors.ts";
import { noUnknownEffectChannelRule } from "./rules/flow-state/no-unknown-effect-channel.ts";

/** Generic Oxlint rules that reject low-evidence and low-signal implementation patterns. */
const antiSlopPlugin = eslintCompatPlugin({
	meta: { name: "anti-slop" },
	rules: {
		"no-array-from-then-map": noArrayFromThenMapRule,
		"no-chained-type-assertions": noChainedTypeAssertionsRule,
		"no-conditional-empty-object-spread": noConditionalEmptyObjectSpreadRule,
		"no-conditional-singleton-array-spread": noConditionalSingletonArraySpreadRule,
		"no-bivariant-callback": noBivariantCallbackRule,
		"no-context-tag": noContextTagRule,
		"no-effect-promise": noEffectPromiseRule,
		// "no-effect-promise-microtask": noEffectPromiseMicrotaskRule, // Superseded by no-effect-promise.
		"no-unjustified-effect-try-promise": noUnjustifiedEffectTryPromiseRule,
		"no-effect-runner-in-domain": noEffectRunnerInDomainRule,
		"no-effect-ref-read-then-write": noEffectRefReadThenWriteRule,
		"no-excessive-cognitive-complexity": noExcessiveCognitiveComplexityRule,
		"no-escape-hatch-assertion": noEscapeHatchAssertionRule,
		"no-explicit-any": noExplicitAnyRule,
		"no-expect-in-if": noExpectInIfRule,
		"no-for-each": noForEachRule,
		"no-inward-module-dependency": noInwardModuleDependencyRule,
		"no-implicit-effect-concurrency": noImplicitEffectConcurrencyRule,
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
		"no-redundant-readonly-wrapper": noRedundantReadonlyWrapperRule,
		"prefer-inferred-return-types": preferInferredReturnTypesRule,
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
		"no-top-level-mutable-production-state": noTopLevelMutableProductionStateRule,
		"no-unmanaged-effect-scope": noUnmanagedEffectScopeRule,
		"no-shape-in-symbol-names": noForbiddenTermInSymbolNamesRule,
		"no-unknown-parameters": noUnknownParametersRule,
		"no-unknown-returns": noUnknownReturnsRule,
		"no-unknown-type-aliases": noUnknownTypeAliasesRule,
		"no-unwrapped-promise-in-effect-core": noUnwrappedPromiseInEffectCoreRule,
		"no-unsafe-fiber-methods": noUnsafeFiberMethodsRule,
		"no-parallel-diagnostic-errors": noParallelDiagnosticErrorsRule,
		"no-unknown-effect-channel": noUnknownEffectChannelRule,
		"no-widen-then-assert": noWidenThenAssertRule,
		"require-safety-comment-for-type-assertion": requireSafetyCommentForTypeAssertionRule,
		"use-consistent-type-definitions": useConsistentTypeDefinitionsRule,
		"use-export-type": useExportTypeRule,
		"use-import-type": useImportTypeRule,
	},
});

export default antiSlopPlugin;
