import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";
import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];

const defaultSourceRoots = [
	"packages/flow-state/src",
	"packages/flow-state-rewrite/src",
] as const;

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

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function isFunctionOrClassValue(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
	const value = unwrapExpression(expression);
	if (
		value.type === "ArrowFunctionExpression" ||
		value.type === "FunctionExpression" ||
		value.type === "ClassExpression"
	) {
		return true;
	}
	if (value.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, value);
	if (variable === null || seen.has(variable) || variable.defs.length !== 1) return false;
	const nextSeen = new Set(seen).add(variable);
	const definition = variable.defs[0];
	if (
		definition?.type === "Variable" &&
		definition.node.type === "VariableDeclarator" &&
		definition.node.init !== null
	) {
		return isFunctionOrClassValue(sourceCode, definition.node.init, nextSeen);
	}
	return (
		(definition?.type === "FunctionName" && definition.node.type === "FunctionDeclaration") ||
		(definition?.type === "ClassName" && definition.node.type === "ClassDeclaration")
	);
}

function isOperationNamespace(sourceCode: SourceCode, node: ESTree.ObjectExpression): boolean {
	return (
		node.properties.length > 0 &&
		node.properties.every((property) => {
			if (property.type !== "Property" || property.kind !== "init") return false;
			return property.method || isFunctionOrClassValue(sourceCode, property.value);
		})
  );
}

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
  for (const definition of variable.defs) {
    if (definition.type === "Variable" && definition.node.type === "VariableDeclarator") {
      return definition.node;
    }
  }
  return null;
}

function isMutableSurface(
  sourceCode: SourceCode,
  node: ESTree.Node,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
  if (
    node.type === "ParenthesizedExpression" ||
		node.type === "TSAsExpression" ||
		node.type === "TSSatisfiesExpression" ||
		node.type === "TSTypeAssertion" ||
		node.type === "TSNonNullExpression" ||
		node.type === "TSInstantiationExpression"
  ) {
    return isMutableSurface(sourceCode, node.expression, seen);
  }
  if (node.type === "ObjectExpression") return !isOperationNamespace(sourceCode, node);
  if (node.type === "ArrayExpression") return true;
  if (node.type === "Identifier") {
    const variable = resolveVariable(sourceCode, node);
    if (variable === null || seen.has(variable)) return false;
    const declarator = variableDeclarator(variable);
    if (declarator?.init === null || declarator?.init === undefined) return false;
    return isMutableSurface(sourceCode, declarator.init, new Set(seen).add(variable));
  }
  return false;
}

/** Keep mutable object and array storage behind its owner instead of exposing a writable handle. */
export const noExportedMutableSurfaceRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow directly exported mutable object and array storage. Public mutation should remain behind its owning service or factory.",
		},
		messages: {
			exportedMutableSurface:
				"Do not export mutable object or array storage directly. Expose operations or a read-only snapshot, and keep mutation behind the owning service or factory.",
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
		const report = (node: ESTree.Node) =>
			context.report({ node, messageId: "exportedMutableSurface" });
		let sourceFile = false;

		return {
			Program(node: ESTree.Program) {
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
				sourceFile =
					sourceRoots.some((root) => isPathWithin(context.filename, root)) &&
					!isTestSupportFile(context.filename);
				if (!sourceFile) return;
				for (const statement of node.body) {
					if (statement.type === "ExportNamedDeclaration") {
						if (statement.declaration?.type === "VariableDeclaration") {
							for (const declarator of statement.declaration.declarations) {
								if (
									declarator.init !== null &&
									isMutableSurface(context.sourceCode, declarator.init)
								) {
									report(declarator.init);
								}
							}
						}
						if (statement.source === null && statement.exportKind !== "type") {
							for (const specifier of statement.specifiers) {
								if (specifier.exportKind === "type") continue;
								if (specifier.local.type === "Identifier" && isMutableSurface(context.sourceCode, specifier.local))
									report(specifier);
							}
						}
					} else if (statement.type === "ExportDefaultDeclaration") {
						const declaration = statement.declaration;
						if (declaration.type === "Identifier") {
							if (isMutableSurface(context.sourceCode, declaration)) report(declaration);
						} else if (declaration.type !== "FunctionDeclaration" && declaration.type !== "ClassDeclaration") {
							if (isMutableSurface(context.sourceCode, declaration)) report(declaration);
						}
					}
				}
			},
		};
	},
});
