import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isPathWithin } from "../../shared/module-path.ts";

import { isConfiguredBoundaryFile, isTestSupportFile } from "../../shared/file-scope.ts";

type RuleOptions = [{ sourceRoot?: string; sourceRoots?: string[]; allowedPathFragments?: string[]; allowedFiles?: string[]; allowedDirectories?: string[] }];

const defaultOptions: RuleOptions = [{}];

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

function enclosingFunctionScope(scope: Scope | null): Scope | null {
	while (scope !== null && scope.type !== "function") scope = scope.upper;
	return scope;
}

function isAncestorFunction(ancestor: Scope | null, descendant: Scope | null): boolean {
	if (ancestor === null) return true;
	let scope = descendant;
	while (scope !== null) {
		if (scope === ancestor) return true;
		scope = scope.upper;
	}
	return false;
}

function isConditionallyExecuted(identifier: ESTree.Node): boolean {
	let current: ESTree.Node = identifier;
	while (current.parent !== null) {
		const parent: ESTree.Node = current.parent;
		if (
			parent.type === "IfStatement" && (parent.consequent === current || parent.alternate === current) ||
			parent.type === "ConditionalExpression" && (parent.consequent === current || parent.alternate === current) ||
			parent.type === "LogicalExpression" && parent.right === current ||
			parent.type === "SwitchCase" ||
			parent.type === "ForStatement" || parent.type === "ForInStatement" || parent.type === "ForOfStatement" ||
			parent.type === "WhileStatement" || parent.type === "DoWhileStatement" ||
			parent.type === "TryStatement" || parent.type === "CatchClause"
		) return true;
		if (parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ArrowFunctionExpression") {
			return false;
		}
		current = parent;
	}
	return false;
}

function writesBefore(
	sourceCode: SourceCode,
	variable: Variable,
	identifier: ESTree.IdentifierReference,
) {
	const useFunction = enclosingFunctionScope(sourceCode.getScope(identifier));
	let definite: (typeof variable.references)[number] | null = null;
	const conditional: (typeof variable.references)[number][] = [];
	const references = variable.references
		.filter((reference) => reference.isWrite() && reference.identifier.start <= identifier.start)
		.sort((left, right) => left.identifier.start - right.identifier.start);
	for (const reference of references) {
		const writeFunction = enclosingFunctionScope(reference.from);
		if (!isAncestorFunction(writeFunction, useFunction)) continue;
		if (isConditionallyExecuted(reference.identifier)) {
			conditional.push(reference);
		} else {
			definite = reference;
			conditional.length = 0;
		}
	}
	return { definite, conditional };
}

function unwrapProcessExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression" ||
		current.type === "TSInstantiationExpression" ||
		current.type === "ChainExpression"
	) {
		current = current.expression;
	}
	return current;
}

function staticPropertyName(node: ESTree.MemberExpression): string | null {
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	if (!node.computed) return null;
	if (node.property.type === "Literal" && typeof node.property.value === "string") return node.property.value;
	return node.property.type === "TemplateLiteral" && node.property.expressions.length === 0 && node.property.quasis.length === 1
		? node.property.quasis[0]?.value.cooked ?? node.property.quasis[0]?.value.raw ?? null
		: null;
}

function isProcessExpression(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	visited = new Set<Variable>(),
): boolean {
	expression = unwrapProcessExpression(expression);
	if (expression.type === "Identifier") {
		if (expression.name === "process" && isGlobalIdentifier(sourceCode, expression)) return true;
		const variable = resolveVariable(sourceCode, expression);
		if (variable === null || visited.has(variable)) return false;
		const writes = writesBefore(sourceCode, variable, expression);
		const nextVisited = new Set([...visited, variable]);
		return writes.definite?.writeExpr !== null && writes.definite?.writeExpr !== undefined &&
			isProcessExpression(sourceCode, writes.definite.writeExpr, nextVisited) ||
			writes.conditional.some((write) => write.writeExpr !== null &&
				isProcessExpression(sourceCode, write.writeExpr, nextVisited));
	}
	if (expression.type !== "MemberExpression" || staticPropertyName(expression) !== "process") return false;
	const object = unwrapProcessExpression(expression.object);
	return object.type === "Identifier" &&
		(object.name === "globalThis" || object.name === "global") &&
		isGlobalIdentifier(sourceCode, object);
}

function staticPatternPropertyName(property: ESTree.BindingProperty | ESTree.AssignmentTargetProperty): string | null {
	if (!property.computed && property.key.type === "Identifier") return property.key.name;
	if (property.key.type === "Literal" && typeof property.key.value === "string") return property.key.value;
	return property.key.type === "TemplateLiteral" && property.key.expressions.length === 0 && property.key.quasis.length === 1
		? property.key.quasis[0]?.value.cooked ?? property.key.quasis[0]?.value.raw ?? null
		: null;
}

function destructuresEnvironment(pattern: ESTree.BindingPattern | ESTree.AssignmentTarget): boolean {
	return pattern.type === "ObjectPattern" && pattern.properties.some(
		(property) => property.type === "Property" && staticPatternPropertyName(property) === "env",
	);
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
				"Load validated configuration through Config and ConfigProvider at application composition or configured Service construction. Reuse Schema constraints with Config.schema, then pass typed settings inward or capture them in the owning Service Layer instead of reading process.env in domain code.",
		},
			schema: [
			{
				type: "object",
				properties: {
					sourceRoot: { type: "string" },
					sourceRoots: { type: "array", items: { type: "string" } },
					allowedPathFragments: { type: "array", items: { type: "string" } },
					allowedFiles: { type: "array", items: { type: "string" } },
					allowedDirectories: { type: "array", items: { type: "string" } },
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
				sourceFile = (option?.sourceRoots === undefined && option?.sourceRoot === undefined) || sourceRoots.some((root) => isPathWithin(context.filename, root, context.cwd));
				allowedBoundary = isConfiguredBoundaryFile(context.filename, option, context.cwd);
			},
			MemberExpression(node: ESTree.MemberExpression) {
					if (!sourceFile || allowedBoundary || isTestSupportFile(context.filename)) return;
					if (
						isProcessExpression(context.sourceCode, node.object) &&
						staticPropertyName(node) === "env"
				) {
					context.report({ node, messageId: "processEnv" });
				}
			},
			AssignmentExpression(node: ESTree.AssignmentExpression) {
				if (!sourceFile || allowedBoundary || isTestSupportFile(context.filename)) return;
				if (destructuresEnvironment(node.left) && isProcessExpression(context.sourceCode, node.right)) {
					context.report({ node, messageId: "processEnv" });
				}
			},
			VariableDeclarator(node: ESTree.VariableDeclarator) {
				if (!sourceFile || allowedBoundary || isTestSupportFile(context.filename)) return;
				if (node.init !== null && destructuresEnvironment(node.id) &&
					isProcessExpression(context.sourceCode, node.init)) {
					context.report({ node, messageId: "processEnv" });
				}
			},
		};
	},
});
