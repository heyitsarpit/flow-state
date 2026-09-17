import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";
import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];

const defaultSourceRoots = ["packages/flow-state-rewrite/src"] as const;

const statefulContainerNames = new Set(["Map", "Set"]);
const mutatingArrayMethods = new Set([
	"copyWithin",
	"fill",
	"pop",
	"push",
	"reverse",
	"shift",
	"sort",
	"splice",
	"unshift",
]);

function isProgramDeclaration(node: ESTree.VariableDeclaration): boolean {
	return node.parent.type === "Program" || node.parent.type === "ExportNamedDeclaration";
}

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.Identifier): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function isStatefulContainer(node: ESTree.Expression | null): boolean {
	if (node?.type !== "NewExpression" || node.callee.type !== "Identifier") return false;
	return statefulContainerNames.has(node.callee.name);
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

function isMutableLiteral(node: ESTree.Expression | null): "array" | "object" | null {
	const expression = node === null ? null : unwrapExpression(node);
	if (expression?.type === "ArrayExpression") return "array";
	if (expression?.type === "ObjectExpression") return "object";
	return null;
}

function rootIdentifier(node: ESTree.Expression): ESTree.Identifier | null {
	let current = unwrapExpression(node);
	while (current.type === "MemberExpression") {
		if (current.object.type === "Super") return null;
		current = unwrapExpression(current.object);
	}
	return current.type === "Identifier" ? current : null;
}

function memberName(node: ESTree.MemberExpression): string | null {
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") {
		return node.property.value;
	}
	return null;
}

/** Keep mutable test state fresh for each fixture instead of sharing it across tests. */
export const noTestModuleStateRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow shared mutable test state at module scope; fixtures need fresh counters and stateful containers.",
		},
		messages: {
			moduleState:
				"Move mutable test state inside makeFixture or beforeEach so every test gets fresh counters, object/array storage, and Map/Set containers; retain WeakMap/WeakSet only for intentional identity or provenance stores.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoots: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ sourceRoots: [...defaultSourceRoots] }] satisfies RuleOptions,
	},
	createOnce(context) {
		let enabled = false;
		const mutableStorage = new Map<Variable, "array" | "object">();
		const reportedStorage = new Set<Variable>();
		const reportStorage = (variable: Variable, node: ESTree.Node) => {
			if (reportedStorage.has(variable)) return;
			reportedStorage.add(variable);
			context.report({ node, messageId: "moduleState" });
		};

		return {
			Program() {
				const option = context.options?.[0];
				const rawSourceRoots =
					typeof option === "object" && option !== null && !Array.isArray(option)
						? option.sourceRoots
						: undefined;
				const sourceRoots =
					Array.isArray(rawSourceRoots) &&
					rawSourceRoots.every((root): root is string => typeof root === "string")
						? rawSourceRoots
						: defaultSourceRoots;
				enabled =
					sourceRoots.some((root) => isPathWithin(context.filename, root)) &&
					isTestSupportFile(context.filename);
			},
			VariableDeclaration(node: ESTree.VariableDeclaration) {
				if (!enabled || node.declare === true || !isProgramDeclaration(node)) return;

				const hasMutableBinding = node.kind === "let" || node.kind === "var";
				const hasStatefulContainer = node.declarations.some((declaration) =>
					isStatefulContainer(declaration.init),
				);
				if (hasMutableBinding || hasStatefulContainer) {
					context.report({ node, messageId: "moduleState" });
				}
				for (const declaration of node.declarations) {
					if (declaration.id.type !== "Identifier") continue;
					const storage = isMutableLiteral(declaration.init);
					if (storage === null) continue;
					const variable = resolveVariable(context.sourceCode, declaration.id);
					if (variable !== null) mutableStorage.set(variable, storage);
				}
			},
			AssignmentExpression(node: ESTree.AssignmentExpression) {
				if (!enabled || node.left.type !== "MemberExpression") return;
				const root = rootIdentifier(node.left);
				if (root === null) return;
				const variable = resolveVariable(context.sourceCode, root);
				if (variable !== null && mutableStorage.has(variable)) reportStorage(variable, node);
			},
			UpdateExpression(node: ESTree.UpdateExpression) {
				if (!enabled || node.argument.type !== "MemberExpression") return;
				const root = rootIdentifier(node.argument);
				if (root === null) return;
				const variable = resolveVariable(context.sourceCode, root);
				if (variable !== null && mutableStorage.has(variable)) reportStorage(variable, node);
			},
			UnaryExpression(node: ESTree.UnaryExpression) {
				if (!enabled || node.operator !== "delete" || node.argument.type !== "MemberExpression") return;
				const root = rootIdentifier(node.argument);
				if (root === null) return;
				const variable = resolveVariable(context.sourceCode, root);
				if (variable !== null && mutableStorage.has(variable)) reportStorage(variable, node);
			},
			CallExpression(node: ESTree.CallExpression) {
				if (!enabled || node.callee.type !== "MemberExpression") return;
				const root = rootIdentifier(node.callee);
				if (root === null || !mutatingArrayMethods.has(memberName(node.callee) ?? "")) return;
				const variable = resolveVariable(context.sourceCode, root);
				if (variable !== null && mutableStorage.get(variable) === "array") reportStorage(variable, node);
			},
		};
	},
});
