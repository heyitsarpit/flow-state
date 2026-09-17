import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

function isProgramDeclaration(node: ESTree.VariableDeclaration): boolean {
	return node.parent.type === "Program" || node.parent.type === "ExportNamedDeclaration";
}

function isPackageSource(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return /\/packages\/[^/]+\/src\//u.test(normalized);
}

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

function isMutableMapOrSet(expression: ESTree.Expression | null): boolean {
	if (expression === null) return false;
	const node = unwrapExpression(expression);
	if (
		node.type === "NewExpression" &&
		node.callee.type === "Identifier" &&
		(node.callee.name === "Map" || node.callee.name === "Set")
	)
		return true;
	if (
		node.type !== "CallExpression" ||
		node.callee.type !== "MemberExpression" ||
		node.callee.object.type !== "Identifier" ||
		node.callee.object.name !== "Object" ||
		node.callee.property.type !== "Identifier" ||
		node.callee.property.name !== "freeze"
	)
		return false;
	const firstArgument = node.arguments[0];
	return firstArgument !== undefined && firstArgument.type !== "SpreadElement"
		? isMutableMapOrSet(firstArgument)
		: false;
}

function declaresMutableMapOrSet(node: ESTree.VariableDeclaration): boolean {
	return node.declarations.some((declaration) => isMutableMapOrSet(declaration.init));
}

/** Keep mutable production state behind an explicit service, resource, or host owner. */
export const noTopLevelMutableProductionStateRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow top-level mutable production variables and Map/Set containers. Mutable caches and registries need an explicit owner and lifetime.",
		},
		messages: {
			topLevelMutable:
				"Do not keep mutable production state at module scope. Move mutable Map/Set caches and registries into an owning factory or service; keep module-local WeakMap/WeakSet stores only for object identity or provenance.",
		},
	},
	createOnce(context) {
		return {
			VariableDeclaration(node: ESTree.VariableDeclaration) {
				const mutableBinding = node.kind !== "const";
				if (
					node.declare === true ||
					!isPackageSource(context.filename) ||
					isTestSupportFile(context.filename) ||
					!isProgramDeclaration(node) ||
					(!mutableBinding && !declaresMutableMapOrSet(node))
				) {
					return;
				}
				context.report({ node, messageId: "topLevelMutable" });
			},
		};
	},
});
