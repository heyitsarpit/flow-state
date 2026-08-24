import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../shared/file-scope.ts";

type RuleOptions = [{ sourceRoot?: string; sourceRoots?: string[]; allowedPathFragments?: string[] }];

const defaultOptions: RuleOptions = [
	{
		sourceRoot: "packages/flow-state/src",
		allowedPathFragments: ["/src/cli/", "/src/runtime/", "/src/server/", "/src/host/"],
	},
];

function normalized(value: string): string {
	return value.replaceAll("\\", "/");
}

function isGlobalIdentifier(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
	if (typeof sourceCode.getScope !== "function") return true;
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable.defs.length === 0;
		scope = scope.upper;
	}
	return true;
}

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function isProcessExpression(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	visited = new Set<Variable>(),
): boolean {
	if (expression.type === "Identifier") {
		if (expression.name === "process" && isGlobalIdentifier(sourceCode, expression)) return true;
		const variable = resolveVariable(sourceCode, expression);
		if (variable === null || visited.has(variable)) return false;
		visited.add(variable);
		return variable.defs.some((definition) =>
			definition.type === "Variable" &&
			definition.node.type === "VariableDeclarator" &&
			definition.node.init !== null &&
			isProcessExpression(sourceCode, definition.node.init, visited),
		);
	}
	if (
		expression.type !== "MemberExpression" ||
		expression.computed && (expression.property.type !== "Literal" || expression.property.value !== "process") ||
		!expression.computed && (expression.property.type !== "Identifier" || expression.property.name !== "process") ||
		expression.object.type !== "Identifier" ||
		(expression.object.name !== "globalThis" && expression.object.name !== "global")
	) return false;
	return isGlobalIdentifier(sourceCode, expression.object);
}

/** Read environment configuration at a host/composition boundary, not from domain modules. */
export const noDirectProcessEnvRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow direct process.env reads outside configured host and composition modules.",
		},
		messages: {
			processEnv:
				"Read and validate process.env at a host boundary, then pass typed configuration inward.",
		},
			schema: [
			{
				type: "object",
				properties: {
					sourceRoot: { type: "string" },
					sourceRoots: { type: "array", items: { type: "string" } },
					allowedPathFragments: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions,
	},
	createOnce(context) {
		let sourceFile = false;
		let allowedBoundary = false;

		return {
			Program() {
				const option = context.options?.[0] as RuleOptions[0] | undefined;
				const sourceRoots =
					Array.isArray(option?.sourceRoots) && option.sourceRoots.every((root) => typeof root === "string")
						? option.sourceRoots
						: [option?.sourceRoot ?? defaultOptions[0].sourceRoot].filter(
							(root): root is string => typeof root === "string",
						);
				const allowedPathFragments =
					option?.allowedPathFragments ?? defaultOptions[0].allowedPathFragments ?? [];
				const filename = normalized(context.filename);
				sourceFile = sourceRoots.some((root) => filename.includes(`/${normalized(root)}/`));
				allowedBoundary = allowedPathFragments.some((fragment) => filename.includes(fragment));
			},
			MemberExpression(node: ESTree.MemberExpression) {
					if (!sourceFile || allowedBoundary || isTestSupportFile(context.filename)) return;
					if (
						isProcessExpression(context.sourceCode, node.object) &&
						((!node.computed && node.property.type === "Identifier" && node.property.name === "env") ||
							(node.computed && node.property.type === "Literal" && node.property.value === "env"))
				) {
					context.report({ node, messageId: "processEnv" });
				}
			},
		};
	},
});
