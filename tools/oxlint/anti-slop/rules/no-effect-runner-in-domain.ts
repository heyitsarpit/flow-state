import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";
import { isInsideEffectWorkflow } from "../shared/effect-workflow.ts";
import { isEffectHostBoundaryFile, normalizedFilename } from "../shared/file-scope.ts";

const runnerNames = new Set([
	"runFork",
	"runForkWith",
	"runCallback",
	"runCallbackWith",
	"runPromise",
	"runPromiseExit",
	"runPromiseExitWith",
	"runPromiseWith",
	"runSync",
	"runSyncExit",
	"runSyncExitWith",
	"runSyncWith",
]);

const runnerOwners = new Set(["Effect", "Runtime", "ManagedRuntime"]);

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression" ||
		current.type === "TSInstantiationExpression"
	) {
		current = current.expression;
	}
	return current;
}

function memberName(expression: ESTree.MemberExpression): string | null {
	if (!expression.computed && expression.property.type === "Identifier") return expression.property.name;
	if (!expression.computed) return null;
	if (expression.property.type === "Literal" && typeof expression.property.value === "string") {
		return expression.property.value;
	}
	return expression.property.type === "TemplateLiteral" && expression.property.expressions.length === 0 && expression.property.quasis.length === 1
		? expression.property.quasis[0]?.value.cooked ?? expression.property.quasis[0]?.value.raw ?? null
		: null;
}

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | null {
	if (typeof sourceCode.getScope !== "function") return null;
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function variableInitializer(variable: Variable): ESTree.Expression | null {
	if (variable.defs.length !== 1) return null;
	const definition = variable.defs[0];
	if (
		definition?.type !== "Variable" ||
		definition.node.type !== "VariableDeclarator" ||
		definition.parent?.type !== "VariableDeclaration" ||
		definition.parent.kind !== "const" ||
		variable.references.some((reference) => reference.isWrite() && !reference.init)
	) {
		return null;
	}
	return definition.node.type === "VariableDeclarator"
		? definition.node.id.type === "Identifier"
			? definition.node.init
			: null
		: null;
}

function isImportedEffectAlias(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	allowedNames: ReadonlySet<string>,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const unwrapped = unwrapExpression(expression);
	if (isImportedFromEffect(sourceCode, unwrapped, allowedNames)) return true;
	if (unwrapped.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return false;
	const initializer = variableInitializer(variable);
	return initializer !== null && isImportedEffectAlias(sourceCode, initializer, allowedNames, new Set([...seen, variable]));
}

function variableBindingInitializer(
	variable: Variable,
	identifier: ESTree.IdentifierReference,
): ESTree.Expression | null {
	if (variable.defs.length !== 1) return null;
	const definition = variable.defs[0];
	if (
		definition?.type !== "Variable" ||
		definition.node.type !== "VariableDeclarator" ||
		definition.parent?.type !== "VariableDeclaration" ||
		definition.parent.kind !== "const" ||
		variable.references.some((reference) => reference.isWrite() && !reference.init)
	) {
		return null;
	}
	const declarator = definition.node;
	if (declarator.id.type === "Identifier") return declarator.init;
	if (declarator.id.type !== "ObjectPattern") return null;
	for (const property of declarator.id.properties) {
		if (
			property.type === "Property" &&
			property.value.type === "Identifier" &&
			property.value.name === identifier.name
		) {
			const key = property.computed
				? property.key.type === "Literal" && typeof property.key.value === "string"
					? property.key.value
					: null
				: property.key.type === "Identifier"
					? property.key.name
					: null;
				return key !== null && runnerNames.has(key) ? declarator.init : null;
		}
	}
	return null;
}

function isManagedRuntimeMake(
	sourceCode: SourceCode,
	callee: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const unwrapped = unwrapExpression(callee);
	if (
		unwrapped.type === "MemberExpression" &&
		memberName(unwrapped) === "make" &&
		isImportedEffectAlias(sourceCode, unwrapped.object, new Set(["ManagedRuntime"]))
	) {
		return true;
	}
	if (unwrapped.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return false;
	const initializer = variableInitializer(variable);
	if (initializer !== null && isManagedRuntimeMake(sourceCode, initializer, new Set([...seen, variable]))) return true;
	return (
		initializer === null &&
		variableBindingInitializer(variable, unwrapped) !== null &&
		isManagedRuntimeMake(
			sourceCode,
			variableBindingInitializer(variable, unwrapped) as ESTree.Expression,
			new Set([...seen, variable]),
		)
	);
}

function isManagedRuntimeInstance(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return false;
	const initializer = variableInitializer(variable) ?? variableBindingInitializer(variable, unwrapped);
	if (initializer === null) return false;
	const value = unwrapExpression(initializer);
	if (value.type === "CallExpression" && isManagedRuntimeMake(sourceCode, value.callee, new Set([...seen, variable]))) {
		return true;
	}
	return isManagedRuntimeInstance(sourceCode, initializer, new Set([...seen, variable]));
}

function isRunnerReceiver(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	return (
		isImportedEffectAlias(sourceCode, expression, runnerOwners) ||
		isManagedRuntimeInstance(sourceCode, expression, seen)
	);
}

function isRunnerReference(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type === "MemberExpression") {
		const method = memberName(unwrapped);
		if (method === "call" || method === "apply" || method === "bind") {
			return isRunnerReference(sourceCode, unwrapped.object, seen);
		}
		return method !== null && runnerNames.has(method) && isRunnerReceiver(sourceCode, unwrapped.object, seen);
	}
	if (unwrapped.type === "CallExpression") {
		if (isRunnerWithFactoryInvocation(sourceCode, unwrapped)) return true;
		return isRunnerReference(sourceCode, unwrapped.callee, seen);
	}
	if (unwrapped.type !== "Identifier") return false;
	if (isImportedFromEffect(sourceCode, unwrapped, runnerNames)) return true;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return false;
	const directInitializer = variableInitializer(variable);
	if (directInitializer !== null) {
		return isRunnerReference(sourceCode, directInitializer, new Set([...seen, variable]));
	}
	const bindingInitializer = variableBindingInitializer(variable, unwrapped);
	return bindingInitializer !== null && isRunnerReceiver(sourceCode, bindingInitializer, new Set([...seen, variable]));
}

function isRunnerWithFactoryInvocation(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
	const callee = unwrapExpression(node.callee);
	return (
		callee.type === "MemberExpression" &&
		memberName(callee)?.endsWith("With") === true &&
		runnerNames.has(memberName(callee) ?? "") &&
		isRunnerReceiver(sourceCode, callee.object)
	);
}

function isBoundRunnerFactoryInvocation(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
	const callee = unwrapExpression(node.callee);
	return (
		callee.type === "MemberExpression" &&
		memberName(callee) === "bind" &&
		isRunnerReference(sourceCode, callee.object)
	);
}

function isAllowedBoundary(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return (
		isEffectHostBoundaryFile(filename) ||
		normalized.endsWith("/src/public/root.ts") ||
		normalized.endsWith("/src/public/runtime.ts") ||
		normalized.endsWith("/src/core/orchestrator/orchestrator-system.ts") ||
		normalized.endsWith("/src/core/runtime/services/host-signals.ts")
	);
}

/** Keep the single Effect execution edge at a runtime or final host owner. */
export const noEffectRunnerInDomainRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Effect runners in composable Flow State code while allowing final runtime and host adapters.",
		},
		messages: {
			runner: "Do not run an Effect here. Return it to the Runtime host boundary.",
			nestedRunner: "Do not start another Effect runtime inside an Effect workflow. Yield this Effect.",
		},
	},
	createOnce(context) {
		let allowedBoundary = false;
		return {
			Program() {
				allowedBoundary = isAllowedBoundary(context.filename);
			},
			CallExpression(node: ESTree.CallExpression) {
				if (
					isRunnerWithFactoryInvocation(context.sourceCode, node) ||
					isBoundRunnerFactoryInvocation(context.sourceCode, node)
				) return;
				if (!isRunnerReference(context.sourceCode, node.callee)) return;
				if (isInsideEffectWorkflow(context.sourceCode, node)) {
					context.report({ node, messageId: "nestedRunner" });
					return;
				}
				if (!allowedBoundary) context.report({ node, messageId: "runner" });
			},
		};
	},
});
