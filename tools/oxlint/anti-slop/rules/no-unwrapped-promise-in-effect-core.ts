import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";
import type { Scope, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";
import { isEffectHostBoundaryFile, normalizedFilename } from "../shared/file-scope.ts";

const adapterNames = new Set(["async", "promise", "tryPromise"]);

function isAllowedBoundary(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	return (
		isEffectHostBoundaryFile(filename) ||
		normalized.endsWith("/src/core/inspection/trace-artifact.ts") ||
		normalized.endsWith("/src/core/scheduling/ready-work.ts")
	);
}

function isEffectAdapterCall(sourceCode: Parameters<typeof isImportedFromEffect>[0], node: ESTree.Node): boolean {
	if (node.type !== "CallExpression") return false;
	const callee = node.callee;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"])) &&
		callee.property.type === "Identifier" &&
		adapterNames.has(callee.property.name)
	);
}

function isInsideEffectAdapter(sourceCode: Parameters<typeof isImportedFromEffect>[0], node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (isEffectAdapterCall(sourceCode, current)) return true;
		current = current.parent;
	}
	return false;
}

function isGlobalPromise(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
	if (typeof sourceCode.getScope !== "function") return identifier.name === "Promise";
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable.defs.length === 0;
		scope = scope.upper;
	}
	return true;
}

function isPromiseCall(sourceCode: Parameters<typeof isImportedFromEffect>[0], callee: ESTree.Expression): boolean {
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "Promise" &&
		isGlobalPromise(sourceCode, callee.object) &&
		callee.property.type === "Identifier" &&
		["all", "race", "reject", "resolve"].includes(callee.property.name)
	);
}

/** Keep foreign Promise construction inside an explicit Effect adapter. */
export const noUnwrappedPromiseInEffectCoreRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow unwrapped Promise construction in Effect core; normalize foreign async work at the adapter boundary.",
		},
		messages: {
			promise:
				"This Promise escapes the Effect adapter boundary. Use object-form Effect.tryPromise in the named foreign adapter or Effect.async, or move the host conversion outward.",
		},
	},
	createOnce(context) {
		let allowedBoundary = false;
		let effectFile = false;

		const reportIfUnwrapped = (node: ESTree.Node) => {
			if (allowedBoundary || !effectFile) return;
			if (!isInsideEffectAdapter(context.sourceCode, node)) context.report({ node, messageId: "promise" });
		};

		return {
			Program(node: ESTree.Program) {
				allowedBoundary = isAllowedBoundary(context.filename);
				effectFile = node.body.some(
					(statement) =>
						statement.type === "ImportDeclaration" &&
						statement.importKind !== "type" &&
						(statement.specifiers.length === 0 ||
							statement.specifiers.some(
								(specifier) => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type",
							)) &&
						(statement.source.value === "effect" || statement.source.value.startsWith("effect/")),
				);
			},
			NewExpression(node: ESTree.NewExpression) {
				if (
					node.callee.type === "Identifier" &&
					node.callee.name === "Promise" &&
					isGlobalPromise(context.sourceCode, node.callee)
				) {
					reportIfUnwrapped(node);
				}
			},
			CallExpression(node: ESTree.CallExpression) {
				if (isPromiseCall(context.sourceCode, node.callee)) reportIfUnwrapped(node);
			},
		};
	},
});
